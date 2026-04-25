-- ================================
-- SOCIAL PUBLISHING (Bundle I)
-- ================================
-- Extends 003_social_scheduler.sql with the columns and indexes the publish
-- pipeline needs. The cron at /api/social/publish-tick drains 'scheduled'
-- posts whose scheduled_at <= now(), calls the platform publisher, and updates
-- status + external_id. social_accounts gains an `expires_at` so the cron can
-- skip rows whose token has lapsed, and an `external_account_id` (LinkedIn URN
-- / X user id) which several platforms require in the publish payload.

-- social_posts: track attempts so a permanently-failing post doesn't burn
-- cron quota indefinitely, and store the platform's id/url for backlinks.
alter table social_posts add column if not exists attempts integer not null default 0;
alter table social_posts add column if not exists last_error text;
alter table social_posts add column if not exists last_attempt_at timestamptz;
alter table social_posts add column if not exists external_id text;
alter table social_posts add column if not exists external_url text;
alter table social_posts add column if not exists metadata jsonb not null default '{}';

-- Wider state machine: drafts can fail, scheduled can be retrying, published
-- can be deleted upstream. Replace the old check.
alter table social_posts drop constraint if exists social_posts_status_check;
alter table social_posts add constraint social_posts_status_check
  check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'));

-- Cron's hot-path query: "what's due to publish?". Partial index so it stays
-- tiny even as the published archive grows.
drop index if exists social_posts_scheduled;
create index if not exists social_posts_due
  on social_posts(scheduled_at)
  where status = 'scheduled' and scheduled_at is not null;

-- social_accounts: store who-the-account-is on the platform side, scopes the
-- token was minted with, and when the token expires (for the cron skip-check).
alter table social_accounts add column if not exists external_account_id text;
alter table social_accounts add column if not exists scopes text[] not null default '{}';
alter table social_accounts add column if not exists expires_at timestamptz;
alter table social_accounts add column if not exists last_publish_at timestamptz;
alter table social_accounts add column if not exists last_error text;

-- One default account per (project, platform) — the publisher resolves a post's
-- platform to a single account row. Keep it as a partial unique index instead
-- of a check so a project could (later) carry multiple accounts per platform
-- with different `metadata.role` flags.
create unique index if not exists social_accounts_default_per_platform
  on social_accounts(project_id, platform);
