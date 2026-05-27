import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimitPublic, clientIp } from '@/lib/rate-limit'
import { wrapHandler } from '@/lib/api-error'
import { emitEvent } from '@/lib/webhooks/dispatch'
import type { LeadCreatedPayload } from '@/lib/webhooks/payloads'
import { normalizeLeadInput } from '@/lib/leads/validation'
import { verifyLeadCaptureToken } from '@/lib/leads/capture-token'

/** Public endpoint — no auth required. Used by landing pages and external forms. */
async function handlePost(request: Request) {
  // IP throttle: 10 submissions / minute per IP
  const ip = clientIp(request)
  const { ok } = await rateLimitPublic(`lead-capture:${ip}`, 10, 60_000)
  if (!ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const website = typeof (body as Record<string, unknown>).website === 'string'
    ? (body as Record<string, unknown>).website
    : null

  // Honeypot — real users never fill hidden `website` field
  if (typeof website === 'string' && website.length > 0) {
    return NextResponse.json({ status: 'ok' }) // silent reject
  }

  const parsed = normalizeLeadInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data } = parsed
  const { projectId, email, name, source, sourceId, metadata, campaignId, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = data
  const tokenCheck = verifyLeadCaptureToken({
    token: (body as Record<string, unknown>).captureToken,
    projectId,
    sourceId,
  })
  if (!tokenCheck.ok) return NextResponse.json({ error: tokenCheck.reason }, { status: 403 })

  const supabase = createServiceClient()

  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    await supabase.from('lead_events').insert({
      lead_id: existing.id,
      event_type: 'form_submit',
      metadata: { ...metadata, source: source ?? 'direct', ip },
    })
    return NextResponse.json({ lead_id: existing.id, status: 'existing' })
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      user_id: project.user_id,
      project_id: projectId,
      email,
      name: name || null,
      source: source || 'direct',
      source_id: sourceId || null,
      campaign_id: campaignId ?? null,
      utm_source: utm_source ?? null,
      utm_medium: utm_medium ?? null,
      utm_campaign: utm_campaign ?? null,
      utm_content: utm_content ?? null,
      utm_term: utm_term ?? null,
      metadata: { ...metadata, ip },
      score: 10,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    event_type: 'captured',
    metadata: { ...metadata, source: source ?? 'direct', ip },
  })

  const leadPayload: LeadCreatedPayload = {
    lead_id: lead.id,
    project_id: projectId,
    email,
    name: name || null,
    source: source || 'direct',
    source_id: sourceId || null,
    campaign_id: campaignId ?? null,
    utm: {
      source: utm_source ?? null,
      medium: utm_medium ?? null,
      campaign: utm_campaign ?? null,
      content: utm_content ?? null,
      term: utm_term ?? null,
    },
    score: 10,
    created_at: new Date().toISOString(),
  }
  await emitEvent({
    supabase,
    userId: project.user_id,
    projectId,
    eventType: 'lead.created',
    payload: leadPayload as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ lead_id: lead.id, status: 'new' })
}

export const POST = wrapHandler(handlePost, 'leads/capture')
