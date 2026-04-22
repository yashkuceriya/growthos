-- ================================
-- ATTRIBUTION
-- ================================
-- Tie leads back to the campaign / channel / UTM that sourced them, so we can
-- compute per-campaign conversion and per-channel revenue attribution later.

alter table leads add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_content text;
alter table leads add column if not exists utm_term text;

create index if not exists leads_campaign on leads(campaign_id);
create index if not exists leads_utm_campaign on leads(utm_campaign);

-- Content pieces and landing pages get the same attribution anchors so we can
-- group "asset -> lead" performance.
alter table content_pieces add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table landing_pages add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists content_pieces_campaign on content_pieces(campaign_id);
create index if not exists landing_pages_campaign on landing_pages(campaign_id);
