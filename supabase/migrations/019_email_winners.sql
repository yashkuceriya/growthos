-- ================================
-- EMAIL WINNER DETECTION (Bundle L)
-- ================================
-- Same pattern as 018_social_winners but for email_templates. /api/email/
-- winner-tick (every 12h) scores templates by open_rate × click_rate over a
-- rolling window of recent sends, marks the top performers, demotes losers,
-- and mirrors winners into style_references so the email generator can
-- emulate them on future drafts.

alter table email_templates add column if not exists is_winner boolean not null default false;
alter table email_templates add column if not exists winner_score numeric;
alter table email_templates add column if not exists winner_promoted_at timestamptz;

-- Hot path: top winners for a project. Partial index — usually 1-2 rows per
-- project carry is_winner=true.
create index if not exists email_templates_winners
  on email_templates(project_id, winner_score desc nulls last)
  where is_winner = true;

-- Reuse the source-post idempotency pattern from 018, but for templates.
-- One style_reference per template that has been promoted.
alter table style_references add column if not exists source_template_id uuid
  references email_templates(id) on delete set null;

create unique index if not exists style_references_source_template_unique
  on style_references(source_template_id)
  where source_template_id is not null;
