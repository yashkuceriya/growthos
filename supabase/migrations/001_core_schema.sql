-- Enable extensions
create extension if not exists "uuid-ossp";

-- Updated at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ================================
-- PROFILES
-- ================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ================================
-- PROJECTS
-- ================================
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  website text,
  logo_url text,
  brand_voice jsonb not null default '{}',
  target_audiences jsonb not null default '[]',
  competitors jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index projects_user_slug on projects(user_id, slug);
create index projects_user_id on projects(user_id);

alter table projects enable row level security;
create policy "Users can manage own projects" on projects for all using (auth.uid() = user_id);

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();

-- ================================
-- CAMPAIGNS
-- ================================
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  channels text[] not null default '{}',
  budget_planned numeric(12, 2),
  budget_currency text not null default 'USD',
  start_date date,
  end_date date,
  kpis jsonb not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_project on campaigns(user_id, project_id);
create index campaigns_status on campaigns(status);

alter table campaigns enable row level security;
create policy "Users can manage own campaigns" on campaigns for all using (auth.uid() = user_id);

create trigger campaigns_updated_at before update on campaigns
  for each row execute function update_updated_at();

-- ================================
-- CAMPAIGN METRICS
-- ================================
create table campaign_metrics (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  channel text not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  conversions integer not null default 0,
  spend numeric(10, 2) not null default 0,
  revenue numeric(10, 2) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index campaign_metrics_campaign_date on campaign_metrics(campaign_id, date);
create index campaign_metrics_channel on campaign_metrics(channel);

alter table campaign_metrics enable row level security;
create policy "Users can manage own metrics" on campaign_metrics for all using (auth.uid() = user_id);

-- ================================
-- AD BRIEFS
-- ================================
create table ad_briefs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  platform text not null check (platform in ('meta', 'google', 'linkedin', 'tiktok')),
  audience_segment text not null,
  product_offer text not null,
  campaign_goal text not null check (campaign_goal in ('awareness', 'conversion', 'engagement')),
  tone text,
  competitor_context text[] not null default '{}',
  subject_focus text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ad_briefs enable row level security;
create policy "Users can manage own briefs" on ad_briefs for all using (auth.uid() = user_id);

create trigger ad_briefs_updated_at before update on ad_briefs
  for each row execute function update_updated_at();

-- ================================
-- AD COPIES
-- ================================
create table ad_copies (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_id uuid not null references ad_briefs(id) on delete cascade,
  iteration_number integer not null,
  primary_text text,
  headline text,
  description text,
  cta_button text,
  status text not null default 'iterating' check (status in (
    'iterating', 'generated', 'evaluator_pass', 'compliance_pass',
    'human_approved', 'experiment_ready', 'below_threshold', 'rejected'
  )),
  evaluation_scores jsonb not null default '{}',
  weighted_average numeric(4, 2),
  compliance jsonb,
  refinement_feedback text,
  is_best boolean not null default false,
  early_stopped boolean not null default false,
  early_stop_reason text,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_copies_brief on ad_copies(brief_id, iteration_number);
create index ad_copies_status on ad_copies(status);

alter table ad_copies enable row level security;
create policy "Users can manage own ad copies" on ad_copies for all using (auth.uid() = user_id);

create trigger ad_copies_updated_at before update on ad_copies
  for each row execute function update_updated_at();

-- ================================
-- AD INSIGHTS
-- ================================
create table ad_insights (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  audience_segment text,
  campaign_goal text,
  dimension text,
  insight_type text not null check (insight_type in ('winning_pattern', 'weak_dimension', 'refinement_tip', 'top_performer')),
  insight_text text not null,
  evidence jsonb not null default '{}',
  sample_count integer not null default 1,
  avg_score_impact numeric(4, 2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ad_insights enable row level security;
create policy "Users can manage own insights" on ad_insights for all using (auth.uid() = user_id);

create trigger ad_insights_updated_at before update on ad_insights
  for each row execute function update_updated_at();

-- ================================
-- AI COST LEDGER
-- ================================
create table ai_cost_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  module text not null,
  step_name text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms numeric(10, 2),
  cost_usd numeric(10, 6),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index ai_cost_ledger_module on ai_cost_ledger(module);
create index ai_cost_ledger_project on ai_cost_ledger(project_id);
create index ai_cost_ledger_created on ai_cost_ledger(created_at);

alter table ai_cost_ledger enable row level security;
create policy "Users can view own costs" on ai_cost_ledger for select using (auth.uid() = user_id);
create policy "Users can insert own costs" on ai_cost_ledger for insert with check (auth.uid() = user_id);
