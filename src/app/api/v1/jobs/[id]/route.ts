// Public API: poll an ingest job's status.
//
//   GET /api/v1/jobs/:id
//   Authorization: Bearer gos_live_xxx  (scope: projects:ingest)
//
// Response shape:
//   { id, status, attempts, error, result, started_at, completed_at, created_at }
//
// Ownership is enforced via user_id match against the api key's user.

export const runtime = 'nodejs'

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'

async function handleGet(request: Request) {
  const auth = await authenticateApiKey(request, 'projects:ingest')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const jobId = parts[parts.length - 1] ?? ''
  if (!jobId) return Response.json({ error: 'Missing job id' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: job } = await supabase
    .from('ingest_jobs')
    .select('id, user_id, project_id, url, status, attempts, error, result, started_at, completed_at, created_at')
    .eq('id', jobId)
    .maybeSingle() as {
      data: {
        id: string
        user_id: string
        project_id: string
        url: string
        status: string
        attempts: number
        error: string | null
        result: Record<string, unknown> | null
        started_at: string | null
        completed_at: string | null
        created_at: string
      } | null
    }

  if (!job || job.user_id !== auth.userId) {
    return Response.json({ error: 'Job not found or not accessible with this key' }, { status: 404 })
  }

  return Response.json({
    id: job.id,
    project_id: job.project_id,
    url: job.url,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    result: job.result,
    started_at: job.started_at,
    completed_at: job.completed_at,
    created_at: job.created_at,
  })
}

export const GET = wrapHandler(handleGet, 'v1/jobs/:id')
