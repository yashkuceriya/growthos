import { createClient } from '@/lib/supabase/server'

interface ManualTaskPayload {
  id?: unknown
  owner?: unknown
  title?: unknown
  detail?: unknown
  metric?: unknown
  channel?: unknown
  done?: unknown
}

interface ManualCampaignPayload {
  projectId?: unknown
  campaignId?: unknown
  name?: unknown
  channels?: unknown
  goal?: unknown
  angle?: unknown
  persona?: unknown
  briefMarkdown?: unknown
  tasks?: unknown
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as ManualCampaignPayload
  const validated = validatePayload(body)
  if ('error' in validated) return Response.json({ error: validated.error }, { status: 400 })

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', validated.projectId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; name: string } | null }
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const tracker = {
    saved_at: new Date().toISOString(),
    source: 'manual_launch_tracker',
    goal: validated.goal,
    angle: validated.angle,
    persona: validated.persona,
    brief_markdown: validated.briefMarkdown,
    tasks: validated.tasks,
  }

  if (validated.campaignId) {
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id, metadata')
      .eq('id', validated.campaignId)
      .eq('project_id', validated.projectId)
      .eq('user_id', user.id)
      .maybeSingle() as { data: { id: string; metadata: Record<string, unknown> | null } | null }
    if (!existing) return Response.json({ error: 'Campaign not found' }, { status: 404 })

    const nextMetadata = {
      ...(existing.metadata ?? {}),
      manual_launch_tracker: tracker,
    }
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        channels: validated.channels,
        metadata: nextMetadata,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select('id, metadata')
      .maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ campaign: data, action: 'updated' })
  }

  const name = validated.name || `Manual Launch · ${new Date().toISOString().slice(0, 10)}`
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      project_id: validated.projectId,
      name,
      description: `Manual launch plan for ${project.name}`,
      status: 'draft',
      channels: validated.channels,
      kpis: {},
      metadata: {
        manual_launch_tracker: tracker,
      },
    })
    .select('id, metadata')
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ campaign: data, action: 'created' }, { status: 201 })
}

interface ValidatedPayload {
  projectId: string
  campaignId: string | null
  name: string | null
  channels: string[]
  goal: string | null
  angle: string | null
  persona: Record<string, unknown> | null
  briefMarkdown: string
  tasks: Array<Record<string, unknown>>
}

function validatePayload(body: ManualCampaignPayload): ValidatedPayload | { error: string } {
  if (typeof body.projectId !== 'string' || body.projectId.trim().length === 0) {
    return { error: 'projectId required' }
  }
  if (body.campaignId != null && (typeof body.campaignId !== 'string' || body.campaignId.trim().length === 0)) {
    return { error: 'campaignId must be a string when provided' }
  }
  if (!Array.isArray(body.channels) || body.channels.length === 0) {
    return { error: 'channels must be a non-empty array' }
  }
  const channels = Array.from(new Set(body.channels.filter((channel): channel is string =>
    typeof channel === 'string' && /^[a-z0-9_\-]{1,32}$/.test(channel),
  )))
  if (channels.length === 0) return { error: 'channels must contain valid channel ids' }

  if (typeof body.briefMarkdown !== 'string' || body.briefMarkdown.trim().length < 20) {
    return { error: 'briefMarkdown required' }
  }
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    return { error: 'tasks must be a non-empty array' }
  }
  const tasks = body.tasks.slice(0, 50).map(normalizeTask).filter((task): task is Record<string, unknown> => task !== null)
  if (tasks.length === 0) return { error: 'tasks must contain valid task rows' }

  return {
    projectId: body.projectId.trim(),
    campaignId: typeof body.campaignId === 'string' ? body.campaignId.trim() : null,
    name: typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim().slice(0, 120) : null,
    channels,
    goal: typeof body.goal === 'string' && body.goal.trim().length > 0 ? body.goal.trim().slice(0, 80) : null,
    angle: typeof body.angle === 'string' && body.angle.trim().length > 0 ? body.angle.trim().slice(0, 500) : null,
    persona: body.persona && typeof body.persona === 'object' && !Array.isArray(body.persona)
      ? body.persona as Record<string, unknown>
      : null,
    briefMarkdown: body.briefMarkdown.trim().slice(0, 20_000),
    tasks,
  }
}

function normalizeTask(task: ManualTaskPayload): Record<string, unknown> | null {
  if (!task || typeof task !== 'object') return null
  const id = typeof task.id === 'string' ? task.id.trim().slice(0, 80) : ''
  const title = typeof task.title === 'string' ? task.title.trim().slice(0, 200) : ''
  const detail = typeof task.detail === 'string' ? task.detail.trim().slice(0, 1000) : ''
  const metric = typeof task.metric === 'string' ? task.metric.trim().slice(0, 300) : ''
  if (!id || !title || !detail || !metric) return null
  return {
    id,
    owner: typeof task.owner === 'string' ? task.owner.slice(0, 80) : 'Manual',
    title,
    detail,
    metric,
    channel: typeof task.channel === 'string' ? task.channel.slice(0, 32) : null,
    done: task.done === true,
  }
}
