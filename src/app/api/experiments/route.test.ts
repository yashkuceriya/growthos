import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  user: { id: 'user_1' } as { id: string } | null,
  project: { id: 'project_1' } as { id: string } | null,
  experiments: [] as Array<Record<string, unknown>>,
  existing: null as Record<string, unknown> | null,
  inserted: null as Record<string, unknown> | null,
}

const inserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => query(table),
  }),
}))

function query(table: string) {
  let operation = 'select'
  let payload: Record<string, unknown> | null = null
  const filters: Record<string, unknown> = {}
  const builder = {
    select: () => builder,
    insert: (value: Record<string, unknown>) => {
      operation = 'insert'
      payload = value
      inserts.push(value)
      return builder
    },
    eq: (key: string, value: unknown) => {
      filters[key] = value
      return builder
    },
    order: async () => ({ data: state.experiments, error: null }),
    maybeSingle: async () => ({
      data: table === 'projects'
        ? state.project
        : table === 'marketing_experiments' && filters.source_key
          ? state.existing
          : null,
      error: null,
    }),
    single: async () => ({ data: operation === 'insert' ? state.inserted ?? payload : null, error: null }),
  }
  return builder
}

import { GET, POST } from './route'

const rawExperiment = {
  id: 'experiment_1', project_id: 'project_1', campaign_id: null, persona_id: null,
  name: 'Proof-led headline', hypothesis: 'Showing a quantified proof point will increase qualified signup conversion.',
  variable: 'Headline proof', control: 'Ship faster', treatment: 'Ship 32% faster',
  primary_metric: 'Qualified signup rate', guardrail_metric: 'Bounce rate',
  target_improvement_pct: 10, planned_duration_days: 14, minimum_sample_per_variant: 200,
  decision_rule: 'Promote treatment if lift reaches target and guardrail remains stable.', channel: 'landing_page',
  status: 'ready', source: 'sprint', source_key: '2026-07-22:proof', started_at: null, ended_at: null,
  control_exposures: 0, treatment_exposures: 0, control_value: null, treatment_value: null,
  guardrail_control_value: null, guardrail_treatment_value: null, observed_lift_pct: null,
  decision: null, conclusion: null, created_at: '2026-07-22T00:00:00.000Z', updated_at: '2026-07-22T00:00:00.000Z',
}

const createBody = {
  projectId: 'project_1', name: rawExperiment.name, hypothesis: rawExperiment.hypothesis,
  variable: rawExperiment.variable, control: rawExperiment.control, treatment: rawExperiment.treatment,
  primaryMetric: rawExperiment.primary_metric, guardrailMetric: rawExperiment.guardrail_metric,
  targetImprovementPct: 10, plannedDurationDays: 14, minimumSamplePerVariant: 200,
  decisionRule: rawExperiment.decision_rule, channel: 'landing_page', source: 'sprint', sourceKey: rawExperiment.source_key,
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.project = { id: 'project_1' }
  state.experiments = []
  state.existing = null
  state.inserted = rawExperiment
  inserts.length = 0
})

describe('experiments collection API', () => {
  it('requires authentication', async () => {
    state.user = null
    const response = await GET(new Request('https://app.test/api/experiments?project_id=project_1'))
    expect(response.status).toBe(401)
  })

  it('lists normalized project experiments', async () => {
    state.experiments = [rawExperiment]
    const response = await GET(new Request('https://app.test/api/experiments?project_id=project_1'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.experiments[0]).toMatchObject({ id: 'experiment_1', projectId: 'project_1', status: 'ready' })
  })

  it('creates an immutable experiment contract', async () => {
    const response = await POST(new Request('https://app.test/api/experiments', {
      method: 'POST', body: JSON.stringify(createBody),
    }))
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(body.created).toBe(true)
    expect(inserts[0]).toMatchObject({ user_id: 'user_1', project_id: 'project_1', status: 'ready' })
    expect(inserts[0].design_snapshot).toMatchObject({ hypothesis: rawExperiment.hypothesis })
  })

  it('returns the prior row for an idempotent source key', async () => {
    state.existing = rawExperiment
    const response = await POST(new Request('https://app.test/api/experiments', {
      method: 'POST', body: JSON.stringify(createBody),
    }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.created).toBe(false)
    expect(inserts).toHaveLength(0)
  })
})
