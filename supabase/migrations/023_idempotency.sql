-- Idempotency-Key support for v1 endpoints.
--
-- Customers send `Idempotency-Key: <client-generated-uuid>` on mutating
-- requests. Retried requests within the TTL get the cached response back
-- byte-for-byte, so a worker queue's at-least-once retry can't
-- double-enqueue a job, double-create a webhook, or double-create a
-- (non-deduped) lead.
--
-- Storage shape mirrors Stripe's: scope by api_key_id (one customer can't
-- collide with another's keys), record the request hash so reusing a key
-- with a different body is detected, cache the response status + body for
-- replay. status='processing' covers the in-flight gap so concurrent
-- retries get a 409 instead of double-processing.

create table if not exists idempotency_records (
  api_key_id uuid not null references api_keys(id) on delete cascade,
  key text not null,
  request_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  response_status int,
  response_body text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (api_key_id, key)
);

-- TTL sweep / debug queries hit by created_at.
create index if not exists idempotency_records_created
  on idempotency_records(created_at);

-- No RLS: only the service role inserts/reads here, and api_key_id already
-- gates ownership at lookup time. Keeping RLS off avoids a policy detour
-- on every authed write.
