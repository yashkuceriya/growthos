import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  project: { name: 'App', description: 'Internal app', brand_voice: {} } as Record<string, unknown> | null,
  historyError: null as { message: string } | null,
  history: [] as Record<string, unknown>[],
  reviews: [] as { experiment_id: string; application: string }[],
  filters: [] as [string, unknown][],
}))
const generate = vi.hoisted(() => vi.fn())
const merge = vi.hoisted(() => vi.fn())
const cost = vi.hoisted(() => vi.fn())
const budget = vi.hoisted(() => vi.fn())

vi.mock('ai', () => ({ generateObject: generate }))
vi.mock('@/lib/ai/models', () => ({ modelFor: () => 'test-model' }))
vi.mock('@/lib/brand-voice', () => ({ mergeBrandVoice: merge }))
vi.mock('@/lib/cost-tracker', () => ({ trackAICost: cost }))
vi.mock('@/lib/budget-guard', () => ({
  checkBudget: budget,
  budgetExceededResponse: () => Response.json({ error: 'Budget exceeded' }, { status: 402 }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query },
        maybeSingle: async () => ({ data: state.project, error: null }),
        order: async () => ({ data: state.history, error: state.historyError }),
      }
      return query
    },
  }),
}))

import { POST } from './route'

function request(body: unknown = { projectId: 'p1' }) {
  return new Request('https://app.test/api/agency/sprint', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = { id: 'u1' }
  state.project = { name: 'App', description: 'Internal app', brand_voice: {} }
  state.historyError = null
  state.history = [{
    id: 'e1', project_id: 'p1', name: 'Proof test', status: 'decided', decision: 'inconclusive',
    conclusion: 'Low traffic; repeat with more exposure.', primary_metric: 'signup rate',
    minimum_sample_per_variant: 200, planned_duration_days: 7, control_exposures: 20,
    treatment_exposures: 25, control_value: 2, treatment_value: 3,
  }]
  state.reviews = [{ experiment_id: 'e1', application: 'Repeat with more traffic before scaling.' }]
  state.filters = []
  budget.mockResolvedValue({ ok: true })
  merge.mockResolvedValue({})
  cost.mockResolvedValue(undefined)
  generate.mockImplementation(async ({ schema }) => ({ object: schema.parse({
    sprint_theme: 'Improve activation', north_star: 'Qualified signups',
    deliverables: Array.from({ length: 12 }, () => ({ day: 'Mon', time: '9 AM', channel: 'blog_publish', title: 'Draft', owner: 'Copywriter', estimated_effort_minutes: 30, success_metric: 'Signups' })),
    experiments_to_run: Array.from({ length: 2 }, () => ({ name: 'Proof test', hypothesis: 'Specific proof improves qualified conversion.', variable: 'headline', variant_a: 'A', variant_b: 'B', primary_metric: 'signup rate', guardrail_metric: 'activation rate', target_improvement_pct: 10, duration_days: 7, minimum_sample_per_variant: 200, decision_rule: 'Repeat if inconclusive.', channel: 'landing' })),
    check_ins: [], week_end_review: 'Review qualified signups', evidence_review: state.reviews,
  }) }))
})

describe('evidence-aware sprint generation', () => {
  it('passes observed evidence to the agent and preserves the exact snapshot with its citations', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(generate.mock.calls[0][0].messages[0].content).toContain('Low traffic; repeat with more exposure.')
    expect(merge.mock.calls[0][2].current_sprint).toMatchObject({
      evidence_review: state.reviews,
      evidence_snapshot: { completed: [expect.objectContaining({ id: 'e1', evidence: 'directional' })] },
    })
    expect(state.filters).toContainEqual(['user_id', 'u1'])
    expect(state.filters).toContainEqual(['project_id', 'p1'])
  })

  it('rejects invented evidence references without persisting the sprint', async () => {
    state.reviews = [{ experiment_id: 'invented', application: 'Scale the winning headline.' }]
    expect((await POST(request())).status).toBe(502)
    expect(merge).not.toHaveBeenCalled()
    expect(cost).toHaveBeenCalledOnce()
  })

  it('does not spend AI calls when history is unavailable', async () => {
    state.historyError = { message: 'Missing table' }
    expect((await POST(request())).status).toBe(503)
    expect(generate).not.toHaveBeenCalled()
  })

  it('accepts a first sprint with no completed evidence', async () => {
    state.history = []
    state.reviews = []
    expect((await POST(request())).status).toBe(200)
    expect(merge.mock.calls[0][2].current_sprint.evidence_snapshot.completed).toEqual([])
  })

  it('requires an authenticated owned project before reading evidence or checking budget', async () => {
    state.user = null
    expect((await POST(request())).status).toBe(401)
    state.user = { id: 'u1' }
    state.project = null
    expect((await POST(request())).status).toBe(404)
    expect(budget).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('validates request bodies before querying project evidence', async () => {
    expect((await POST(request({ projectId: 42 }))).status).toBe(400)
    expect(state.filters).toHaveLength(0)
  })
})
