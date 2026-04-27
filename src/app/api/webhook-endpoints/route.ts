// Session-authed dashboard route for managing webhook endpoints. Mirrors
// the v1/webhooks public-API route but gated by Supabase auth cookie
// instead of API key. RLS enforces ownership on all reads/writes.
//
// Plaintext signing secret returned exactly once on POST (same shape as
// /api/api-keys mint).

import { createClient } from '@/lib/supabase/server'
import { wrapHandler } from '@/lib/api-error'
import { generateWebhookSecret } from '@/lib/webhooks/sign'
import { SUPPORTED_EVENTS, isSupportedEvent } from '@/lib/webhooks/events'
import { validateWebhookUrl } from '@/lib/webhooks/url-validator'

async function handleGet() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('webhook_endpoints')
    .select('id, project_id, url, events, active, consecutive_failures, last_delivery_at, last_delivery_status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return Response.json({ endpoints: data ?? [] })
}

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as {
    url?: string
    events?: string[]
    project_id?: string | null
  }

  if (!body.url) {
    return Response.json({ error: 'url required' }, { status: 400 })
  }
  const urlCheck = validateWebhookUrl(body.url)
  if (!urlCheck.ok) {
    return Response.json({ error: urlCheck.reason ?? 'Invalid url' }, { status: 400 })
  }
  const events = Array.isArray(body.events)
    ? body.events.filter((e): e is string => typeof e === 'string' && isSupportedEvent(e))
    : []
  if (events.length === 0) {
    return Response.json(
      { error: `events[] required; supported: ${SUPPORTED_EVENTS.join(', ')}` },
      { status: 400 },
    )
  }

  let projectId: string | null = null
  if (body.project_id) {
    // RLS already restricts to projects this user owns; the .maybeSingle()
    // returns null if the project belongs to someone else.
    const { data: p } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .maybeSingle() as { data: { id: string } | null }
    if (!p) return Response.json({ error: 'project_id not found' }, { status: 404 })
    projectId = p.id
  }

  const secret = generateWebhookSecret()

  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      user_id: user.id,
      project_id: projectId,
      url: body.url,
      secret,
      events,
      active: true,
    })
    .select('id, project_id, url, events, active, consecutive_failures, last_delivery_at, last_delivery_status, created_at')
    .single() as { data: Record<string, unknown> | null; error: { message: string } | null }

  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Failed to create endpoint' }, { status: 500 })
  }

  return Response.json(
    {
      endpoint: data,
      secret,
      signature_format: 't=<unix-seconds>,v1=<hex-hmac-sha256>',
      note: 'Save the secret now — it cannot be retrieved later.',
    },
    { status: 201 },
  )
}

export const GET = wrapHandler(handleGet, 'webhook-endpoints')
export const POST = wrapHandler(handlePost, 'webhook-endpoints')
