-- DevExplore: shared cache for a user's project insights (release timeline + tech-stack radar).
-- Same security model as the report cache: RLS on, no table privileges for browser roles, only narrow
-- SECURITY DEFINER functions are exposed. Requires the earlier migrations (it reuses
-- public.github_profile_refresh_locks and public.devscope_normalize_username).
-- Lock keys look like 'insights:<username>'.

create table if not exists public.github_insights_cache (
  username   text primary key
             check (
               username = lower(username)
               and username ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'
               and username !~ '--'
             ),
  insights   jsonb       not null check (jsonb_typeof(insights) = 'object'),
  fetched_at timestamptz not null default now()
);

alter table public.github_insights_cache enable row level security;
revoke all on public.github_insights_cache from public, anon, authenticated;

create or replace function public.get_cached_insights(p_username text)
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
  select jsonb_build_object('insights', c.insights, 'fetched_at', c.fetched_at)
    into v_result
    from public.github_insights_cache c
   where c.username = v_username;
  return v_result;
end;
$$;

create or replace function public.acquire_insights_refresh_lock(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key      text := 'insights:' || public.devscope_normalize_username(p_username);
  v_acquired boolean;
begin
  delete from public.github_profile_refresh_locks where locked_until < now() - interval '1 hour';

  -- Building insights fans out to many GitHub / registry calls, so the lock is held longer.
  insert into public.github_profile_refresh_locks as l (username, locked_until)
  values (v_key, now() + interval '45 seconds')
  on conflict (username) do update
    set locked_until = excluded.locked_until
    where l.locked_until <= now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_insights_refresh_lock(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'insights:' || public.devscope_normalize_username(p_username);
begin
  delete from public.github_profile_refresh_locks where username = v_key;
end;
$$;

-- Validation: an object of at most 64 KB that belongs to p_username with the expected sections.
-- Throttle: a row refreshed within the last minute is never overwritten.
create or replace function public.upsert_cached_insights(p_username text, p_insights jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username   text := public.devscope_normalize_username(p_username);
  v_fetched_at timestamptz;
begin
  if p_insights is null or jsonb_typeof(p_insights) <> 'object' then
    raise exception 'invalid_insights' using errcode = '22023';
  end if;
  if octet_length(p_insights::text) > 65536 then
    raise exception 'insights_too_large' using errcode = '22023';
  end if;
  if lower(coalesce(p_insights ->> 'login', '')) <> v_username
     or jsonb_typeof(p_insights -> 'releases' -> 'items') <> 'array'
     or jsonb_typeof(p_insights -> 'stack' -> 'packages') <> 'array' then
    raise exception 'insights_mismatch' using errcode = '22023';
  end if;

  insert into public.github_insights_cache as c (username, insights, fetched_at)
  values (v_username, p_insights, now())
  on conflict (username) do update
    set insights = excluded.insights,
        fetched_at = excluded.fetched_at
    where c.fetched_at < now() - interval '1 minute'
  returning fetched_at into v_fetched_at;

  if v_fetched_at is null then
    select c.fetched_at into v_fetched_at
      from public.github_insights_cache c
     where c.username = v_username;
  end if;

  delete from public.github_profile_refresh_locks where username = 'insights:' || v_username;
  return v_fetched_at;
end;
$$;

revoke all on function public.get_cached_insights(text)                from public;
revoke all on function public.acquire_insights_refresh_lock(text)      from public;
revoke all on function public.release_insights_refresh_lock(text)      from public;
revoke all on function public.upsert_cached_insights(text, jsonb)      from public;

grant execute on function public.get_cached_insights(text)             to anon, authenticated;
grant execute on function public.acquire_insights_refresh_lock(text)   to anon, authenticated;
grant execute on function public.release_insights_refresh_lock(text)   to anon, authenticated;
grant execute on function public.upsert_cached_insights(text, jsonb)   to anon, authenticated;
