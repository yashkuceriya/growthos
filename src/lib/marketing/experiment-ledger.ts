import { z } from 'zod'
import type { Json } from '@/lib/supabase/types'

export const EXPERIMENT_STATUSES = ['draft', 'ready', 'running', 'analyzing', 'decided', 'archived'] as const
export const EXPERIMENT_DECISIONS = ['promote_control', 'promote_treatment', 'iterate', 'inconclusive', 'stop'] as const

export type ExperimentLedgerStatus = typeof EXPERIMENT_STATUSES[number]
export type ExperimentDecision = typeof EXPERIMENT_DECISIONS[number]
export type ExperimentEvidenceLabel = 'no-signal' | 'directional' | 'sample-complete'

export const ExperimentCreateSchema = z.object({
  projectId: z.string().min(1),
  campaignId: z.string().min(1).nullable().optional(),
  personaId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(3).max(160),
  hypothesis: z.string().trim().min(24).max(1_000),
  variable: z.string().trim().min(2).max(240),
  control: z.string().trim().min(1).max(2_000),
  treatment: z.string().trim().min(1).max(2_000),
  primaryMetric: z.string().trim().min(2).max(240),
  guardrailMetric: z.string().trim().min(2).max(240),
  targetImprovementPct: z.number().positive().max(1_000),
  plannedDurationDays: z.number().int().min(1).max(365),
  minimumSamplePerVariant: z.number().int().positive().max(100_000_000),
  decisionRule: z.string().trim().min(8).max(1_000),
  channel: z.string().trim().max(120).nullable().optional(),
  source: z.enum(['manual', 'sprint', 'campaign', 'agent']).default('manual'),
  sourceKey: z.string().trim().min(1).max(240).nullable().optional(),
})

export const ExperimentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('analyze') }),
  z.object({
    action: z.literal('decide'),
    controlExposures: z.number().int().nonnegative(),
    treatmentExposures: z.number().int().nonnegative(),
    controlValue: z.number().finite(),
    treatmentValue: z.number().finite(),
    guardrailControlValue: z.number().finite().nullable().optional(),
    guardrailTreatmentValue: z.number().finite().nullable().optional(),
    decision: z.enum(EXPERIMENT_DECISIONS),
    conclusion: z.string().trim().min(8).max(2_000),
  }),
  z.object({ action: z.literal('archive') }),
])

export type ExperimentCreateInput = z.infer<typeof ExperimentCreateSchema>
export type ExperimentActionInput = z.infer<typeof ExperimentActionSchema>

export interface ExperimentLedgerRow {
  id: string
  projectId: string
  campaignId: string | null
  personaId: string | null
  name: string
  hypothesis: string
  variable: string
  control: string
  treatment: string
  primaryMetric: string
  guardrailMetric: string
  targetImprovementPct: number
  plannedDurationDays: number
  minimumSamplePerVariant: number
  decisionRule: string
  channel: string | null
  status: ExperimentLedgerStatus
  source: 'manual' | 'sprint' | 'campaign' | 'agent'
  sourceKey: string | null
  startedAt: string | null
  endedAt: string | null
  controlExposures: number
  treatmentExposures: number
  controlValue: number | null
  treatmentValue: number | null
  guardrailControlValue: number | null
  guardrailTreatmentValue: number | null
  observedLiftPct: number | null
  decision: ExperimentDecision | null
  conclusion: string | null
  createdAt: string
  updatedAt: string
}

export interface ExperimentEvidence {
  label: ExperimentEvidenceLabel
  sampleProgressPct: number
  durationProgressPct: number
  observedLiftPct: number | null
  guardrailDeltaPct: number | null
  note: string
}

export function experimentCreateRow(input: ExperimentCreateInput, userId: string): Record<string, unknown> {
  const designSnapshot = {
    name: input.name,
    hypothesis: input.hypothesis,
    variable: input.variable,
    control: input.control,
    treatment: input.treatment,
    primary_metric: input.primaryMetric,
    guardrail_metric: input.guardrailMetric,
    target_improvement_pct: input.targetImprovementPct,
    planned_duration_days: input.plannedDurationDays,
    minimum_sample_per_variant: input.minimumSamplePerVariant,
    decision_rule: input.decisionRule,
    channel: input.channel ?? null,
  } satisfies Json

  return {
    user_id: userId,
    project_id: input.projectId,
    campaign_id: input.campaignId ?? null,
    persona_id: input.personaId ?? null,
    name: input.name,
    hypothesis: input.hypothesis,
    variable: input.variable,
    control: input.control,
    treatment: input.treatment,
    primary_metric: input.primaryMetric,
    guardrail_metric: input.guardrailMetric,
    target_improvement_pct: input.targetImprovementPct,
    planned_duration_days: input.plannedDurationDays,
    minimum_sample_per_variant: input.minimumSamplePerVariant,
    decision_rule: input.decisionRule,
    channel: input.channel ?? null,
    status: 'ready',
    source: input.source,
    source_key: input.sourceKey ?? null,
    design_snapshot: designSnapshot,
  }
}

