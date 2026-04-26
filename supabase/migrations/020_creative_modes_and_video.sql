-- ================================
-- CREATIVE MODES + VIDEO GENERATION (Bundle N)
-- ================================
-- Universal "mode" lever (funny / shocking / trending / etc) that flows into
-- ad copy, social copy, image, and video generation. Plus a video_renders
-- table tracking async jobs across multiple providers (fal / openai / xai).

-- Mode column on the things that generate creative
alter table ad_briefs    add column if not exists creative_mode text;
alter table social_posts add column if not exists creative_mode text;

-- Video output URLs + status alongside copy
alter table ad_copies    add column if not exists video_url text;
alter table ad_copies    add column if not exists video_render_id uuid;
alter table ad_copies    add column if not exists video_status text;

alter table social_posts add column if not exists video_url text;
alter table social_posts add column if not exists video_render_id uuid;
alter table social_posts add column if not exists video_status text;

-- Async render tracking. Providers return a request id; we poll until the
-- video URL lands or the provider reports failure.
create table if not exists video_renders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  model text not null,                              -- id from VIDEO_MODELS registry
  provider text not null,                           -- 'fal' | 'openai' | 'xai'
  provider_request_id text,                         -- the upstream job id, for polling
  prompt text not null,
  duration_seconds integer not null default 10,
  status text not null default 'queued'
    check (status in ('queued', 'rendering', 'completed', 'failed', 'cancelled')),
  video_url text,
  thumbnail_url text,
  cost_usd numeric,
  error text,
  attached_to_type text check (attached_to_type in ('ad_copy', 'social_post', null)),
  attached_to_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists video_renders_user on video_renders(user_id, created_at desc);
create index if not exists video_renders_project on video_renders(project_id, created_at desc);
create index if not exists video_renders_pending
  on video_renders(updated_at)
  where status in ('queued', 'rendering');
create index if not exists video_renders_attachment
  on video_renders(attached_to_type, attached_to_id)
  where attached_to_id is not null;

alter table video_renders enable row level security;
create policy "users manage own video renders" on video_renders for all using (auth.uid() = user_id);

create trigger video_renders_updated_at before update on video_renders
  for each row execute function update_updated_at();
