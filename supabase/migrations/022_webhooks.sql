-- Outbound webhooks: customers register an endpoint, GrowthOS POSTs signed
-- events when things happen (ingest completes, lead captured, etc).

create table if not exists webhook_endpoints (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  url text not null,
  -- Plaintext signing secret. The customer holds the matching value on their
  -- server to verify incoming HMACs. We never expose it to anyone but the
  -- owning user, so storing in plaintext (RLS-gated) is the same trust
  -- boundary as the API keys table.
  secret text not null,
  events text[] not null default '{}',
  active boolean not null default true,
  consecutive_failures int not null default 0,
  last_delivery_at timestamptz,
  last_delivery_status text check (last_delivery_status in ('success', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table webhook_endpoints enable row level security;
create policy "users manage own webhook endpoints"
  on webhook_endpoints for all
  using (auth.uid() = user_id);

create index if not exists webhook_endpoints_user on webhook_endpoints(user_id);
create index if not exists webhook_endpoints_project_active
  on webhook_endpoints(project_id)
  where active = true;

create table if not exists webhook_deliveries (
  id uuid primary key default uuid_generate_v4(),
  endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
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

alter table webhook_deliveries enable row level security;
-- Owners read deliveries via the endpoint they own. No insert policy: writes
-- come from the service role (emit + dispatcher).
create policy "users read own webhook deliveries"
  on webhook_deliveries for select
  using (exists (
    select 1 from webhook_endpoints we
    where we.id = endpoint_id and we.user_id = auth.uid()
  ));

-- Drain hot path: only rows the cron will actually touch.
create index if not exists webhook_deliveries_drain
  on webhook_deliveries(next_attempt_at)
  where status in ('pending', 'delivering');

create index if not exists webhook_deliveries_endpoint_recent
  on webhook_deliveries(endpoint_id, created_at desc);
