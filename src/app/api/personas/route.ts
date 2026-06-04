import { createClient } from '@/lib/supabase/server'
import { getMarketingMemory } from '@/lib/marketing/memory'
import { inferPersonasFromMemory, normalizePersonaRow, personaToRow, type MarketingPersona, type PersonaSkepticism } from '@/lib/marketing/personas'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('project_id') ?? url.searchParams.get('projectId')
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('project_id', projectId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (!error && data && data.length > 0) {
    return Response.json({ personas: data.map((row) => normalizePersonaRow(row as Record<string, unknown>)), inferred: false })
  }

  const memory = await getMarketingMemory({ supabase, userId: user.id, projectId })
  return Response.json({ personas: inferPersonasFromMemory(memory), inferred: true })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as Partial<MarketingPersona> & { projectId?: string; project_id?: string } | null
  const projectId = body?.projectId ?? body?.project_id
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })
  if (!body?.name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  if (body.isPrimary) {
    await supabase.from('personas').update({ is_primary: false }).eq('project_id', projectId)
  }

  const { data, error } = await supabase
    .from('personas')
    .insert({
      ...personaToRow({
        ...body,
        skepticismLevel: normalizeSkepticism(body.skepticismLevel),
      }),
      user_id: user.id,
      project_id: projectId,
    })
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ persona: normalizePersonaRow(data as Record<string, unknown>) }, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as Partial<MarketingPersona> & { id?: string } | null
  if (!body?.id) return Response.json({ error: 'id required' }, { status: 400 })

  const { data: current } = await supabase
    .from('personas')
    .select('id, project_id')
    .eq('id', body.id)
    .maybeSingle()
  if (!current) return Response.json({ error: 'Persona not found' }, { status: 404 })

  const projectId = String((current as { project_id: string }).project_id)
  if (body.isPrimary) {
    await supabase.from('personas').update({ is_primary: false }).eq('project_id', projectId)
  }

  const { data, error } = await supabase
    .from('personas')
    .update(personaToRow({
      ...body,
      skepticismLevel: normalizeSkepticism(body.skepticismLevel),
    }))
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ persona: normalizePersonaRow(data as Record<string, unknown>) })
}

function normalizeSkepticism(value: unknown): PersonaSkepticism {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}
