import { wrapHandler } from '@/lib/api-error'
import {
  ExperimentCreateSchema,
  experimentCreateRow,
  normalizeExperimentLedgerRow,
} from '@/lib/marketing/experiment-ledger'
import { createClient } from '@/lib/supabase/server'

async function handleGet(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = new URL(request.url).searchParams.get('project_id')
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('marketing_experiments')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ experiments: (data ?? []).map(normalizeExperimentLedgerRow) })
}

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ExperimentCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid experiment', issues: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', input.projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const invalidLink = await validateLink(supabase, 'campaigns', input.campaignId, input.projectId, user.id)
    ?? await validateLink(supabase, 'personas', input.personaId, input.projectId, user.id)
  if (invalidLink) return invalidLink

  if (input.sourceKey) {
    const { data: existing } = await supabase
      .from('marketing_experiments')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('source_key', input.sourceKey)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) {
      return Response.json({ experiment: normalizeExperimentLedgerRow(existing), created: false })
    }
  }

  const { data, error } = await supabase
    .from('marketing_experiments')
    .insert(experimentCreateRow(input, user.id))
    .select('*')
    .single()

  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Could not save experiment' }, { status: 500 })
  }
  return Response.json({ experiment: normalizeExperimentLedgerRow(data), created: true }, { status: 201 })
}

async function validateLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'campaigns' | 'personas',
  id: string | null | undefined,
  projectId: string,
  userId: string,
): Promise<Response | null> {
  if (!id) return null
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return data ? null : Response.json({ error: `${table === 'campaigns' ? 'Campaign' : 'Persona'} not found` }, { status: 404 })
}

export const GET = wrapHandler(handleGet, 'experiments')
export const POST = wrapHandler(handlePost, 'experiments')
