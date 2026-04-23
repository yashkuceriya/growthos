// Public API: capture a lead.
//
//   POST /api/v1/leads
//   Authorization: Bearer gos_live_xxx  (scope: leads:write)
//   { projectId, email, name?, source?, sourceId?, metadata?,
//     utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?,
//     campaignId? }
//
// Same shape as the public /api/leads/capture endpoint, but authenticated with
// a user's API key rather than relying on rate limit + honeypot. Returns the
// lead id. Only creates leads under projects owned by the key's user.

export const runtime = 'nodejs'

import { createServiceClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { authenticateApiKey } from '@/lib/api-auth'

async function handlePost(request: Request) {
  const auth = await authenticateApiKey(request, 'leads:write')
  if (!auth.ok) return auth.response

  const body = await request.json()
  const {
    projectId, email, name, source, sourceId, metadata,
    campaignId, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  } = body

  if (!projectId || !email) {
    return Response.json({ error: 'projectId and email are required' }, { status: 400 })
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: 'Invalid email' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Ownership gate — must be a project owned by the API key holder
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project || project.user_id !== auth.userId) {
    return Response.json({ error: 'Project not found or not accessible with this key' }, { status: 404 })
  }

  // Deduplicate by (project_id, email)
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    await supabase.from('lead_events').insert({
      lead_id: existing.id,
      event_type: 'api_touch',
      metadata: { source, api_key_id: auth.keyId, ...metadata },
    })
    return Response.json({ lead_id: existing.id, status: 'existing' })
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      user_id: auth.userId,
      project_id: projectId,
      email,
      name: name || null,
      source: source || 'api',
      source_id: sourceId || null,
      campaign_id: campaignId ?? null,
      utm_source: utm_source ?? null,
      utm_medium: utm_medium ?? null,
      utm_campaign: utm_campaign ?? null,
      utm_content: utm_content ?? null,
      utm_term: utm_term ?? null,
      metadata: { api_key_id: auth.keyId, ...(metadata || {}) },
      score: 10,
    })
    .select('id')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    event_type: 'captured',
    metadata: { source, api_key_id: auth.keyId, ...metadata },
  })

  return Response.json({ lead_id: lead.id, status: 'new' })
}

export const POST = wrapHandler(handlePost, 'v1/leads')
