-- Per-project launch mutex. Without this, a user double-clicking the
-- Launch button (or running it from two browser tabs concurrently)
-- triggers two full orchestrator runs against the same project — each
-- spends $1-3 in OpenRouter / Anthropic credits and writes conflicting
-- data. The mutex is a single timestamp column with a stale-claim
-- recovery window: an "in-flight" marker older than 10 minutes is
-- presumed dead (worker crashed, function timed out) and can be
-- overwritten on the next attempt.
--
-- 10 minutes is generous: the longest legitimate launch run is around
-- 3-4 minutes (8 channels in parallel + 4 strategic agents serially).
-- The conditional UPDATE at the route layer atomically claims; the
-- RETURNING gives 0 rows when the mutex is held by another live run.

alter table projects
  add column if not exists launch_running_at timestamptz;

-- Index for the (rare) query "are any launches in flight right now?"
-- — partial so it stays small.
create index if not exists projects_launch_running
  on projects(launch_running_at)
  where launch_running_at is not null;
