create table if not exists public.rate_limit_snapshots (
  captured_at timestamptz primary key,
  payload     jsonb       not null check (jsonb_typeof(payload) = 'object')
);

alter table public.rate_limit_snapshots enable row level security;
revoke all on public.rate_limit_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limit_snapshots to service_role;
