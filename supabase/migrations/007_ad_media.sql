-- Add media_urls array to ad_copies so generated images are stored with the ad.
alter table ad_copies add column if not exists media_urls text[] not null default '{}';

-- Also allow storing extracted brand assets in a dedicated column on projects
-- (brand_voice JSONB already exists; this is a hint comment for future use).
