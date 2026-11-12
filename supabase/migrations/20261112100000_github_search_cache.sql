-- DevScope: shared cache for "users whose login starts with <prefix>" searches.
-- Same security model as the profile cache: RLS on, no policies, no table privileges for
-- browser roles, and only narrow SECURITY DEFINER functions are exposed.
-- Refresh locks reuse public.github_profile_refresh_locks with keys of the form 'search:<prefix>'
-- (the colon can never appear in a GitHub username, so keys cannot collide).

create table if not exists public.github_search_cache (
  prefix     text primary key
             check (prefix = lower(prefix) and prefix ~ '^[a-z0-9][a-z0-9-]{0,38}$' and prefix !~ '--'),
  results    jsonb       not null check (jsonb_typeof(results) = 'array'),
  fetched_at timestamptz not null default now()
);

alter table public.github_search_cache enable row level security;
revoke all on public.github_search_cache from public, anon, authenticated;

create or replace function public.devscope_normalize_prefix(p_prefix text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_prefix, '')));
begin
  if v !~ '^[a-z0-9][a-z0-9-]{0,38}$' or v ~ '--' then
    raise exception 'invalid_prefix' using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.get_cached_search(p_prefix text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_prefix text := public.devscope_normalize_prefix(p_prefix);
  v_result jsonb;
begin
  select jsonb_build_object('results', c.results, 'fetched_at', c.fetched_at)
    into v_result
    from public.github_search_cache c
   where c.prefix = v_prefix;
  return v_result;
end;
$$;

create or replace function public.acquire_search_refresh_lock(p_prefix text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key      text := 'search:' || public.devscope_normalize_prefix(p_prefix);
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

create or replace function public.release_search_refresh_lock(p_prefix text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'search:' || public.devscope_normalize_prefix(p_prefix);
begin
  delete from public.github_profile_refresh_locks where username = v_key;
end;
$$;

-- Validation: array of at most 30 objects, <=16 KB, and every login must start with the prefix.
-- Throttle: a row refreshed within the last minute is never overwritten.
create or replace function public.upsert_cached_search(p_prefix text, p_results jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix     text := public.devscope_normalize_prefix(p_prefix);
  v_fetched_at timestamptz;
begin
  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 30 then
    raise exception 'invalid_results' using errcode = '22023';
  end if;
  if octet_length(p_results::text) > 16384 then
    raise exception 'results_too_large' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_results) e
     where jsonb_typeof(e) <> 'object'
        or left(lower(coalesce(e ->> 'login', '')), length(v_prefix)) <> v_prefix
        or jsonb_typeof(e -> 'id') <> 'number'
  ) then
    raise exception 'results_mismatch' using errcode = '22023';
  end if;

  insert into public.github_search_cache as c (prefix, results, fetched_at)
  values (v_prefix, p_results, now())
  on conflict (prefix) do update
    set results = excluded.results,
        fetched_at = excluded.fetched_at
    where c.fetched_at < now() - interval '1 minute'
  returning fetched_at into v_fetched_at;

  if v_fetched_at is null then
    select c.fetched_at into v_fetched_at
      from public.github_search_cache c
     where c.prefix = v_prefix;
  end if;

  delete from public.github_profile_refresh_locks where username = 'search:' || v_prefix;
  return v_fetched_at;
end;
$$;

revoke all on function public.devscope_normalize_prefix(text)         from public, anon, authenticated;
revoke all on function public.get_cached_search(text)                 from public;
revoke all on function public.acquire_search_refresh_lock(text)       from public;
revoke all on function public.release_search_refresh_lock(text)       from public;
revoke all on function public.upsert_cached_search(text, jsonb)       from public;

grant execute on function public.get_cached_search(text)              to anon, authenticated;
grant execute on function public.acquire_search_refresh_lock(text)    to anon, authenticated;
grant execute on function public.release_search_refresh_lock(text)    to anon, authenticated;
grant execute on function public.upsert_cached_search(text, jsonb)    to anon, authenticated;
