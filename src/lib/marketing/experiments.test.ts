import { describe, expect, it } from 'vitest'
import {
  buildExperimentBrief,
  buildExperimentPortfolio,
  normalizeExperimentPlan,
  summarizeExperimentPortfolio,
} from './experiments'

const completeExperiment = {
  name: 'Proof-led landing headline',
  hypothesis: 'A proof-led headline will increase qualified signup conversion for skeptical founders.',
  variable: 'Hero headline framing',
  variant_a: 'Run your marketing from one place',
  variant_b: 'Turn every launch into reusable evidence',
  primary_metric: 'Qualified signup conversion rate',
  guardrail_metric: 'Seven-day activation rate',
  target_improvement_pct: 12,
  duration_days: 14,
  minimum_sample_per_variant: 250,
  decision_rule: 'Promote B when conversion improves by at least 12% and activation does not decline.',
  channel: 'landing_page',
}

describe('experiment planning', () => {
  it('marks a complete decision contract ready', () => {
    const experiment = normalizeExperimentPlan(completeExperiment)

    expect(experiment.score).toBe(100)
    expect(experiment.readiness).toBe('ready')
    expect(experiment.designStrength).toBe('high')
    expect(experiment.issues).toEqual([])
  })

  it('surfaces incomplete legacy sprint ideas without rejecting them', () => {
    const experiment = normalizeExperimentPlan({
      name: 'Headline test',
      hypothesis: 'A clearer headline will improve signup conversion.',
      variant_a: 'Old headline',
      variant_b: 'New headline',
      duration_days: 7,
    })

    expect(experiment.readiness).toBe('draft')
    expect(experiment.issues).toContain('Name the single variable being changed.')
    expect(experiment.issues).toContain('Choose one primary success metric.')
  })

  it('sorts the portfolio by readiness and summarizes it', () => {
    const portfolio = buildExperimentPortfolio([
      { name: 'Loose idea' },
      completeExperiment,
    ])

    expect(portfolio[0].name).toBe(completeExperiment.name)
    expect(summarizeExperimentPortfolio(portfolio)).toEqual({
      total: 2,
      ready: 1,
      needsWork: 1,
      averageScore: 50,
    })
  })

  it('exports an operator brief with context and unresolved issues', () => {
    const brief = buildExperimentBrief(normalizeExperimentPlan(completeExperiment), {
      projectName: 'GrowthOS',
      northStar: 'Activated workspaces',
      sprintTheme: 'Proof over promises',
    })

    expect(brief).toContain('Project: GrowthOS')
    expect(brief).toContain('North star: Activated workspaces')
    expect(brief).toContain('Minimum worthwhile lift: 12%')
    expect(brief).toContain('Open design issues: none')
  })
})
