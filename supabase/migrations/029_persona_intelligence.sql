-- Persona intelligence for local/internal buyer-specific marketing judgment.
-- These rows let quality review and future agents score assets against a
-- concrete buyer mind instead of a loose audience string.

create table if not exists public.personas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  role text,
  description text,
  pain_points text[] not null default '{}',
  objections text[] not null default '{}',
  buying_triggers text[] not null default '{}',
  desired_outcomes text[] not null default '{}',
  vocabulary text[] not null default '{}',
  preferred_channels text[] not null default '{}',
  skepticism_level text not null default 'medium' check (skepticism_level in ('low', 'medium', 'high')),
  is_primary boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'inferred', 'agent')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personas_project on public.personas(project_id, is_primary desc, created_at);
create index if not exists personas_user on public.personas(user_id);

create unique index if not exists personas_one_primary_per_project
  on public.personas(project_id)
  where is_primary;

alter table public.personas enable row level security;

drop policy if exists "Users can manage own personas" on public.personas;
create policy "Users can manage own personas"
  on public.personas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists personas_updated_at on public.personas;
create trigger personas_updated_at before update on public.personas
  for each row execute function update_updated_at();

notify pgrst, 'reload schema';
