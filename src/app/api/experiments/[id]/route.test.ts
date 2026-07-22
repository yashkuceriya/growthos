import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  user: { id: 'user_1' } as { id: string } | null,
  current: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
}
const updates: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      let patch: Record<string, unknown> | null = null
      const builder = {
        select: () => builder,
        update: (value: Record<string, unknown>) => {
          patch = value
          updates.push(value)
          return builder
        },
        eq: () => builder,
        maybeSingle: async () => ({ data: state.current, error: null }),
        single: async () => ({ data: state.updated ?? (patch ? { ...state.current, ...patch } : null), error: null }),
      }
      return builder
    },
  }),
}))

import { PATCH } from './route'

const ready = {
  id: 'experiment_1', project_id: 'project_1', campaign_id: null, persona_id: null,
  name: 'Proof-led headline', hypothesis: 'Showing a quantified proof point will increase qualified signup conversion.',
  variable: 'Headline proof', control: 'Ship faster', treatment: 'Ship 32% faster',
  primary_metric: 'Qualified signup rate', guardrail_metric: 'Bounce rate', target_improvement_pct: 10,
  planned_duration_days: 14, minimum_sample_per_variant: 200,
  decision_rule: 'Promote treatment if lift reaches target and guardrail remains stable.', channel: 'landing_page',
  status: 'ready', source: 'sprint', source_key: 'proof', started_at: null, ended_at: null,
  control_exposures: 0, treatment_exposures: 0, control_value: null, treatment_value: null,
  guardrail_control_value: null, guardrail_treatment_value: null, observed_lift_pct: null,
  decision: null, conclusion: null, created_at: '2026-07-22T00:00:00.000Z', updated_at: '2026-07-22T00:00:00.000Z',
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.current = ready
  state.updated = null
  updates.length = 0
})

describe('experiment lifecycle API', () => {
  it('starts a ready experiment', async () => {
    const response = await PATCH(new Request('https://app.test/api/experiments/experiment_1', {
      method: 'PATCH', body: JSON.stringify({ action: 'start' }),
    }))
    expect(response.status).toBe(200)
    expect(updates[0]).toMatchObject({ status: 'running', ended_at: null })
    expect(updates[0].started_at).toEqual(expect.any(String))
  })

  it('rejects an illegal transition without writing', async () => {
    const response = await PATCH(new Request('https://app.test/api/experiments/experiment_1', {
      method: 'PATCH', body: JSON.stringify({ action: 'archive' }),
    }))
    expect(response.status).toBe(409)
    expect(updates).toHaveLength(0)
  })

  it('records a decision and computed lift', async () => {
    state.current = { ...ready, status: 'running', started_at: '2026-07-01T00:00:00.000Z' }
    const response = await PATCH(new Request('https://app.test/api/experiments/experiment_1', {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'decide', controlExposures: 250, treatmentExposures: 260,
        controlValue: 10, treatmentValue: 12, decision: 'promote_treatment',
        conclusion: 'The treatment cleared the precommitted threshold.',
      }),
    }))
    expect(response.status).toBe(200)
    expect(updates[0]).toMatchObject({ status: 'decided', observed_lift_pct: 20, decision: 'promote_treatment' })
  })
})
