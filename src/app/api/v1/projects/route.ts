// Public API: list projects owned by the API key's user.
//
//   GET /api/v1/projects
//   Authorization: Bearer gos_live_xxx  (scope: projects:read)
//
// Returns minimal project summaries — id, name, slug, website, vertical,
// brand_book_ready, latest campaign. Enough for external dashboards / Zapier
// style integrations to wire up.

export const runtime = 'nodejs'

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'
import { enforceRateLimit, attachRateLimitHeaders } from '@/lib/rate-limit-api'

async function handleGet(request: Request) {
  const auth = await authenticateApiKey(request, 'projects:read')
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  const rl = await enforceRateLimit(supabase, auth.keyId)
  if (!rl.ok) return rl.response
  const { data } = await supabase
    .from('projects')
    .select('id, name, slug, website, brand_voice, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  const projects = (data ?? []).map((p) => {
    const bv = (p.brand_voice ?? {}) as Record<string, unknown>
    const classification = bv.classification as { vertical?: string; stage?: string } | undefined
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      website: p.website,
      vertical: classification?.vertical ?? null,
      stage: classification?.stage ?? null,
      brand_book_ready: !!bv.guidelines,
      tagline: (bv.tagline as string | undefined) ?? null,
      created_at: p.created_at,
    }
  })

  return attachRateLimitHeaders(Response.json({ projects }), rl)
}

export const GET = wrapHandler(handleGet, 'v1/projects')
