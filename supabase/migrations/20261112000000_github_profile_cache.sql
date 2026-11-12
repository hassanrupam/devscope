-- DevScope: shared GitHub profile cache.
--
-- Security model
--   * Tables have RLS enabled and NO policies, and all table privileges are revoked
--     from anon/authenticated. The browser can never read or write tables directly.
--   * The browser only calls four narrow SECURITY DEFINER functions. Each one
--     validates its input, because everything coming from the browser is untrusted.
--   * search_path is pinned to '' so function bodies cannot be hijacked.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.github_profile_cache (
  -- Lower-cased GitHub login. Same format rules GitHub enforces.
  username   text primary key
             check (
               username = lower(username)
               and username ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'
               and username !~ '--'
             ),
  profile    jsonb       not null check (jsonb_typeof(profile) = 'object'),
  fetched_at timestamptz not null default now()
);

-- Short-lived advisory "someone is already refreshing this user" markers.
create table if not exists public.github_profile_refresh_locks (
  username     text primary key,
  locked_until timestamptz not null
);

alter table public.github_profile_cache         enable row level security;
alter table public.github_profile_refresh_locks enable row level security;

-- No policies on purpose: with RLS on and no policy, non-owner roles get nothing.
revoke all on public.github_profile_cache         from public, anon, authenticated;
revoke all on public.github_profile_refresh_locks from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.devscope_normalize_username(p_username text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_username, '')));
begin
  if v !~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$' or v ~ '--' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public (browser-callable) functions
-- ---------------------------------------------------------------------------

-- Returns {"profile": {...}, "fetched_at": "..."} or NULL when not cached.
-- Expiry is decided by the client (configurable TTL), not here.
create or replace function public.get_cached_profile(p_username text)
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
  select jsonb_build_object('profile', c.profile, 'fetched_at', c.fetched_at)
    into v_result
    from public.github_profile_cache c
   where c.username = v_username;
  return v_result;
end;
$$;

-- Atomically claims the right to refresh a profile for 15 seconds.
-- Returns true if the caller got the lock, false if someone else holds it.
create or replace function public.acquire_profile_refresh_lock(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := public.devscope_normalize_username(p_username);
  v_acquired boolean;
begin
  -- Opportunistic cleanup so the lock table cannot grow without bound.
  delete from public.github_profile_refresh_locks where locked_until < now() - interval '1 hour';

  insert into public.github_profile_refresh_locks as l (username, locked_until)
  values (v_username, now() + interval '15 seconds')
  on conflict (username) do update
    set locked_until = excluded.locked_until
    where l.locked_until <= now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

-- Releases the lock without saving (used when the GitHub fetch failed).
create or replace function public.release_profile_refresh_lock(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := public.devscope_normalize_username(p_username);
begin
  delete from public.github_profile_refresh_locks where username = v_username;
end;
$$;

-- Saves a profile and releases the lock. Returns the server-side fetched_at.
-- Validation: shape, size, and that the profile really belongs to p_username.
-- Throttle: an existing row refreshed within the last minute is never overwritten,
-- which limits how fast anyone can churn a row with the public key.
create or replace function public.upsert_cached_profile(p_username text, p_profile jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username   text := public.devscope_normalize_username(p_username);
  v_fetched_at timestamptz;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'invalid_profile' using errcode = '22023';
  end if;
  if octet_length(p_profile::text) > 8192 then
    raise exception 'profile_too_large' using errcode = '22023';
  end if;
  if lower(coalesce(p_profile ->> 'login', '')) <> v_username
     or jsonb_typeof(p_profile -> 'id') <> 'number' then
    raise exception 'profile_mismatch' using errcode = '22023';
  end if;

  insert into public.github_profile_cache as c (username, profile, fetched_at)
  values (v_username, p_profile, now())
  on conflict (username) do update
    set profile = excluded.profile,
        fetched_at = excluded.fetched_at
    where c.fetched_at < now() - interval '1 minute'
  returning fetched_at into v_fetched_at;

  if v_fetched_at is null then
    -- Throttled: keep the existing row and report its timestamp.
    select c.fetched_at into v_fetched_at
      from public.github_profile_cache c
     where c.username = v_username;
  end if;

  delete from public.github_profile_refresh_locks where username = v_username;
  return v_fetched_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only these four functions are exposed to the browser roles.
-- ---------------------------------------------------------------------------

revoke all on function public.devscope_normalize_username(text)         from public, anon, authenticated;
revoke all on function public.get_cached_profile(text)                  from public;
revoke all on function public.acquire_profile_refresh_lock(text)        from public;
revoke all on function public.release_profile_refresh_lock(text)        from public;
revoke all on function public.upsert_cached_profile(text, jsonb)        from public;

grant execute on function public.get_cached_profile(text)               to anon, authenticated;
grant execute on function public.acquire_profile_refresh_lock(text)     to anon, authenticated;
grant execute on function public.release_profile_refresh_lock(text)     to anon, authenticated;
grant execute on function public.upsert_cached_profile(text, jsonb)     to anon, authenticated;
