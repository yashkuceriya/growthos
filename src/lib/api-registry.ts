// Single source of truth for the v1 public API surface. The settings →
// API Reference tab renders directly from this list, so adding a new
// endpoint means one entry here rather than chasing docs in three places.
//
// Keep entries grouped by resource (projects, leads, webhooks, jobs).

import type { Scope } from './api-auth'

export interface ApiParam {
  name: string
  /** Display type — keep loose. */
  type: string
  required: boolean
  description?: string
}

export interface ApiEndpointDef {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH'
  path: string
  /** Human title for navigation. */
  title: string
  description: string
  /** Required API-key scope, or null if any valid key passes (health). */
  scope: Scope | null
  /** Whether the route honors `Idempotency-Key` for safe retries. */
  idempotent: boolean
  /** Status code on the happy path. */
  successStatus: number
  request?: ApiParam[]
  response?: ApiParam[]
  /** Notes / gotchas surfaced inline in the docs. */
  notes?: string[]
}

export const API_ENDPOINTS: ApiEndpointDef[] = [
  // ── Health ─────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/health',
    title: 'Verify API key + view scopes',
    description: 'No-op endpoint that authenticates the key and returns its metadata (name, scopes, last used). The first call any new integration should make — confirms the key is valid, surfaces the granted scopes, and exercises the rate limiter so you can see the headers.',
    scope: null,
    idempotent: false,
    successStatus: 200,
    response: [
      { name: 'ok', type: 'boolean', required: true },
      { name: 'server_time', type: 'string (ISO 8601)', required: true, description: 'Compare to your client clock to detect skew.' },
      { name: 'key', type: '{ id, name, prefix, scopes[], last_used_at, expires_at, created_at }', required: true },
      { name: 'rate_limit', type: '{ limit, remaining }', required: true },
    ],
    notes: [
      'Any valid key passes — scope is not checked. Use this to discover which scopes a key actually has.',
    ],
  },
  // ── Projects ───────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/api/v1/projects/:id/ingest',
    title: 'Trigger project ingest',
    description: 'Crawl a URL, extract brand info, classify the product, and merge results into the project. Returns 202 + job id by default; pass `sync: true` for a synchronous response.',
    scope: 'projects:ingest',
    idempotent: true,
    successStatus: 202,
    request: [
      { name: 'url', type: 'string', required: false, description: 'Override URL. Falls back to project.website.' },
      { name: 'sync', type: 'boolean', required: false, description: 'Run synchronously and return the brand patch in-band. Default false.' },
    ],
    response: [
      { name: 'status', type: '"queued" | "ok"', required: true },
      { name: 'job_id', type: 'string', required: false, description: 'Async mode only — poll via /api/v1/jobs/:id.' },
      { name: 'brand', type: '{ ... }', required: false, description: 'Sync mode only — the merged brand_voice patch.' },
      { name: 'project_id', type: 'string', required: true },
      { name: 'poll_url', type: 'string', required: false, description: 'Async mode only.' },
    ],
    notes: [
      'AI budget cap returns 402 if the project has exceeded its monthly_ai_budget_usd.',
      'Bot-walled URLs (Cloudflare, 403, CAPTCHA) return 400 — these are permanent failures, not transient.',
    ],
  },
  // ── Jobs ───────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/jobs/:id',
    title: 'Get ingest job status',
    description: 'Poll the status of an enqueued ingest job. Use after a 202 response from the ingest endpoint.',
    scope: 'projects:ingest',
    idempotent: false,
    successStatus: 200,
    response: [
      { name: 'id', type: 'string', required: true },
      { name: 'project_id', type: 'string', required: true },
      { name: 'status', type: '"queued" | "running" | "completed" | "failed"', required: true },
      { name: 'attempts', type: 'number', required: true },
      { name: 'error', type: 'string | null', required: true },
      { name: 'result', type: '{ brand: { ... } } | null', required: true, description: 'Populated on completed.' },
      { name: 'started_at', type: 'string | null', required: true },
      { name: 'completed_at', type: 'string | null', required: true },
      { name: 'created_at', type: 'string', required: true },
    ],
  },
  // ── Leads ──────────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/api/v1/leads',
    title: 'Capture a lead',
    description: 'Create a lead under a project the API key owns. Deduplicates by (project_id, email).',
    scope: 'leads:write',
    idempotent: true,
    successStatus: 200,
    request: [
      { name: 'projectId', type: 'string', required: true },
      { name: 'email', type: 'string', required: true },
      { name: 'name', type: 'string | null', required: false },
      { name: 'source', type: 'string', required: false, description: 'Defaults to "api".' },
      { name: 'sourceId', type: 'string | null', required: false },
      { name: 'campaignId', type: 'string | null', required: false },
      { name: 'utm_source', type: 'string | null', required: false },
      { name: 'utm_medium', type: 'string | null', required: false },
      { name: 'utm_campaign', type: 'string | null', required: false },
      { name: 'utm_content', type: 'string | null', required: false },
      { name: 'utm_term', type: 'string | null', required: false },
      { name: 'metadata', type: '{ ... } | null', required: false },
    ],
    response: [
      { name: 'lead_id', type: 'string', required: true },
      { name: 'status', type: '"new" | "existing"', required: true, description: '"existing" when (project_id, email) already exists.' },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/projects',
    title: 'List projects',
    description: "List all projects accessible by the API key's user.",
    scope: 'projects:read',
    idempotent: false,
    successStatus: 200,
    response: [
      { name: 'projects', type: '[{ id, name, slug, website, ... }]', required: true },
    ],
  },
  // ── Webhooks ───────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/webhooks',
    title: 'List webhook endpoints',
    description: "Return the API key user's outbound webhook endpoints (no secrets).",
    scope: 'webhooks:write',
    idempotent: false,
    successStatus: 200,
    response: [
      { name: 'endpoints', type: '[{ id, project_id, url, events, active, ... }]', required: true },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/webhooks',
    title: 'Create webhook endpoint',
    description: 'Subscribe a URL to one or more event types. The signing secret is returned ONCE — store it on the receiver side.',
    scope: 'webhooks:write',
    idempotent: true,
    successStatus: 201,
    request: [
      { name: 'url', type: 'string', required: true, description: 'HTTPS endpoint that will receive POSTs.' },
      { name: 'events', type: 'string[]', required: true, description: 'Event names from the registry (see API Reference → Events).' },
      { name: 'project_id', type: 'string | null', required: false, description: 'null = subscribe across all your projects.' },
    ],
    response: [
      { name: 'endpoint', type: '{ id, project_id, url, events, ... }', required: true },
      { name: 'secret', type: 'string', required: true, description: 'Plaintext signing secret. Cannot be retrieved later.' },
      { name: 'signature_format', type: 'string', required: true },
    ],
    notes: [
      'Returns 422 if you reuse an Idempotency-Key with a different request body.',
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/webhooks/:id',
    title: 'Get webhook endpoint',
    description: 'Read a single endpoint (no secret).',
    scope: 'webhooks:write',
    idempotent: false,
    successStatus: 200,
  },
  {
    method: 'DELETE',
    path: '/api/v1/webhooks/:id',
    title: 'Delete webhook endpoint',
    description: 'Hard-delete the endpoint. Pending deliveries are cascaded.',
    scope: 'webhooks:write',
    idempotent: false,
    successStatus: 200,
  },
]

/** Group endpoints by resource for the docs page navigation. */
export function groupEndpointsByResource(endpoints: ApiEndpointDef[]): Array<{ resource: string; endpoints: ApiEndpointDef[] }> {
  const groups = new Map<string, ApiEndpointDef[]>()
  for (const ep of endpoints) {
    // /api/v1/<resource>[/:id...] → resource = "<resource>"
    const parts = ep.path.split('/').filter(Boolean)
    const resource = parts[2] ?? 'other'
    if (!groups.has(resource)) groups.set(resource, [])
    groups.get(resource)!.push(ep)
  }
  return Array.from(groups.entries()).map(([resource, endpoints]) => ({ resource, endpoints }))
}
