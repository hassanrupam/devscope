-- DevExplore: shared cache for a user's activity report (contribution calendar, collaboration
-- network, sentiment). The document is built by the github-proxy edge function and is small
-- (a few KB). Same security model as the other caches: RLS on, no policies, no table privileges for
-- browser roles, and only narrow SECURITY DEFINER functions are exposed. Requires the earlier
-- migrations (it reuses public.github_profile_refresh_locks and public.devscope_normalize_username).
-- Lock keys look like 'report:<username>' (the colon can never appear in a GitHub username).

create table if not exists public.github_report_cache (
  username   text primary key
             check (
               username = lower(username)
               and username ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'
               and username !~ '--'
             ),
  report     jsonb       not null check (jsonb_typeof(report) = 'object'),
  fetched_at timestamptz not null default now()
);

alter table public.github_report_cache enable row level security;
revoke all on public.github_report_cache from public, anon, authenticated;

create or replace function public.get_cached_report(p_username text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_username text := public.devscope_normalize_username(p_username);
  v_result   jsonb;
begin
  select jsonb_build_object('report', c.report, 'fetched_at', c.fetched_at)
    into v_result
    from public.github_report_cache c
   where c.username = v_username;
  return v_result;
end;
$$;

create or replace function public.acquire_report_refresh_lock(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key      text := 'report:' || public.devscope_normalize_username(p_username);
  v_acquired boolean;
begin
  delete from public.github_profile_refresh_locks where locked_until < now() - interval '1 hour';

  -- Building a report takes a few GitHub calls, so the lock is held a bit longer than for a profile.
  insert into public.github_profile_refresh_locks as l (username, locked_until)
  values (v_key, now() + interval '30 seconds')
  on conflict (username) do update
    set locked_until = excluded.locked_until
    where l.locked_until <= now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_report_refresh_lock(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'report:' || public.devscope_normalize_username(p_username);
begin
  delete from public.github_profile_refresh_locks where username = v_key;
end;
$$;

-- Validation: an object of at most 64 KB that really belongs to p_username and has the expected
-- top-level sections with a plausibly sized calendar.
-- Throttle: a row refreshed within the last minute is never overwritten.
create or replace function public.upsert_cached_report(p_username text, p_report jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username   text := public.devscope_normalize_username(p_username);
  v_fetched_at timestamptz;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  if octet_length(p_report::text) > 65536 then
    raise exception 'report_too_large' using errcode = '22023';
  end if;
  if lower(coalesce(p_report ->> 'login', '')) <> v_username
     or jsonb_typeof(p_report -> 'calendar' -> 'counts') <> 'array'
     or jsonb_array_length(p_report -> 'calendar' -> 'counts') > 400
     or jsonb_typeof(p_report -> 'collaboration') <> 'object'
     or jsonb_typeof(p_report -> 'sentiment') <> 'object' then
    raise exception 'report_mismatch' using errcode = '22023';
  end if;

  insert into public.github_report_cache as c (username, report, fetched_at)
  values (v_username, p_report, now())
  on conflict (username) do update
    set report = excluded.report,
        fetched_at = excluded.fetched_at
    where c.fetched_at < now() - interval '1 minute'
  returning fetched_at into v_fetched_at;

  if v_fetched_at is null then
    select c.fetched_at into v_fetched_at
      from public.github_report_cache c
     where c.username = v_username;
  end if;

  delete from public.github_profile_refresh_locks where username = 'report:' || v_username;
  return v_fetched_at;
end;
$$;

revoke all on function public.get_cached_report(text)              from public;
revoke all on function public.acquire_report_refresh_lock(text)    from public;
revoke all on function public.release_report_refresh_lock(text)    from public;
revoke all on function public.upsert_cached_report(text, jsonb)    from public;

grant execute on function public.get_cached_report(text)           to anon, authenticated;
grant execute on function public.acquire_report_refresh_lock(text) to anon, authenticated;
grant execute on function public.release_report_refresh_lock(text) to anon, authenticated;
grant execute on function public.upsert_cached_report(text, jsonb) to anon, authenticated;
