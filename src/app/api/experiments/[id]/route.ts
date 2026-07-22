import { wrapHandler } from '@/lib/api-error'
import {
  ExperimentActionSchema,
  experimentActionPatch,
  normalizeExperimentLedgerRow,
} from '@/lib/marketing/experiment-ledger'
import { createClient } from '@/lib/supabase/server'

async function handlePatch(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = experimentId(request.url)
  if (!id) return Response.json({ error: 'Experiment id required' }, { status: 400 })

  const parsed = ExperimentActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid experiment action', issues: parsed.error.flatten() }, { status: 400 })
  }

  const { data: currentRaw } = await supabase
    .from('marketing_experiments')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!currentRaw) return Response.json({ error: 'Experiment not found' }, { status: 404 })

  const current = normalizeExperimentLedgerRow(currentRaw)
  let patch: Record<string, unknown>
  try {
    patch = experimentActionPatch(current, parsed.data)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid experiment transition' },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('marketing_experiments')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Could not update experiment' }, { status: 500 })
  }
  return Response.json({ experiment: normalizeExperimentLedgerRow(data) })
}

function experimentId(url: string): string | null {
  const parts = new URL(url).pathname.split('/').filter(Boolean)
  const index = parts.lastIndexOf('experiments')
  return index >= 0 && parts[index + 1] ? decodeURIComponent(parts[index + 1]) : null
}

export const PATCH = wrapHandler(handlePatch, 'experiments/:id')
