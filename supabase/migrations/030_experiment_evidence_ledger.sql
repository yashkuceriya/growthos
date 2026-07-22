-- Durable experiment history for the internal marketing operating loop.
-- Design fields are snapshotted at creation; application APIs only mutate
-- lifecycle and observed-result fields after that point.

create table if not exists public.marketing_experiments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  persona_id uuid references public.personas(id) on delete set null,
  name text not null,
  hypothesis text not null,
  variable text not null,
  control text not null,
  treatment text not null,
  primary_metric text not null,
  guardrail_metric text not null,
  target_improvement_pct numeric(8, 3) not null check (target_improvement_pct > 0),
  planned_duration_days integer not null check (planned_duration_days between 1 and 365),
  minimum_sample_per_variant integer not null check (minimum_sample_per_variant > 0),
  decision_rule text not null,
  channel text,
  status text not null default 'ready' check (status in ('draft', 'ready', 'running', 'analyzing', 'decided', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'sprint', 'campaign', 'agent')),
  source_key text,
  design_snapshot jsonb not null default '{}',
  started_at timestamptz,
  ended_at timestamptz,
  control_exposures integer not null default 0 check (control_exposures >= 0),
  treatment_exposures integer not null default 0 check (treatment_exposures >= 0),
  control_value numeric(18, 6),
  treatment_value numeric(18, 6),
  guardrail_control_value numeric(18, 6),
  guardrail_treatment_value numeric(18, 6),
  observed_lift_pct numeric(12, 4),
  decision text check (decision is null or decision in ('promote_control', 'promote_treatment', 'iterate', 'inconclusive', 'stop')),
  conclusion text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (status not in ('running', 'analyzing', 'decided', 'archived') or started_at is not null),
  check (status not in ('decided', 'archived') or (
    ended_at is not null and decision is not null and conclusion is not null
    and control_value is not null and treatment_value is not null
  ))
);

create index if not exists marketing_experiments_project_status
  on public.marketing_experiments(project_id, status, updated_at desc);
create index if not exists marketing_experiments_campaign
  on public.marketing_experiments(campaign_id)
  where campaign_id is not null;
create unique index if not exists marketing_experiments_project_source
  on public.marketing_experiments(project_id, source_key)
  where source_key is not null;

alter table public.marketing_experiments enable row level security;

drop policy if exists "Users can manage own marketing experiments" on public.marketing_experiments;
create policy "Users can manage own marketing experiments"
  on public.marketing_experiments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.guard_marketing_experiment_design()
returns trigger
language plpgsql
as $$
begin
  if row(
    new.user_id, new.project_id, new.campaign_id, new.persona_id, new.name,
    new.hypothesis, new.variable, new.control, new.treatment, new.primary_metric,
    new.guardrail_metric, new.target_improvement_pct, new.planned_duration_days,
    new.minimum_sample_per_variant, new.decision_rule, new.channel, new.source,
    new.source_key, new.design_snapshot
  ) is distinct from row(
    old.user_id, old.project_id, old.campaign_id, old.persona_id, old.name,
    old.hypothesis, old.variable, old.control, old.treatment, old.primary_metric,
    old.guardrail_metric, old.target_improvement_pct, old.planned_duration_days,
    old.minimum_sample_per_variant, old.decision_rule, old.channel, old.source,
    old.source_key, old.design_snapshot
  ) then
    raise exception 'Experiment design is immutable; create a new experiment iteration instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_experiments_guard_design on public.marketing_experiments;
create trigger marketing_experiments_guard_design before update on public.marketing_experiments
  for each row execute function public.guard_marketing_experiment_design();

drop trigger if exists marketing_experiments_updated_at on public.marketing_experiments;
create trigger marketing_experiments_updated_at before update on public.marketing_experiments
  for each row execute function update_updated_at();

notify pgrst, 'reload schema';
