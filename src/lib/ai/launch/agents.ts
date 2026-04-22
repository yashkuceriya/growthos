// Agentic marketing team: agents work in sequence, each feeding the next.
// CMO sets strategy → SEO researches keywords → channels generate (with brief) →
// Director reviews → Analytics proposes experiments.

import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import type { LaunchContext } from './generators'

const STRATEGIC = () => modelFor('strategic')

// ————————————————————————————————————————————————————————————
// CMO Agent — produces the strategic brief every other agent uses
// ————————————————————————————————————————————————————————————

export const StrategicBriefSchema = z.object({
  core_narrative: z.string().describe('One-sentence positioning statement that every channel will echo'),
  audience_insight: z.string().describe('The sharpest truth about the target audience that most competitors miss'),
  top_3_themes: z.array(z.string()).length(3).describe('Three content themes for the 30-day campaign'),
  key_metric: z.string().describe('The single metric the CMO will obsess over (e.g. signups, trial-to-paid)'),
  budget_split_recommendation: z.string().describe('How to split effort across paid/organic/direct (e.g. 50/40/10)'),
  risks: z.array(z.string()).describe('Top 2-3 risks or pitfalls for this launch'),
  quarter_theme: z.string().describe('90-day macro narrative (e.g. "From tracker to career OS")'),
})
export type StrategicBrief = z.infer<typeof StrategicBriefSchema>

export async function cmoStrategist(ctx: LaunchContext): Promise<StrategicBrief> {
  const res = await generateObject({
    model: STRATEGIC(),
    schema: StrategicBriefSchema,
    system: `You are a seasoned CMO. Given a product, you produce a tight strategic brief that subordinate agents (SEO, Content, Paid, Social, PR) will execute against. Be specific, opinionated, and ruthlessly prioritized. Never hedge.`,
    messages: [{ role: 'user', content: `PRODUCT: ${ctx.productName}
TAGLINE: ${ctx.tagline}
VALUE PROP: ${ctx.valueProp}
AUDIENCE: ${ctx.audience}
FEATURES: ${ctx.features.join(' · ')}
DIFFERENTIATORS: ${ctx.differentiators.join(' · ')}
PRICING: ${ctx.pricing}

Produce the strategic brief for a 30-day launch.` }],
  })
  return res.object
}

// ————————————————————————————————————————————————————————————
// SEO Agent — keyword strategy that feeds content + comparison pages
// ————————————————————————————————————————————————————————————

export const SeoPlanSchema = z.object({
  primary_keywords: z.array(z.object({
    keyword: z.string(),
    intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
    est_volume: z.enum(['low', 'medium', 'high']),
    est_difficulty: z.enum(['easy', 'moderate', 'hard']),
    priority: z.number().min(1).max(10),
  })).length(5).describe('Top 5 target keywords with intent/volume/difficulty estimates'),
  comparison_targets: z.array(z.string()).describe('3-5 competitor names for "vs" comparison pages'),
  cluster_pillar: z.string().describe('The pillar topic that ties the cluster together'),
  cluster_supporting: z.array(z.string()).length(8).describe('8 supporting article titles for the cluster'),
  quick_wins: z.array(z.string()).describe('Low-difficulty keywords to rank for in 30 days'),
})
export type SeoPlan = z.infer<typeof SeoPlanSchema>

export async function seoSpecialist(ctx: LaunchContext, brief: StrategicBrief): Promise<SeoPlan> {
  const res = await generateObject({
    model: STRATEGIC(),
    schema: SeoPlanSchema,
    system: `You are a senior SEO strategist. Use your knowledge of search behavior to propose keyword targets with realistic volume/difficulty estimates. Favor quick wins over vanity keywords.`,
    messages: [{ role: 'user', content: `STRATEGIC BRIEF:
- Narrative: ${brief.core_narrative}
- Audience insight: ${brief.audience_insight}
- Themes: ${brief.top_3_themes.join(' | ')}

PRODUCT CONTEXT: ${ctx.productName} — ${ctx.valueProp}
AUDIENCE: ${ctx.audience}

Produce the SEO plan. Keywords should map to the brief's themes and audience search behavior.` }],
  })
  return res.object
}

// ————————————————————————————————————————————————————————————
// Director Review — cross-checks all channel outputs for gaps + consistency
// ————————————————————————————————————————————————————————————

export const DirectorReviewSchema = z.object({
  overall_grade: z.enum(['A', 'B', 'C', 'D']),
  narrative_consistency: z.string().describe('How consistent is the core message across channels?'),
  strongest_asset: z.string().describe('Which channel/asset is most likely to convert and why'),
  weakest_asset: z.string().describe('Which channel/asset needs rework and why'),
  gaps: z.array(z.string()).describe('Important distribution gaps or audience segments missed'),
  next_3_actions: z.array(z.string()).length(3).describe('What the human should do in the next 48 hours'),
  risk_flags: z.array(z.string()).describe('Compliance, brand, or messaging risks to address'),
})
export type DirectorReview = z.infer<typeof DirectorReviewSchema>

export async function directorReview(
  ctx: LaunchContext,
  brief: StrategicBrief,
  seo: SeoPlan,
  channelSummaries: Record<string, string>,
): Promise<DirectorReview> {
  const res = await generateObject({
    model: STRATEGIC(),
    schema: DirectorReviewSchema,
    system: `You are a Director of Marketing reviewing a campaign your specialists shipped. Be honest, not diplomatic. Grade objectively. Flag risks without softening.`,
    messages: [{ role: 'user', content: `PRODUCT: ${ctx.productName}
STRATEGIC BRIEF: ${brief.core_narrative}
KEY METRIC: ${brief.key_metric}
SEO FOCUS: ${seo.cluster_pillar}

CHANNEL OUTPUTS:
${Object.entries(channelSummaries).map(([k, v]) => `\n— ${k.toUpperCase()} —\n${v}`).join('\n')}

Review the campaign for consistency, gaps, strongest/weakest asset, and flag risks. Then give the founder the 3 highest-leverage actions for the next 48 hours.` }],
  })
  return res.object
}

// ————————————————————————————————————————————————————————————
// Analytics Agent — proposes experiments + UTM tracking
// ————————————————————————————————————————————————————————————

export const AnalyticsPlanSchema = z.object({
  north_star_metric: z.string(),
  experiments: z.array(z.object({
    hypothesis: z.string(),
    test: z.string(),
    success_criterion: z.string(),
    duration_days: z.number(),
  })).length(3),
  utm_scheme: z.object({
    source_by_channel: z.record(z.string(), z.string()),
    medium_by_channel: z.record(z.string(), z.string()),
    campaign_template: z.string(),
  }),
  weekly_report_template: z.string().describe('Markdown template for weekly KPI report'),
})
export type AnalyticsPlan = z.infer<typeof AnalyticsPlanSchema>

export async function analyticsAgent(ctx: LaunchContext, brief: StrategicBrief): Promise<AnalyticsPlan> {
  const res = await generateObject({
    model: STRATEGIC(),
    schema: AnalyticsPlanSchema,
    system: `You are a growth analyst. Propose 3 high-leverage experiments, a clean UTM taxonomy, and a weekly report template.`,
    messages: [{ role: 'user', content: `PRODUCT: ${ctx.productName}
KEY METRIC: ${brief.key_metric}
THEMES: ${brief.top_3_themes.join(' | ')}

Produce the analytics plan.` }],
  })
  return res.object
}
