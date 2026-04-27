-- Re-apply critical RPCs.
--
-- A practical audit caught three functions missing from production despite
-- their tables being present — likely from earlier migrations being applied
-- as table-only paste in Supabase Studio. All three are silent-failure
-- hazards: budget caps stop blocking, rate limits stop limiting, and the
-- brand_voice merge throws 500s into Sync Site / every agency agent.
--
-- This file is idempotent (every function is `create or replace`). Safe
-- to re-apply at any time. New deploys should still apply the original
-- migrations 011/012/024 — this is a repair script for environments
-- where those didn't fully land.

-- From migration 011: atomic merge into projects.brand_voice
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

-- From migration 012: month-to-date AI spend for a project
create or replace function project_month_ai_spend(p_project_id uuid)
returns numeric
language sql
security invoker
stable
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from ai_cost_ledger
  where project_id = p_project_id
    and created_at >= date_trunc('month', now());
$$;

-- From migration 024: token-bucket rate limit consumer
create or replace function consume_rate_token(
  p_api_key_id uuid,
  p_burst float8,
  p_rate float8
) returns float8 as $$
declare
  v_remaining float8;
begin
  insert into api_key_rate_limits (api_key_id, tokens_remaining, last_refill_at)
  values (p_api_key_id, p_burst - 1.0, now())
  on conflict (api_key_id) do update
  set
    tokens_remaining = least(
      api_key_rate_limits.tokens_remaining
        + extract(epoch from (now() - api_key_rate_limits.last_refill_at)) * p_rate,
      p_burst
    ) - 1.0,
    last_refill_at = now()
  where
    least(
      api_key_rate_limits.tokens_remaining
        + extract(epoch from (now() - api_key_rate_limits.last_refill_at)) * p_rate,
      p_burst
    ) >= 1.0
  returning tokens_remaining into v_remaining;

  return v_remaining;
end;
$$ language plpgsql;

grant execute on function consume_rate_token(uuid, float8, float8) to service_role;

-- Force PostgREST to reload its schema cache so the new functions are
-- callable immediately, not after a delay.
notify pgrst, 'reload schema';
