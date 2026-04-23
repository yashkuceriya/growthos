-- A/B variants for ad_copies. variant_group ties multiple copies generated
-- from the same Launch run together; variant_label is A/B/C so the UI can
-- render them side-by-side for comparison; hook_framework records which
-- creative pattern the variant was built around so we can learn which
-- frameworks win over time.

alter table ad_copies add column if not exists variant_group uuid;
alter table ad_copies add column if not exists variant_label text;
alter table ad_copies add column if not exists hook_framework text;

create index if not exists ad_copies_variant_group on ad_copies(variant_group);
