import { describe, expect, it } from 'vitest'
import {
  computeExperimentEvidence,
  experimentActionPatch,
  experimentCreateRow,
  ExperimentCreateSchema,
  normalizeExperimentLedgerRow,
  type ExperimentLedgerRow,
} from './experiment-ledger'

const baseRow: ExperimentLedgerRow = {
  id: 'exp-1', projectId: 'project-1', campaignId: null, personaId: null,
  name: 'Proof headline', hypothesis: 'Proof-led copy will improve qualified signup conversion.',
  variable: 'headline', control: 'Control', treatment: 'Treatment',
  primaryMetric: 'signup rate', guardrailMetric: 'activation rate', targetImprovementPct: 10,
  plannedDurationDays: 7, minimumSamplePerVariant: 100, decisionRule: 'Promote at ten percent lift.',
  channel: 'landing', status: 'ready', source: 'sprint', sourceKey: 'week:proof-headline',
  startedAt: null, endedAt: null, controlExposures: 0, treatmentExposures: 0,
  controlValue: null, treatmentValue: null, guardrailControlValue: null,
  guardrailTreatmentValue: null, observedLiftPct: null, decision: null, conclusion: null,
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
}

describe('experiment evidence ledger', () => {
  it('creates an immutable design snapshot', () => {
    const input = ExperimentCreateSchema.parse({
      projectId: 'project-1', name: baseRow.name, hypothesis: baseRow.hypothesis,
      variable: baseRow.variable, control: baseRow.control, treatment: baseRow.treatment,
      primaryMetric: baseRow.primaryMetric, guardrailMetric: baseRow.guardrailMetric,
      targetImprovementPct: 10, plannedDurationDays: 7, minimumSamplePerVariant: 100,
      decisionRule: baseRow.decisionRule, source: 'sprint', sourceKey: baseRow.sourceKey,
    })
    const row = experimentCreateRow(input, 'user-1')

    expect(row.status).toBe('ready')
    expect(row.design_snapshot).toEqual(expect.objectContaining({ variable: 'headline', primary_metric: 'signup rate' }))
  })

  it('starts only a ready experiment', () => {
    expect(experimentActionPatch(baseRow, { action: 'start' }, '2026-07-02T00:00:00.000Z')).toEqual({
      status: 'running', started_at: '2026-07-02T00:00:00.000Z', ended_at: null,
    })
    expect(() => experimentActionPatch({ ...baseRow, status: 'decided' }, { action: 'start' })).toThrow(/Cannot start/)
  })

  it('records a decision and calculates relative lift', () => {
    const patch = experimentActionPatch({ ...baseRow, status: 'running' }, {
      action: 'decide', controlExposures: 150, treatmentExposures: 145,
      controlValue: 10, treatmentValue: 12, decision: 'promote_treatment',
      conclusion: 'Treatment cleared the practical lift threshold.',
    }, '2026-07-10T00:00:00.000Z')

    expect(patch.status).toBe('decided')
    expect(patch.observed_lift_pct).toBe(20)
  })

  it('labels incomplete samples as directional', () => {
    const evidence = computeExperimentEvidence({
      ...baseRow, status: 'decided', startedAt: '2026-07-01T00:00:00.000Z',
      endedAt: '2026-07-08T00:00:00.000Z', controlExposures: 40, treatmentExposures: 45,
      controlValue: 10, treatmentValue: 11, observedLiftPct: 10,
    }, new Date('2026-07-08T00:00:00.000Z'))

    expect(evidence.label).toBe('directional')
    expect(evidence.sampleProgressPct).toBe(40)
    expect(evidence.note).toMatch(/directional/i)
  })

  it('labels completed plans without claiming significance', () => {
    const evidence = computeExperimentEvidence({
      ...baseRow, status: 'decided', startedAt: '2026-07-01T00:00:00.000Z',
      endedAt: '2026-07-08T00:00:00.000Z', controlExposures: 100, treatmentExposures: 110,
      controlValue: 10, treatmentValue: 12, observedLiftPct: 20,
    }, new Date('2026-07-08T00:00:00.000Z'))

    expect(evidence.label).toBe('sample-complete')
    expect(evidence.note).toMatch(/not.*statistical-significance/i)
  })

  it('normalizes numeric database values', () => {
    const row = normalizeExperimentLedgerRow({
      id: 'exp-1', project_id: 'project-1', name: 'Test', hypothesis: 'Long enough hypothesis text here',
      variable: 'headline', control: 'A', treatment: 'B', primary_metric: 'conversion',
      guardrail_metric: 'activation', target_improvement_pct: '12.5', planned_duration_days: 14,
      minimum_sample_per_variant: 200, decision_rule: 'Promote above threshold', status: 'running',
      source: 'sprint', control_exposures: 10, treatment_exposures: 12, created_at: 'a', updated_at: 'b',
    })

    expect(row.targetImprovementPct).toBe(12.5)
    expect(row.status).toBe('running')
  })
})
