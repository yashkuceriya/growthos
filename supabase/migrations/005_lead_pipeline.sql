-- ================================
-- LANDING PAGES
-- ================================
create table landing_pages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  name text not null,
  slug text not null,
  template jsonb not null default '{}',
  published boolean not null default false,
  visits integer not null default 0,
  conversions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index landing_pages_slug on landing_pages(slug);

alter table landing_pages enable row level security;
create policy "Users can manage own pages" on landing_pages for all using (auth.uid() = user_id);

create trigger landing_pages_updated_at before update on landing_pages
  for each row execute function update_updated_at();

-- ================================
-- LEADS
-- ================================
create table leads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  email text not null,
  name text,
  source text,
  source_id uuid,
  score integer not null default 0,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost')),
  metadata jsonb not null default '{}',
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_project_status on leads(project_id, status);
create index leads_score on leads(score desc);

alter table leads enable row level security;
create policy "Users can manage own leads" on leads for all using (auth.uid() = user_id);

create trigger leads_updated_at before update on leads
  for each row execute function update_updated_at();

-- ================================
-- LEAD EVENTS
-- ================================
create table lead_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index lead_events_lead on lead_events(lead_id);

-- RLS via lead ownership
alter table lead_events enable row level security;
create policy "Users can manage events via lead" on lead_events for all
  using (exists (select 1 from leads where leads.id = lead_events.lead_id and leads.user_id = auth.uid()));
