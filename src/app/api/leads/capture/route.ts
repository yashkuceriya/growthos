import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { wrapHandler } from '@/lib/api-error'

/** Public endpoint — no auth required. Used by landing pages and external forms. */
async function handlePost(request: Request) {
  // IP throttle: 10 submissions / minute per IP
  const ip = clientIp(request)
  const { ok } = rateLimit(`lead-capture:${ip}`, 10, 60_000)
  if (!ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await request.json()
  const {
    projectId, email, name, source, sourceId, metadata, website,
    campaignId, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  } = body

  // Honeypot — real users never fill hidden `website` field
  if (typeof website === 'string' && website.length > 0) {
    return NextResponse.json({ status: 'ok' }) // silent reject
  }

  if (!projectId || !email) {
    return NextResponse.json({ error: 'projectId and email are required' }, { status: 400 })
  }

  // Shape check on email to catch obvious junk before hitting DB
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', email)
    .single()

  if (existing) {
    await supabase.from('lead_events').insert({
      lead_id: existing.id,
      event_type: 'form_submit',
      metadata: { source, ip, ...metadata },
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
      metadata: { ip, ...(metadata || {}) },
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
    metadata: { source, ip, ...metadata },
  })

  return NextResponse.json({ lead_id: lead.id, status: 'new' })
}

export const POST = wrapHandler(handlePost, 'leads/capture')
