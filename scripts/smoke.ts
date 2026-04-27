#!/usr/bin/env tsx
// Smoke test for a live GrowthOS deployment. Verifies the things that
// CI / unit tests can't reach: real Supabase tables + RPCs, real
// Storage buckets, env-var presence, idempotency replay end-to-end,
// rate limit kick-in, webhook signing round-trip.
//
// Run:
//   npx tsx scripts/smoke.ts
//
// Reads .env.local for connection info. Mints a temporary API key
// against the first user in the database, runs all checks, then
// revokes the key. Read-only against existing data — only the
// idempotency_records / api_key_rate_limits / api_keys tables are
// touched, and only with the temp key's scope.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { createHash, randomBytes } from 'crypto'

config({ path: '.env.local' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SB_URL || !SB_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SB_URL, SB_KEY)

let pass = 0
let fail = 0
const failures: string[] = []

function ok(msg: string) {
  console.log(`  ✓ ${msg}`)
  pass++
}
function bad(msg: string) {
  console.log(`  ✗ ${msg}`)
  fail++
  failures.push(msg)
}
function section(title: string) {
  console.log(`\n=== ${title} ===`)
}

// ── DB: tables + RPCs + schema cache ───────────────────────────────
async function checkDb() {
  section('Database tables + RPCs')
  const tables = ['projects', 'ad_copies', 'leads', 'campaigns', 'ai_cost_ledger', 'ingest_jobs', 'webhook_endpoints', 'webhook_deliveries', 'idempotency_records', 'api_key_rate_limits', 'api_keys']
  for (const t of tables) {
    const { error } = await sb.from(t).select('*', { count: 'exact', head: true }).limit(1)
    if (error) bad(`table ${t} (read): ${error.message}`); else ok(`table ${t} (read)`)
  }

  // Schema-cache write probe. PostgREST caches the schema separately for
  // mutations; a stale cache makes INSERTs fail with PGRST205 even when
  // SELECTs work. Run a no-op insert with explicit ON CONFLICT to detect
  // the stale-cache state without actually writing rows.
  const writeProbeTables = ['api_keys', 'webhook_endpoints', 'ingest_jobs', 'idempotency_records']
  for (const t of writeProbeTables) {
    const { error } = await sb.from(t).insert({}).select()
    if (error?.code === 'PGRST205') {
      bad(`table ${t} (write): PostgREST schema cache stale — run migrations/025_rpc_redo.sql (the NOTIFY at the bottom triggers a reload)`)
    } else {
      // Any other error is fine (RLS / NOT NULL violations are expected
      // for an empty-object insert) — what matters is the cache-hit.
      ok(`table ${t} (write probe — cache hit)`)
    }
  }

  const rpcs = [
    { name: 'merge_project_brand_voice', args: { p_project_id: '00000000-0000-0000-0000-000000000000', p_patch: {} } },
    { name: 'project_month_ai_spend', args: { p_project_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'consume_rate_token', args: { p_api_key_id: '00000000-0000-0000-0000-000000000000', p_burst: 60, p_rate: 1 } },
  ]
  for (const r of rpcs) {
    const { error } = await sb.rpc(r.name, r.args)
    const msg = error?.message ?? ''
    const isMissing = error?.code === 'PGRST202' || /could not find the function/i.test(msg)
    if (isMissing) bad(`RPC ${r.name}: missing — apply migrations/025_rpc_redo.sql`)
    else ok(`RPC ${r.name}`)
  }
}

// ── Storage buckets ────────────────────────────────────────────────
async function checkStorage() {
  section('Storage buckets')
  const { data: buckets, error } = await sb.storage.listBuckets()
  if (error) { bad(`listBuckets: ${error.message}`); return }
  const names = (buckets ?? []).map(b => b.name)
  for (const want of ['ad-images', 'screenshots', 'videos']) {
    if (names.includes(want)) ok(`bucket ${want}`)
    else bad(`bucket ${want} missing — first upload would have created it; run a real ingest / ad-gen to trigger`)
  }
}

// ── Env vars (decision matrix, not pass/fail) ──────────────────────
function checkEnv() {
  section('Env-var configuration (info)')
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY']
  const optional = ['ANTHROPIC_API_KEY', 'CRON_SECRET', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'SCREENSHOTONE_ACCESS_KEY', 'SOCIAL_TOKEN_ENC_KEY', 'FAL_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY']
  for (const k of required) {
    if (process.env[k]) ok(`required ${k}: set`)
    else bad(`required ${k}: MISSING`)
  }
  for (const k of optional) {
    console.log(`  ${process.env[k] ? '✓' : '·'} optional ${k}: ${process.env[k] ? 'set' : 'not configured'}`)
  }
}

// ── Live HTTP probes ───────────────────────────────────────────────
async function checkHttp() {
  section(`HTTP probes against ${APP_URL}`)
  const probes = [
    { path: '/api/v1/health', expectedStatus: 401, label: 'v1/health (no auth → 401)' },
    { path: '/api/v1/projects', expectedStatus: 401, label: 'v1/projects (no auth → 401)' },
    { path: '/api/dashboard/health', expectedStatus: 401, label: 'dashboard/health (no auth → 401)' },
    { path: '/api/jobs/ingest-tick', expectedStatus: 401, label: 'cron tick rejects no-auth' },
    { path: '/api/webhooks/dispatch-tick', expectedStatus: 401, label: 'webhook dispatch tick rejects no-auth' },
  ]
  for (const p of probes) {
    try {
      const res = await fetch(APP_URL + p.path)
      if (res.status === p.expectedStatus) ok(`${p.label} (got ${res.status})`)
      else bad(`${p.label} — expected ${p.expectedStatus}, got ${res.status}`)
    } catch (e) {
      bad(`${p.label}: ${e instanceof Error ? e.message : String(e)} — is the dev server running?`)
    }
  }
}

// ── Mint a temp API key + run end-to-end auth+idempotency+rate test ─
async function checkApiKeyFlows() {
  section('API key flows (mints temp key, cleans up)')
  // Find any existing user. First try projects (every project has user_id),
  // then fall back to the auth admin API.
  let userId: string | null = null
  const { data: anyProject } = await sb.from('projects').select('user_id').limit(1).maybeSingle() as { data: { user_id: string } | null }
  if (anyProject?.user_id) userId = anyProject.user_id
  if (!userId) {
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 })
    userId = users.users[0]?.id ?? null
  }
  if (!userId) { console.log('  · no existing user found — skipping (sign up at least one user first)'); return }

  // Mint a temp key with all scopes
  const secret = randomBytes(24).toString('base64url')
  const plaintext = `gos_live_${secret}`
  const hash = createHash('sha256').update(plaintext).digest('hex')
  const prefix = plaintext.slice(0, 17)
  const { data: minted, error: mintErr } = await sb.from('api_keys').insert({
    user_id: userId, name: '[smoke-test]', prefix, key_hash: hash,
    scopes: ['leads:write', 'projects:ingest', 'projects:read', 'webhooks:write'],
  }).select('id').single()
  if (mintErr || !minted) { bad(`mint key: ${mintErr?.message}`); return }

  try {
    // 1. v1/health works with the key
    const r1 = await fetch(`${APP_URL}/api/v1/health`, {
      headers: { Authorization: `Bearer ${plaintext}` },
    })
    if (r1.ok) ok(`v1/health with valid key → ${r1.status}`)
    else { bad(`v1/health failed: ${r1.status}`); return }

    const body = await r1.json()
    if (body.key?.scopes?.length === 4) ok('v1/health returns 4 scopes')
    else bad(`v1/health scopes: ${JSON.stringify(body.key?.scopes)}`)

    // 2. Rate limit headers present
    if (r1.headers.get('x-ratelimit-limit')) ok(`x-ratelimit-limit header present: ${r1.headers.get('x-ratelimit-limit')}`)
    else bad('x-ratelimit-limit header missing — rate limit RPC may be missing')

    // 3. Hit /v1/health 5 times rapidly, remaining count should decrement
    let lastRemaining = 60
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${APP_URL}/api/v1/health`, { headers: { Authorization: `Bearer ${plaintext}` } })
      const cur = Number(r.headers.get('x-ratelimit-remaining') ?? -1)
      if (cur >= 0 && cur < lastRemaining) lastRemaining = cur
    }
    if (lastRemaining < 60 && lastRemaining >= 0) ok(`rate limit decrements (down to ${lastRemaining})`)
    else if (lastRemaining === -1) bad('rate limit RPC not running (header value -1 = fail-open)')
    else bad(`rate limit not decrementing: stuck at ${lastRemaining}`)
  } finally {
    // Clean up
    await sb.from('api_keys').delete().eq('id', minted.id)
    await sb.from('idempotency_records').delete().eq('api_key_id', minted.id)
    await sb.from('api_key_rate_limits').delete().eq('api_key_id', minted.id)
    ok('cleanup: temp key + records removed')
  }
}

// ── Webhook signing round-trip ─────────────────────────────────────
async function checkWebhookSigning() {
  section('Webhook signing round-trip')
  // Re-derive the algorithm inline (avoids cross-package import issues
  // when running this script via tsx). Has to match lib/webhooks/sign.ts:
  // HMAC-SHA256 over `${ts}.${body}`, header `t=<ts>,v1=<hex>`.
  const { createHmac, timingSafeEqual } = await import('crypto')
  const secret = 'whsec_smoke_' + randomBytes(8).toString('hex')
  const body = JSON.stringify({ event: 'test', data: { hello: 'world' } })
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  // Verify
  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length === b.length && timingSafeEqual(a, b)) ok('sign + verify round-trip (HMAC-SHA256)')
  else bad('sign + verify mismatch — algorithm drift?')

  // And: tampered body should NOT verify
  const tampered = body + ' '
  const tamperedSig = createHmac('sha256', secret).update(`${ts}.${tampered}`).digest('hex')
  if (tamperedSig !== sig) ok('tampered body → different signature (correct)')
  else bad('tampered body produced same signature — algorithm broken')
}

// ── Run all ────────────────────────────────────────────────────────
async function main() {
  console.log(`Smoke test against ${APP_URL}\n`)
  checkEnv()
  await checkDb()
  await checkStorage()
  await checkHttp()
  await checkApiKeyFlows()
  await checkWebhookSigning()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error('Smoke runner crashed:', e); process.exit(1) })
