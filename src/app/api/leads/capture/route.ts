import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Public endpoint — no auth required. Used by landing pages and external forms. */
export async function POST(request: Request) {
  const body = await request.json()
  const { projectId, email, name, source, sourceId, metadata } = body

  if (!projectId || !email) {
    return NextResponse.json({ error: 'projectId and email are required' }, { status: 400 })
  }

  // Use service client to bypass RLS (public endpoint)
  const supabase = createServiceClient()

  // Get project owner
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Check for existing lead
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', email)
    .single()

  if (existing) {
    // Log event on existing lead
    await supabase.from('lead_events').insert({
      lead_id: existing.id,
      event_type: 'form_submit',
      metadata: { source, ...metadata },
    })
    return NextResponse.json({ lead_id: existing.id, status: 'existing' })
  }

  // Create new lead
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      user_id: project.user_id,
      project_id: projectId,
      email,
      name: name || null,
      source: source || 'direct',
      source_id: sourceId || null,
      metadata: metadata || {},
      score: 10, // base score for form submission
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log capture event
  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    event_type: 'captured',
    metadata: { source, ...metadata },
  })

  return NextResponse.json({ lead_id: lead.id, status: 'new' })
}
