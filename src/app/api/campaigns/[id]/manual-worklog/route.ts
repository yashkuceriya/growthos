import { createClient } from '@/lib/supabase/server'

interface PatchPayload {
  taskId?: unknown
  done?: unknown
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await ctx.params
  if (!campaignId) return Response.json({ error: 'campaign id required' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as PatchPayload
  if (typeof body.taskId !== 'string' || body.taskId.trim().length === 0) {
    return Response.json({ error: 'taskId required' }, { status: 400 })
  }
  if (typeof body.done !== 'boolean') {
    return Response.json({ error: 'done must be boolean' }, { status: 400 })
  }
  const taskId = body.taskId.trim()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, metadata')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; metadata: Record<string, unknown> | null } | null }
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 })

  const metadata = campaign.metadata ?? {}
  const tracker = metadata.manual_launch_tracker
  if (!tracker || typeof tracker !== 'object' || Array.isArray(tracker)) {
    return Response.json({ error: 'Manual worklog not found' }, { status: 404 })
  }
  const trackerRecord = tracker as Record<string, unknown>
  const tasks = Array.isArray(trackerRecord.tasks) ? trackerRecord.tasks : []
  let found = false
  const nextTasks = tasks.map((task) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return task
    const taskRecord = task as Record<string, unknown>
    if (taskRecord.id !== taskId) return task
    found = true
    return {
      ...taskRecord,
      done: body.done,
      completed_at: body.done ? new Date().toISOString() : null,
    }
  })
  if (!found) return Response.json({ error: 'Task not found' }, { status: 404 })

  const nextTracker = {
    ...trackerRecord,
    updated_at: new Date().toISOString(),
    tasks: nextTasks,
  }
  const nextMetadata = {
    ...metadata,
    manual_launch_tracker: nextTracker,
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update({ metadata: nextMetadata })
    .eq('id', campaign.id)
    .eq('user_id', user.id)
    .select('id, metadata')
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ campaign: data, tracker: nextTracker })
}
