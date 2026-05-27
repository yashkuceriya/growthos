// Enforces per-project monthly AI budgets before expensive routes run.
// Returns { ok: true } if under budget (or no cap set). Returns { ok: false, ... }
// with spend + cap numbers if over — caller returns 402 Payment Required.
//
// **Resilience**: if `project_month_ai_spend` RPC is missing (migration
// 012 or 025 not applied), we fall back to a direct sum query with a
// loud one-time warning. Without the fallback, missing-RPC made the
// entire budget cap silently fail-open (spend always read as 0).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface BudgetStatus {
  ok: boolean
  spent: number
  cap: number | null
  remaining: number | null
  unavailable?: boolean
  error?: string
}

let warnedAboutMissingRpc = false

async function monthSpend(supabase: SupabaseLike, projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc('project_month_ai_spend', { p_project_id: projectId })
  if (!error) return Number(data ?? 0)

  const msg = error.message ?? ''
  const isMissingRpc =
    error.code === 'PGRST202'
    || /could not find the function/i.test(msg)
    || /function .* does not exist/i.test(msg)

  if (!isMissingRpc) throw new Error(msg || 'project_month_ai_spend failed')

  if (!warnedAboutMissingRpc) {
    console.error(
      '[budget-guard] project_month_ai_spend RPC missing — apply supabase/migrations/025_rpc_redo.sql. '
      + 'Falling back to direct sum query.',
    )
    warnedAboutMissingRpc = true
  }

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: rows } = await supabase
    .from('ai_cost_ledger')
    .select('cost_usd')
    .eq('project_id', projectId)
    .gte('created_at', monthStart.toISOString()) as { data: Array<{ cost_usd: number | null }> | null }

  return (rows ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
}

export async function checkBudget(
  supabase: SupabaseLike,
  projectId: string,
): Promise<BudgetStatus> {
  try {
    const [{ data: project }, spent] = await Promise.all([
      supabase.from('projects').select('monthly_ai_budget_usd').eq('id', projectId).single(),
      monthSpend(supabase, projectId),
    ])

    const cap = project?.monthly_ai_budget_usd != null ? Number(project.monthly_ai_budget_usd) : null

    if (cap == null) return { ok: true, spent, cap: null, remaining: null }

    const remaining = cap - spent
    return { ok: spent < cap, spent, cap, remaining }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown budget guard error'
    console.error('[budget-guard] unable to evaluate budget cap:', msg)
    return {
      ok: false,
      spent: 0,
      cap: null,
      remaining: null,
      unavailable: true,
      error: msg,
    }
  }
}

export function budgetExceededResponse(status: BudgetStatus): Response {
  if (status.unavailable) {
    return Response.json(
      {
        error: 'Budget guard temporarily unavailable',
        reason: status.error ?? 'Could not compute monthly spend',
      },
      { status: 503 },
    )
  }

  return Response.json(
    {
      error: 'Monthly AI budget exceeded',
      spent_usd: +status.spent.toFixed(4),
      cap_usd: status.cap,
      remaining_usd: status.remaining,
    },
    { status: 402 },
  )
}
