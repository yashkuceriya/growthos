export type ExperimentReadiness = 'ready' | 'needs-work' | 'draft'
export type ExperimentDesignStrength = 'high' | 'medium' | 'low'

export interface MarketingExperiment {
  id: string
  name: string
  hypothesis: string
  variable: string | null
  control: string
  treatment: string
  primaryMetric: string | null
  guardrailMetric: string | null
  targetImprovementPct: number | null
  durationDays: number | null
  minimumSamplePerVariant: number | null
  decisionRule: string | null
  channel: string | null
  score: number
  readiness: ExperimentReadiness
  designStrength: ExperimentDesignStrength
  issues: string[]
}

export interface ExperimentPortfolioSummary {
  total: number
  ready: number
  needsWork: number
  averageScore: number
}

export function normalizeExperimentPlan(raw: unknown, index = 0): MarketingExperiment {
  const row = object(raw)
  const name = text(row.name) || `Experiment ${index + 1}`
  const hypothesis = text(row.hypothesis)
  const variable = nullableText(row.variable)
  const control = text(row.variant_a ?? row.control)
  const treatment = text(row.variant_b ?? row.treatment)
  const primaryMetric = nullableText(row.primary_metric ?? row.primaryMetric ?? row.success_metric)
  const guardrailMetric = nullableText(row.guardrail_metric ?? row.guardrailMetric)
  const targetImprovementPct = positiveNumber(row.target_improvement_pct ?? row.targetImprovementPct)
  const durationDays = positiveInteger(row.duration_days ?? row.durationDays)
  const minimumSamplePerVariant = positiveInteger(row.minimum_sample_per_variant ?? row.minimumSamplePerVariant)
  const decisionRule = nullableText(row.decision_rule ?? row.decisionRule)
  const channel = nullableText(row.channel)

  const checks = [
    { points: 15, ok: hypothesis.length >= 24, issue: 'Write a specific, falsifiable hypothesis.' },
    { points: 10, ok: !!variable, issue: 'Name the single variable being changed.' },
    { points: 15, ok: !!control && !!treatment && control.toLowerCase() !== treatment.toLowerCase(), issue: 'Define distinct control and treatment variants.' },
    { points: 15, ok: !!primaryMetric, issue: 'Choose one primary success metric.' },
    { points: 10, ok: !!guardrailMetric, issue: 'Add a guardrail metric to catch harmful tradeoffs.' },
    { points: 10, ok: targetImprovementPct !== null, issue: 'Set the minimum improvement worth acting on.' },
    { points: 10, ok: durationDays !== null && durationDays >= 7, issue: 'Run for at least seven days to cover weekly behavior.' },
    { points: 5, ok: minimumSamplePerVariant !== null && minimumSamplePerVariant >= 50, issue: 'Set a minimum sample per variant; use 50 only as a low-traffic floor.' },
    { points: 10, ok: !!decisionRule, issue: 'Precommit the promote, iterate, or stop decision rule.' },
  ]
  const score = checks.reduce((sum, check) => sum + (check.ok ? check.points : 0), 0)
  const issues = checks.filter((check) => !check.ok).map((check) => check.issue)
  const readiness: ExperimentReadiness = score >= 80 ? 'ready' : score >= 50 ? 'needs-work' : 'draft'
  const designStrength: ExperimentDesignStrength = score >= 90 && (minimumSamplePerVariant ?? 0) >= 200
    ? 'high'
    : score >= 70
      ? 'medium'
      : 'low'

  return {
    id: `${slug(name) || 'experiment'}-${index + 1}`,
    name,
    hypothesis,
    variable,
    control,
    treatment,
    primaryMetric,
    guardrailMetric,
    targetImprovementPct,
    durationDays,
    minimumSamplePerVariant,
    decisionRule,
    channel,
    score,
    readiness,
    designStrength,
    issues,
  }
}

export function buildExperimentPortfolio(raw: unknown): MarketingExperiment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((experiment, index) => normalizeExperimentPlan(experiment, index))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function summarizeExperimentPortfolio(experiments: MarketingExperiment[]): ExperimentPortfolioSummary {
  return {
    total: experiments.length,
    ready: experiments.filter((experiment) => experiment.readiness === 'ready').length,
    needsWork: experiments.filter((experiment) => experiment.readiness !== 'ready').length,
    averageScore: experiments.length
      ? Math.round(experiments.reduce((sum, experiment) => sum + experiment.score, 0) / experiments.length)
      : 0,
  }
}

export function buildExperimentBrief(experiment: MarketingExperiment, context?: {
  projectName?: string | null
  northStar?: string | null
  sprintTheme?: string | null
}): string {
  return [
    `# ${experiment.name}`,
    '',
    context?.projectName ? `Project: ${context.projectName}` : null,
    context?.sprintTheme ? `Sprint: ${context.sprintTheme}` : null,
    context?.northStar ? `North star: ${context.northStar}` : null,
    `Readiness: ${experiment.score}/100 (${experiment.readiness})`,
    '',
    '## Decision contract',
    `Hypothesis: ${experiment.hypothesis || 'Not defined'}`,
    `Single variable: ${experiment.variable ?? 'Not defined'}`,
    `Control: ${experiment.control || 'Not defined'}`,
    `Treatment: ${experiment.treatment || 'Not defined'}`,
    `Primary metric: ${experiment.primaryMetric ?? 'Not defined'}`,
    `Guardrail metric: ${experiment.guardrailMetric ?? 'Not defined'}`,
    `Minimum worthwhile lift: ${experiment.targetImprovementPct === null ? 'Not defined' : `${experiment.targetImprovementPct}%`}`,
    `Duration: ${experiment.durationDays === null ? 'Not defined' : `${experiment.durationDays} days`}`,
    `Minimum sample: ${experiment.minimumSamplePerVariant === null ? 'Not defined' : `${experiment.minimumSamplePerVariant} per variant`}`,
    `Decision rule: ${experiment.decisionRule ?? 'Not defined'}`,
    experiment.channel ? `Channel: ${experiment.channel}` : null,
    experiment.issues.length ? `Open design issues: ${experiment.issues.join(' | ')}` : 'Open design issues: none',
  ].filter((line): line is string => line !== null).join('\n')
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableText(value: unknown): string | null {
  return text(value) || null
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function positiveInteger(value: unknown): number | null {
  const number = positiveNumber(value)
  return number === null ? null : Math.round(number)
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
