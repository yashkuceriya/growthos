-- Per-API-key rate limits via Postgres-side token bucket.
--
-- Why a stored function (not a TypeScript-level read-modify-write):
-- concurrent requests from the same key would double-spend tokens
-- between the read and the write. A single UPDATE keyed on the
-- conditional WHERE keeps the decrement atomic.
--
-- The math:
--   refilled = LEAST(stored_tokens + (now - last_refill) * rate, burst)
--   if refilled >= 1: store refilled - 1, return remaining; else NULL
--
-- Cold-start (no row) = INSERT with burst - 1. Uses ON CONFLICT WHERE
-- so a rate-limited row stays unchanged and RETURNING gives NULL.

create table if not exists api_key_rate_limits (
  api_key_id uuid primary key references api_keys(id) on delete cascade,
  tokens_remaining float8 not null,
  last_refill_at timestamptz not null default now()
);

-- No RLS: only the service role calls the RPC, and api_key_id matching
-- is the gate at every read site.

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

  return v_remaining; -- null when rate limited (WHERE matched nothing)
end;
$$ language plpgsql;

-- Service role can execute. Anon should never reach here — guard rails
-- live in the route layer that decides whether to call the RPC at all.
grant execute on function consume_rate_token(uuid, float8, float8) to service_role;
