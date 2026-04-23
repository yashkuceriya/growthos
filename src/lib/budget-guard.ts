// Enforces per-project monthly AI budgets before expensive routes run.
// Returns { ok: true } if under budget (or no cap set). Returns { ok: false, ... }
// with spend + cap numbers if over — caller returns 402 Payment Required.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface BudgetStatus {
  ok: boolean
  spent: number
  cap: number | null
  remaining: number | null
}

export async function checkBudget(
  supabase: SupabaseLike,
  projectId: string,
): Promise<BudgetStatus> {
  const [{ data: project }, { data: spendResult }] = await Promise.all([
    supabase.from('projects').select('monthly_ai_budget_usd').eq('id', projectId).single(),
    supabase.rpc('project_month_ai_spend', { p_project_id: projectId }),
  ])

  const cap = project?.monthly_ai_budget_usd != null ? Number(project.monthly_ai_budget_usd) : null
  const spent = Number(spendResult ?? 0)

  if (cap == null) return { ok: true, spent, cap: null, remaining: null }

  const remaining = cap - spent
  return { ok: spent < cap, spent, cap, remaining }
}

export function budgetExceededResponse(status: BudgetStatus): Response {
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