export function experimentActionPatch(
  current: ExperimentLedgerRow,
  input: ExperimentActionInput,
  now = new Date().toISOString(),
): Record<string, unknown> {
  if (input.action === 'start') {
    assertStatus(current.status, ['ready'], 'start')
    return { status: 'running', started_at: current.startedAt ?? now, ended_at: null }
  }
  if (input.action === 'analyze') {
    assertStatus(current.status, ['running'], 'analyze')
    return { status: 'analyzing' }
  }
  if (input.action === 'archive') {
    assertStatus(current.status, ['decided'], 'archive')
    return { status: 'archived' }
  }

  assertStatus(current.status, ['running', 'analyzing'], 'decide')
  return {
    status: 'decided',
    ended_at: now,
    control_exposures: input.controlExposures,
    treatment_exposures: input.treatmentExposures,
    control_value: input.controlValue,
    treatment_value: input.treatmentValue,
    guardrail_control_value: input.guardrailControlValue ?? null,
    guardrail_treatment_value: input.guardrailTreatmentValue ?? null,
    observed_lift_pct: relativeLift(input.controlValue, input.treatmentValue),
    decision: input.decision,
    conclusion: input.conclusion,
  }
}

export function computeExperimentEvidence(row: ExperimentLedgerRow, now = new Date()): ExperimentEvidence {
  const smallestSample = Math.min(row.controlExposures, row.treatmentExposures)
  const sampleProgressPct = progress(smallestSample, row.minimumSamplePerVariant)
  const elapsedDays = durationDays(row.startedAt, row.endedAt, now)
  const durationProgressPct = progress(elapsedDays, row.plannedDurationDays)
  const observedLiftPct = row.observedLiftPct ?? relativeLift(row.controlValue, row.treatmentValue)
  const guardrailDeltaPct = relativeLift(row.guardrailControlValue, row.guardrailTreatmentValue)
  const hasSignal = row.controlValue !== null && row.treatmentValue !== null && smallestSample > 0
  const sampleComplete = hasSignal && sampleProgressPct >= 100 && durationProgressPct >= 100

  if (!hasSignal) {
    return {
      label: 'no-signal',
      sampleProgressPct,
      durationProgressPct,
      observedLiftPct,
      guardrailDeltaPct,
      note: 'No comparable outcome signal has been recorded yet.',
    }
  }
  if (!sampleComplete) {
    return {
      label: 'directional',
      sampleProgressPct,
      durationProgressPct,
      observedLiftPct,
      guardrailDeltaPct,
      note: 'Useful directional evidence, but the precommitted sample or duration is incomplete.',
    }
  }
  return {
    label: 'sample-complete',
    sampleProgressPct,
    durationProgressPct,
    observedLiftPct,
    guardrailDeltaPct,
    note: 'The planned sample and duration are complete; this is not by itself a statistical-significance claim.',
  }
}

export function normalizeExperimentLedgerRow(raw: unknown): ExperimentLedgerRow {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  return {
    id: string(row.id),
    projectId: string(row.project_id),
    campaignId: nullableString(row.campaign_id),
    personaId: nullableString(row.persona_id),
    name: string(row.name),
    hypothesis: string(row.hypothesis),
    variable: string(row.variable),
    control: string(row.control),
    treatment: string(row.treatment),
    primaryMetric: string(row.primary_metric),
    guardrailMetric: string(row.guardrail_metric),
    targetImprovementPct: number(row.target_improvement_pct),
    plannedDurationDays: number(row.planned_duration_days),
    minimumSamplePerVariant: number(row.minimum_sample_per_variant),
    decisionRule: string(row.decision_rule),
    channel: nullableString(row.channel),
    status: status(row.status),
    source: source(row.source),
    sourceKey: nullableString(row.source_key),
    startedAt: nullableString(row.started_at),
    endedAt: nullableString(row.ended_at),
    controlExposures: number(row.control_exposures),
    treatmentExposures: number(row.treatment_exposures),
    controlValue: nullableNumber(row.control_value),
    treatmentValue: nullableNumber(row.treatment_value),
    guardrailControlValue: nullableNumber(row.guardrail_control_value),
    guardrailTreatmentValue: nullableNumber(row.guardrail_treatment_value),
    observedLiftPct: nullableNumber(row.observed_lift_pct),
    decision: decision(row.decision),
    conclusion: nullableString(row.conclusion),
    createdAt: string(row.created_at),
    updatedAt: string(row.updated_at),
  }
}

function assertStatus(current: ExperimentLedgerStatus, allowed: ExperimentLedgerStatus[], action: string) {
  if (!allowed.includes(current)) throw new Error(`Cannot ${action} an experiment with status ${current}`)
}

function relativeLift(control: number | null, treatment: number | null): number | null {
  if (control === null || treatment === null || control === 0) return null
  return Math.round(((treatment - control) / Math.abs(control)) * 10_000) / 100
}

function durationDays(start: string | null, end: string | null, now: Date): number {
  if (!start) return 0
  const startMs = Date.parse(start)
  const endMs = end ? Date.parse(end) : now.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  return (endMs - startMs) / 86_400_000
}

function progress(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / target) * 100)))
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value)
}

function status(value: unknown): ExperimentLedgerStatus {
  return EXPERIMENT_STATUSES.includes(value as ExperimentLedgerStatus) ? value as ExperimentLedgerStatus : 'draft'
}

function decision(value: unknown): ExperimentDecision | null {
  return EXPERIMENT_DECISIONS.includes(value as ExperimentDecision) ? value as ExperimentDecision : null
}

function source(value: unknown): ExperimentLedgerRow['source'] {
  return value === 'sprint' || value === 'campaign' || value === 'agent' ? value : 'manual'
}
