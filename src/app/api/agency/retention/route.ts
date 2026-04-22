import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

const CohortAnalysisSchema = z.object({
  cohort_definition: z.string(),
  metrics_to_track: z.array(z.string()).min(4).max(8),
  expected_retention_curve: z.array(z.object({ period: z.string(), expected_retention_pct: z.number(), interpretation: z.string() })).min(4).max(8),
  sql_starter_queries: z.array(z.object({ name: z.string(), sql: z.string(), description: z.string() })).min(3).max(5),
  benchmarks_to_beat: z.array(z.object({ metric: z.string(), benchmark: z.string(), source: z.string() })),
  red_flags_in_data: z.array(z.string()),
  sharpening_questions: z.array(z.string()).describe('Diagnostic questions to ask of the data'),
})

const ChurnPredictorSchema = z.object({
  leading_indicators: z.array(z.object({
    signal: z.string(),
    weight_0_10: z.number(),
    how_to_detect: z.string(),
    threshold_example: z.string(),
  })).min(6).max(10),
  health_score_formula: z.string(),
  risk_tiers: z.array(z.object({ tier: z.enum(['healthy', 'at_risk', 'critical']), score_range: z.string(), action: z.string() })).length(3),
  save_playbook: z.array(z.object({
    tier: z.string(),
    trigger_signal: z.string(),
    intervention: z.string(),
    owner: z.enum(['automated', 'success_rep', 'product_nudge']),
    expected_save_rate_pct: z.number(),
  })).min(4).max(8),
  data_to_instrument: z.array(z.string()),
})

const ReactivationSchema = z.object({
  segments: z.array(z.object({
    segment_name: z.string(),
    definition: z.string(),
    size_estimate: z.string(),
    reason_they_lapsed: z.string(),
    probability_of_return: z.enum(['low', 'medium', 'high']),
  })).min(3).max(5),
  campaigns: z.array(z.object({
    segment: z.string(),
    campaign_name: z.string(),
    angle: z.string(),
    channels: z.array(z.string()),
    sequence: z.array(z.object({ day: z.number(), channel: z.string(), content_summary: z.string(), cta: z.string() })).min(3).max(6),
    incentive: z.string(),
    success_metric: z.string(),
  })).min(3).max(5),
  feedback_survey_questions: z.array(z.string()).min(3).max(5).describe('Short survey to send to winbacks to learn why they returned'),
})

const NPSSchema = z.object({
  survey_design: z.object({
    timing: z.string(),
    trigger: z.string(),
    frequency: z.string(),
    core_question: z.string(),
    follow_up_open_ended: z.string(),
    follow_up_promoters: z.string(),
    follow_up_passives: z.string(),
    follow_up_detractors: z.string(),
  }),
  score_targets: z.object({ world_class: z.string(), good: z.string(), needs_work: z.string() }),
  themes_to_watch_for: z.array(z.object({ theme: z.string(), signal: z.string(), action: z.string() })).min(4).max(8),
  detractor_playbook: z.array(z.object({
    detractor_reason: z.string(),
    response_template: z.string(),
    escalation: z.string(),
  })).min(3).max(5),
  promoter_playbook: z.array(z.object({
    promoter_trigger: z.string(),
    ask: z.string(),
    follow_up: z.string(),
  })).min(3).max(5),
  quarterly_synthesis_template: z.string(),
})

const CustomerHealthSchema = z.object({
  score_dimensions: z.array(z.object({
    dimension: z.enum(['usage_depth', 'usage_breadth', 'engagement_frequency', 'admin_adoption', 'value_realized', 'support_burden', 'renewal_intent', 'advocacy']),
    weight: z.number(),
    measurement: z.string(),
    example_signal: z.string(),
  })).min(5).max(8),
  formula_plain_english: z.string(),
  tier_definitions: z.array(z.object({ tier: z.enum(['green', 'yellow', 'orange', 'red']), score_range: z.string(), meaning: z.string(), default_action: z.string() })).length(4),
  account_review_template: z.string(),
  weekly_dashboard_columns: z.array(z.string()).min(6).max(10),
})

type Tool = 'cohort_analysis' | 'churn_predictor' | 'reactivation' | 'nps_synthesizer' | 'customer_health'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool, input } = await request.json() as { projectId: string; tool: Tool; input?: Record<string, unknown> }
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
AUDIENCE: ${bv.target_audience ?? ''}
BUSINESS MODEL: ${(bv.classification as { business_model?: string } | undefined)?.business_model ?? 'unknown'}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'cohort_analysis': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: CohortAnalysisSchema,
        system: `You design cohort analyses. Propose meaningful metrics, expected retention curve benchmarks, SQL starters, and diagnostic questions.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the cohort analysis for this vertical.` }],
      })
      result = res.object
      break
    }
    case 'churn_predictor': {
      const notes = input?.observed_signals ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ChurnPredictorSchema,
        system: `You design churn prediction systems. 6-10 leading indicators with weights, a plain-English health score formula, tiered risk buckets, and a save playbook per tier.`,
        messages: [{ role: 'user', content: `${ctx}\nOBSERVED SIGNALS: ${notes}\n\nBuild the churn predictor.` }],
      })
      result = res.object
      break
    }
    case 'reactivation': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ReactivationSchema,
        system: `You design reactivation campaigns. Segment lapsed users by reason, design campaign per segment with multi-channel sequence and incentive. Include a feedback survey to learn what works.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign reactivation campaigns.` }],
      })
      result = res.object
      break
    }
    case 'nps_synthesizer': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: NPSSchema,
        system: `You design NPS programs. Survey timing, tiered follow-ups, detractor/promoter playbooks, theme watchlist, quarterly synthesis template.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the NPS program.` }],
      })
      result = res.object
      break
    }
    case 'customer_health': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: CustomerHealthSchema,
        system: `You design customer health scores. 5-8 weighted dimensions, plain-English formula, 4-tier colors, weekly dashboard spec.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign customer health scoring.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `retention_${tool}`, costUsd: 0.07, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}
