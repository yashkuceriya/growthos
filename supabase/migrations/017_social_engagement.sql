-- ================================
-- SOCIAL ENGAGEMENT SYNC (Bundle J)
-- ================================
-- The /api/social/engagement-tick cron pulls public metrics (likes, replies,
-- shares, impressions) for published posts and writes them to social_posts.engagement.
-- We track the last successful sync per row so the cron's "what's stale?"
-- query is cheap and we can back off on rows we just touched.

alter table social_posts add column if not exists engagement_synced_at timestamptz;
alter table social_posts add column if not exists engagement_sync_error text;

-- Cron's hot-path filter: published posts that haven't been synced recently.
-- Indexed on engagement_synced_at so we can order asc-nulls-first cheaply.
create index if not exists social_posts_engagement_sync
  on social_posts(engagement_synced_at nulls first)
  where status = 'published' and external_id is not null;
