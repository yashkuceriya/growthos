export interface ManualWorklogTask {
  id: string
  owner: string
  title: string
  detail: string
  metric: string
  channel: string | null
  done: boolean
  completedAt: string | null
}

export interface ManualWorklog {
  savedAt: string | null
  updatedAt: string | null
  goal: string | null
  angle: string | null
  briefMarkdown: string | null
  tasks: ManualWorklogTask[]
}

export interface ManualWorklogProgress {
  total: number
  done: number
  nextTitle: string | null
}

export function readManualWorklog(metadata: Record<string, unknown> | null | undefined): ManualWorklog | null {
  const raw = metadata?.manual_launch_tracker
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const tasksRaw = Array.isArray(record.tasks) ? record.tasks : []
  const tasks = tasksRaw
    .map(readManualWorklogTask)
    .filter((task): task is ManualWorklogTask => task !== null)
  if (tasks.length === 0) return null
  return {
    savedAt: typeof record.saved_at === 'string' ? record.saved_at : null,
    updatedAt: typeof record.updated_at === 'string' ? record.updated_at : null,
    goal: typeof record.goal === 'string' ? record.goal : null,
    angle: typeof record.angle === 'string' ? record.angle : null,
    briefMarkdown: typeof record.brief_markdown === 'string' ? record.brief_markdown : null,
    tasks,
  }
}

export function manualWorklogProgress(worklog: ManualWorklog | null): ManualWorklogProgress {
  if (!worklog) return { total: 0, done: 0, nextTitle: null }
  let done = 0
  let nextTitle: string | null = null
  for (const task of worklog.tasks) {
    if (task.done) done += 1
    else if (!nextTitle) nextTitle = task.title
  }
  return { total: worklog.tasks.length, done, nextTitle }
}

export function completedManualWorklogTasks(worklog: ManualWorklog | null): ManualWorklogTask[] {
  if (!worklog) return []
  return worklog.tasks.filter((task) => task.done)
}

function readManualWorklogTask(item: unknown): ManualWorklogTask | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const task = item as Record<string, unknown>
  const id = typeof task.id === 'string' ? task.id : null
  const title = typeof task.title === 'string' ? task.title : null
  if (!id || !title) return null
  return {
    id,
    owner: typeof task.owner === 'string' ? task.owner : 'Manual',
    title,
    detail: typeof task.detail === 'string' ? task.detail : '',
    metric: typeof task.metric === 'string' ? task.metric : 'Manual outcome',
    channel: typeof task.channel === 'string' ? task.channel : null,
    done: task.done === true,
    completedAt: typeof task.completed_at === 'string' ? task.completed_at : null,
  }
}
