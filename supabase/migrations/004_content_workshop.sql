create table content_pieces (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  title text not null,
  slug text,
  body_markdown text,
  body_html text,
  content_type text not null default 'blog_post' check (content_type in ('blog_post', 'landing_page', 'case_study', 'whitepaper')),
  status text not null default 'idea' check (status in ('idea', 'drafting', 'review', 'published', 'archived')),
  seo_score numeric(4,2),
  seo_data jsonb not null default '{}',
  target_keywords text[] not null default '{}',
  word_count integer not null default 0,
  published_at timestamptz,
  performance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_pieces_project on content_pieces(user_id, project_id);
create index content_pieces_status on content_pieces(status);

alter table content_pieces enable row level security;
create policy "Users can manage own content" on content_pieces for all using (auth.uid() = user_id);

create trigger content_pieces_updated_at before update on content_pieces
  for each row execute function update_updated_at();
