-- Founder voice samples (per-user, used by all projects)
create table if not exists founder_voice (
  user_id uuid primary key references auth.users(id) on delete cascade,
  samples text[] not null default '{}',
  style_notes text,
  updated_at timestamptz not null default now()
);

alter table founder_voice enable row level security;
create policy "users manage own voice" on founder_voice for all using (auth.uid() = user_id);

-- Winning-asset memory: marked outputs that future generations should emulate
create table if not exists style_references (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  asset_kind text not null,
  asset_content text not null,
  why_good text,
  metric_proof text,
  created_at timestamptz not null default now()
);

alter table style_references enable row level security;
create policy "users manage own style refs" on style_references for all using (auth.uid() = user_id);

create index if not exists style_references_user_kind on style_references(user_id, asset_kind);
