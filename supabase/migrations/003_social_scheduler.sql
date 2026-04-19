-- ================================
-- SOCIAL ACCOUNTS
-- ================================
create table social_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  platform text not null check (platform in ('twitter', 'linkedin', 'instagram')),
  account_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  metadata jsonb not null default '{}',
  connected_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index social_accounts_project on social_accounts(user_id, project_id);

alter table social_accounts enable row level security;
create policy "Users can manage own accounts" on social_accounts for all using (auth.uid() = user_id);

create trigger social_accounts_updated_at before update on social_accounts
  for each row execute function update_updated_at();

-- ================================
-- SOCIAL POSTS
-- ================================
create table social_posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  platform text not null,
  content text not null,
  media_urls text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  engagement jsonb not null default '{}',
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index social_posts_project on social_posts(user_id, project_id);
create index social_posts_status on social_posts(status);
create index social_posts_scheduled on social_posts(scheduled_at) where status = 'scheduled';

alter table social_posts enable row level security;
create policy "Users can manage own posts" on social_posts for all using (auth.uid() = user_id);

create trigger social_posts_updated_at before update on social_posts
  for each row execute function update_updated_at();
