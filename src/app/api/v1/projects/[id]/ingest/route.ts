// Public API: trigger a re-crawl / brand refresh on a project.
//
//   POST /api/v1/projects/:id/ingest
//   Authorization: Bearer gos_live_xxx  (scope: projects:ingest)
//   Idempotency-Key: <client-generated-uuid>  (optional, recommended)
//   { url?: string, sync?: boolean }   — url overrides project.website
//
// Default behavior: enqueue a background job and return 202 with a job_id.
// The /api/jobs/ingest-tick cron drains the queue every 2 min. Caller polls
// GET /api/v1/jobs/:id for status + result.
//
// Backwards-compat: pass `{ sync: true }` (or `?sync=1`) to run synchronously
// and get the brand back in-process. Useful for first-run integrations that
// want one round-trip.
//
// **Idempotency**: send `Idempotency-Key: <uuid>` to make retried requests
// safe. A retry within 24h with the same key returns the original response
// (status + body) and an `Idempotent-Replayed: true` header. Reusing a key
// with a different body returns 422; concurrent retries with the same key
// get 409 with a `retry_after_seconds` hint. See lib/idempotency.ts.
//
// Authenticated via API key (not session). We use the service client to run
// the ingest and gate ownership manually via auth.userId.

export const runtime = 'nodejs'
export const maxDuration = 120

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'
import { runIngest } from '@/lib/ai/intelligence/ingest'
import { enqueueIngest } from '@/lib/jobs/ingest-queue'
import { withIdempotency } from '@/lib/idempotency'
import { enforceRateLimit, attachRateLimitHeaders } from '@/lib/rate-limit-api'

async function handlePost(request: Request) {
  const auth = await authenticateApiKey(request, 'projects:ingest')
  if (!auth.ok) return auth.response

  const supabaseRl = createServiceClient()
  const rl = await enforceRateLimit(supabaseRl, auth.keyId)
  if (!rl.ok) return rl.response

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const projectId = parts[parts.length - 2] ?? ''
  if (!projectId) return Response.json({ error: 'Missing project id' }, { status: 400 })

  // Read raw body once so we can hash it for idempotency AND parse it for
  // the handler. Don't call request.json() — that's destructive.
  const bodyText = await request.text()
  const body = (() => {
    try { return bodyText ? JSON.parse(bodyText) as { url?: string; sync?: boolean } : {} }
    catch { return {} }
  })()
  const overrideUrl = body.url
  const sync = body.sync === true || url.searchParams.get('sync') === '1'

  const supabase = createServiceClient()

  const out = await withIdempotency({
    supabase,
    apiKeyId: auth.keyId,
    idempotencyKey: request.headers.get('idempotency-key'),
    method: request.method,
    path: url.pathname,
    bodyText,
    handler: async () => {
      const { data: project } = await supabase
        .from('projects')
        .select('id, user_id, website')
        .eq('id', projectId)
        .maybeSingle() as { data: { id: string; user_id: string; website: string | null } | null }

      if (!project || project.user_id !== auth.userId) {
        return Response.json({ error: 'Project not found or not accessible with this key' }, { status: 404 })
      }

      const targetUrl = overrideUrl || project.website
      if (!targetUrl) {
        return Response.json({ error: 'No url provided and project has no website set' }, { status: 400 })
      }

      // AI budget cap — ingest does an LLM call per run. Checked at enqueue
      // so callers get instant 402 feedback instead of polling a job that's
      // destined to fail. The drainer re-checks before the LLM call so a
      // job queued under-budget but drained after spend climbs still bails
      // cleanly.
      const budget = await checkBudget(supabase, projectId)
      if (!budget.ok) return budgetExceededResponse(budget)

      if (sync) {
        try {
          const { brand } = await runIngest({
            supabase,
            userId: auth.userId,
            projectId,
            url: targetUrl,
          })
          return Response.json({ status: 'ok', project_id: projectId, brand })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Ingest failed'
          const status = msg.startsWith('Failed to fetch site') ? 400 : 500
          return Response.json({ error: msg }, { status })
        }
      }

      const { id: jobId } = await enqueueIngest({
        supabase,
        userId: auth.userId,
        projectId,
        url: targetUrl,
      })

      return Response.json(
        {
          status: 'queued',
          job_id: jobId,
          project_id: projectId,
          poll_url: `/api/v1/jobs/${jobId}`,
        },
        { status: 202 },
      )
    },
  })

  return attachRateLimitHeaders(out, rl)
}

export const POST = wrapHandler(handlePost, 'v1/projects/:id/ingest')
