-- Durable asset metadata for launch outputs and quality scoring.
--
-- Older/local restores can have the core asset tables without metadata
-- columns even though launch generation writes metadata into them. Keep this
-- idempotent so it is safe to paste into Supabase SQL editor after a restore.

alter table public.projects
  add column if not exists monthly_ai_budget_usd numeric(10, 2);

alter table public.ad_copies
  add column if not exists metadata jsonb not null default '{}';

alter table public.content_pieces
  add column if not exists metadata jsonb not null default '{}';

alter table public.email_templates
  add column if not exists metadata jsonb not null default '{}';

alter table public.landing_pages
  add column if not exists metadata jsonb not null default '{}';

create index if not exists ad_copies_launch_run
  on public.ad_copies ((metadata->>'launch_run'));

create index if not exists content_pieces_launch_run
  on public.content_pieces ((metadata->>'launch_run'));

create index if not exists email_templates_launch_run
  on public.email_templates ((metadata->>'launch_run'));

create index if not exists landing_pages_launch_run
  on public.landing_pages ((metadata->>'launch_run'));

notify pgrst, 'reload schema';
