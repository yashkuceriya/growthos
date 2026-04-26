-- Background queue for project ingest. Replaces the v1 ingest route's
-- old synchronous flow: callers now enqueue and poll a job id.

create table if not exists ingest_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
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

alter table ingest_jobs enable row level security;

-- Owners can read their own jobs (used by /api/v1/jobs/:id). Writes go through
-- the service role from the cron drainer + enqueue route.
create policy "users read own ingest jobs"
  on ingest_jobs for select
  using (auth.uid() = user_id);

-- Cron drain hot path: cheapest queued row, oldest first.
create index if not exists ingest_jobs_drain
  on ingest_jobs(created_at)
  where status = 'queued';

-- Per-user history queries (status panel, debugging).
create index if not exists ingest_jobs_user_recent
  on ingest_jobs(user_id, created_at desc);
