import { describe, expect, it } from 'vitest'
import { normalizeExperimentLedgerRow } from './experiment-ledger'
import { buildExperimentLearning, experimentLearningPrompt } from './experiment-learning'

function experiment(id: string, projectId = 'p1', status = 'decided') {
  return normalizeExperimentLedgerRow({
    id, project_id: projectId, status, name: 'Proof-led headline', hypothesis: 'Proof copy improves signup rate.',
    decision: 'inconclusive', conclusion: 'Traffic was too low to choose a winner.',
    primary_metric: 'signup rate', guardrail_metric: 'bounce rate',
    minimum_sample_per_variant: 200, planned_duration_days: 7,
    control_exposures: 20, treatment_exposures: 25, control_value: 2, treatment_value: 3,
    started_at: '2026-07-01T00:00:00Z', ended_at: '2026-07-08T00:00:00Z',
    updated_at: '2026-07-08T00:00:00Z',
  })
}

describe('experiment learning for sprint planning', () => {
  it('keeps project history isolated and separates ongoing tests from lessons', () => {
    const learning = buildExperimentLearning([
      experiment('mine'), experiment('foreign', 'p2'), experiment('active', 'p1', 'running'),
    ], 'p1')
    expect(learning.completed.map((row) => row.id)).toEqual(['mine'])
    expect(learning.active.map((row) => row.id)).toEqual(['active'])
  })

  it('preserves incomplete samples and missing guardrails as uncertainty', () => {
    const learning = buildExperimentLearning([experiment('mine')], 'p1')
    expect(learning.completed[0]).toMatchObject({
      evidence: 'directional', guardrailRecorded: false, decision: 'inconclusive', observedLiftPct: 50,
    })
    expect(experimentLearningPrompt(learning)).toContain('not validated wins')
  })

  it('includes archived lessons and excludes unfinished conclusions', () => {
    const unfinished = { ...experiment('unfinished'), conclusion: null }
    const learning = buildExperimentLearning([unfinished, experiment('archived', 'p1', 'archived')], 'p1')
    expect(learning.completed.map((row) => row.id)).toEqual(['archived'])
  })

  it('bounds history to the twelve most recent completed lessons', () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      ...experiment(`exp-${index}`), endedAt: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
    }))
    const learning = buildExperimentLearning(rows, 'p1')
    expect(learning.completed).toHaveLength(12)
    expect(learning.completed[0].id).toBe('exp-14')
    expect(learning.completed[11].id).toBe('exp-3')
  })
})
