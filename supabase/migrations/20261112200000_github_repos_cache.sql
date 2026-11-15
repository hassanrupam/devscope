-- DevExplore: shared cache for a user's public repositories (slimmed to the fields the app uses).
-- Same security model as the other caches: RLS on, no policies, no table privileges for browser roles,
-- and only narrow SECURITY DEFINER functions are exposed. Requires the earlier migrations
-- (it reuses public.github_profile_refresh_locks and public.devscope_normalize_username).
-- Lock keys look like 'repos:<username>' (the colon can never appear in a GitHub username).

create table if not exists public.github_repos_cache (
  username   text primary key
             check (
               username = lower(username)
               and username ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'
               and username !~ '--'
             ),
  repos      jsonb       not null check (jsonb_typeof(repos) = 'array'),
  fetched_at timestamptz not null default now()
);

alter table public.github_repos_cache enable row level security;
revoke all on public.github_repos_cache from public, anon, authenticated;

create or replace function public.get_cached_repos(p_username text)
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
  select jsonb_build_object('repos', c.repos, 'fetched_at', c.fetched_at)
    into v_result
    from public.github_repos_cache c
   where c.username = v_username;
  return v_result;
end;
$$;

create or replace function public.acquire_repos_refresh_lock(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key      text := 'repos:' || public.devscope_normalize_username(p_username);
  v_acquired boolean;
begin
  delete from public.github_profile_refresh_locks where locked_until < now() - interval '1 hour';

  insert into public.github_profile_refresh_locks as l (username, locked_until)
  values (v_key, now() + interval '15 seconds')
  on conflict (username) do update
    set locked_until = excluded.locked_until
    where l.locked_until <= now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_repos_refresh_lock(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'repos:' || public.devscope_normalize_username(p_username);
begin
  delete from public.github_profile_refresh_locks where username = v_key;
end;
$$;

-- Validation: array of at most 100 objects, <=128 KB, and every repository must belong to the
-- user (its html_url must start with https://github.com/<username>/).
-- Throttle: a row refreshed within the last minute is never overwritten.
create or replace function public.upsert_cached_repos(p_username text, p_repos jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username   text := public.devscope_normalize_username(p_username);
  v_fetched_at timestamptz;
begin
  if p_repos is null or jsonb_typeof(p_repos) <> 'array' or jsonb_array_length(p_repos) > 100 then
    raise exception 'invalid_repos' using errcode = '22023';
  end if;
  if octet_length(p_repos::text) > 131072 then
    raise exception 'repos_too_large' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_repos) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'id') <> 'number'
        or lower(coalesce(e ->> 'html_url', '')) not like 'https://github.com/' || v_username || '/%'
  ) then
    raise exception 'repos_mismatch' using errcode = '22023';
  end if;

  insert into public.github_repos_cache as c (username, repos, fetched_at)
  values (v_username, p_repos, now())
  on conflict (username) do update
    set repos = excluded.repos,
        fetched_at = excluded.fetched_at
    where c.fetched_at < now() - interval '1 minute'
  returning fetched_at into v_fetched_at;

  if v_fetched_at is null then
    select c.fetched_at into v_fetched_at
      from public.github_repos_cache c
     where c.username = v_username;
  end if;

  delete from public.github_profile_refresh_locks where username = 'repos:' || v_username;
  return v_fetched_at;
end;
$$;

revoke all on function public.get_cached_repos(text)              from public;
revoke all on function public.acquire_repos_refresh_lock(text)    from public;
revoke all on function public.release_repos_refresh_lock(text)    from public;
revoke all on function public.upsert_cached_repos(text, jsonb)    from public;

grant execute on function public.get_cached_repos(text)           to anon, authenticated;
grant execute on function public.acquire_repos_refresh_lock(text) to anon, authenticated;
grant execute on function public.release_repos_refresh_lock(text) to anon, authenticated;
grant execute on function public.upsert_cached_repos(text, jsonb) to anon, authenticated;
