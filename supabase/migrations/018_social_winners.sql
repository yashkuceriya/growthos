-- ================================
-- SOCIAL WINNER DETECTION (Bundle K)
-- ================================
-- Closes the loop: published posts that earned outsized engagement get marked
-- as winners and copied into style_references so the social generator can
-- emulate them on future drafts.
--
-- /api/social/winner-tick (every 6h) recomputes winners per (project, platform)
-- over a rolling window. is_winner is the boolean view; winner_score is the
-- numeric value used for ranking; winner_promoted_at flags when we mirrored
-- this row into style_references (so we don't double-insert).

alter table social_posts add column if not exists is_winner boolean not null default false;
alter table social_posts add column if not exists winner_score numeric;
alter table social_posts add column if not exists winner_promoted_at timestamptz;

-- Hot path: top winners per platform for a project. Partial index keeps it
-- tiny — only a few rows per project ever carry is_winner=true.
create index if not exists social_posts_winners
  on social_posts(project_id, platform, winner_score desc nulls last)
  where is_winner = true;

-- Track which winning post a style_reference was promoted from. Lets the
-- winner-tick cron find existing refs cheaply (no second insert) and lets
-- the UI link a style ref back to its source post. Partial unique constraint:
-- one ref per source post.
alter table style_references add column if not exists source_post_id uuid
  references social_posts(id) on delete set null;

create unique index if not exists style_references_source_post_unique
  on style_references(source_post_id)
  where source_post_id is not null;
