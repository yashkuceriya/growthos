-- Atomic top-level merge into projects.brand_voice so concurrent agency
-- endpoints (market-intel + positioning + brand-hub running in parallel)
-- don't clobber each other by doing read-modify-write in app code.
--
-- Postgres's `jsonb || jsonb` operator performs a shallow merge (right side
-- wins per top-level key), which matches how agency endpoints write today —
-- each owns its own top-level key (guidelines, market_intel, competitive_intel,
-- insights, classification, etc.). For deep merges, callers should still read
-- + spread + write, but the vast majority of writes are top-level.

create or replace function merge_project_brand_voice(
  p_project_id uuid,
  p_patch jsonb
) returns jsonb
language sql
security invoker
as $$
  update projects
  set brand_voice = coalesce(brand_voice, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
  where id = p_project_id
  returning brand_voice;
$$;
