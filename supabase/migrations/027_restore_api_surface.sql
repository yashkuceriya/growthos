-- Repair migration for restored/local Supabase projects.
--
-- Some restores can bring back the core marketing tables while missing the
-- later API, queue, webhook, idempotency, and rate-limit surface. This file is
-- intentionally idempotent so a local operator can paste/run it safely after a
-- partial restore, and normal migration runners can also apply it once.

create extension if not exists "uuid-ossp";

create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists api_keys_hash on public.api_keys(key_hash);
create index if not exists api_keys_user on public.api_keys(user_id);

alter table public.api_keys enable row level security;

drop policy if exists "Users can manage own api keys" on public.api_keys;
create policy "Users can manage own api keys"
  on public.api_keys for all
  using (auth.uid() = user_id);

create table if not exists public.ingest_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  attempts int not null default 0,
  error text,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ingest_jobs enable row level security;

drop policy if exists "users read own ingest jobs" on public.ingest_jobs;
create policy "users read own ingest jobs"
  on public.ingest_jobs for select
  using (auth.uid() = user_id);

create index if not exists ingest_jobs_drain
  on public.ingest_jobs(created_at)
  where status = 'queued';

create index if not exists ingest_jobs_user_recent
  on public.ingest_jobs(user_id, created_at desc);

create table if not exists public.webhook_endpoints (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  active boolean not null default true,
  consecutive_failures int not null default 0,
  last_delivery_at timestamptz,
  last_delivery_status text check (last_delivery_status in ('success', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.webhook_endpoints enable row level security;

drop policy if exists "users manage own webhook endpoints" on public.webhook_endpoints;
create policy "users manage own webhook endpoints"
  on public.webhook_endpoints for all
  using (auth.uid() = user_id);

create index if not exists webhook_endpoints_user
  on public.webhook_endpoints(user_id);

create index if not exists webhook_endpoints_project_active
  on public.webhook_endpoints(project_id)
  where active = true;

create table if not exists public.webhook_deliveries (
  id uuid primary key default uuid_generate_v4(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null,
  attempts int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'success', 'failed', 'exhausted')),
  response_status int,
  response_body text,
  error text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.webhook_deliveries enable row level security;

drop policy if exists "users read own webhook deliveries" on public.webhook_deliveries;
create policy "users read own webhook deliveries"
  on public.webhook_deliveries for select
  using (exists (
    select 1 from public.webhook_endpoints we
    where we.id = endpoint_id and we.user_id = auth.uid()
  ));

create index if not exists webhook_deliveries_drain
  on public.webhook_deliveries(next_attempt_at)
  where status in ('pending', 'delivering');

create index if not exists webhook_deliveries_endpoint_recent
  on public.webhook_deliveries(endpoint_id, created_at desc);

create table if not exists public.idempotency_records (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  key text not null,
  request_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  response_status int,
  response_body text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (api_key_id, key)
);

create index if not exists idempotency_records_created
  on public.idempotency_records(created_at);

create table if not exists public.api_key_rate_limits (
  api_key_id uuid primary key references public.api_keys(id) on delete cascade,
  tokens_remaining float8 not null,
  last_refill_at timestamptz not null default now()
);

create or replace function consume_rate_token(
  p_api_key_id uuid,
  p_burst float8,
  p_rate float8
) returns float8 as $$
declare
  v_remaining float8;
begin
  insert into public.api_key_rate_limits (api_key_id, tokens_remaining, last_refill_at)
  values (p_api_key_id, p_burst - 1.0, now())
  on conflict (api_key_id) do update
  set
    tokens_remaining = least(
      public.api_key_rate_limits.tokens_remaining
        + extract(epoch from (now() - public.api_key_rate_limits.last_refill_at)) * p_rate,
      p_burst
    ) - 1.0,
    last_refill_at = now()
  where
    least(
      public.api_key_rate_limits.tokens_remaining
        + extract(epoch from (now() - public.api_key_rate_limits.last_refill_at)) * p_rate,
      p_burst
    ) >= 1.0
  returning tokens_remaining into v_remaining;

  return v_remaining;
end;
$$ language plpgsql;

grant usage on schema public to anon, authenticated, service_role;

grant all on table public.api_keys to service_role;
grant all on table public.api_key_rate_limits to service_role;
grant all on table public.idempotency_records to service_role;
grant all on table public.ingest_jobs to service_role;
grant all on table public.webhook_endpoints to service_role;
grant all on table public.webhook_deliveries to service_role;

grant select, insert, update, delete on table public.api_keys to authenticated;
grant select on table public.ingest_jobs to authenticated;
grant select, insert, update, delete on table public.webhook_endpoints to authenticated;
grant select on table public.webhook_deliveries to authenticated;

grant execute on function consume_rate_token(uuid, float8, float8) to service_role;

notify pgrst, 'reload schema';
