import { generateObject } from 'ai'
import { z } from 'zod'
import { openrouter } from '@/lib/ai/openrouter'

const InsightsSchema = z.object({
  insights: z.array(z.object({
    insight_type: z.enum(['winning_pattern', 'weak_dimension', 'refinement_tip', 'top_performer']),
    dimension: z.string().nullable(),
    insight_text: z.string(),
    evidence: z.string(),
    score_impact: z.number(),
  })),
})

const MODEL = 'google/gemini-2.0-flash-001'

interface AdData {
  primary_text: string
  headline: string
  description: string
  cta_button: string
  evaluation_scores: Record<string, { score: number; rationale: string }>
  weighted_average: number
  audience_segment: string
  campaign_goal: string
}

/**
 * Analyze completed ad runs and extract reusable insights.
 * Call after a pipeline run completes to learn from results.
 */
export async function extractInsights(
  ads: AdData[],
  projectContext: string,
): Promise<{
  insights: Array<{
    insight_type: string
    dimension: string | null
    insight_text: string
    evidence: string
    score_impact: number
  }>
  inputTokens: number
  outputTokens: number
}> {
  if (ads.length < 2) return { insights: [], inputTokens: 0, outputTokens: 0 }

  const adSummaries = ads.map((ad, i) => {
    const scores = Object.entries(ad.evaluation_scores)
      .map(([dim, s]) => `${dim}: ${s.score}`)
      .join(', ')
    return `Ad ${i + 1} (score: ${ad.weighted_average}):
  Hook: ${ad.primary_text.split('\n')[0].slice(0, 100)}
  Headline: ${ad.headline}
  CTA: ${ad.cta_button}
  Scores: ${scores}
  Audience: ${ad.audience_segment} | Goal: ${ad.campaign_goal}`
  }).join('\n\n')

  const { object, usage } = await generateObject({
    model: openrouter(MODEL),
    schema: InsightsSchema,
    system: `You are an advertising analytics expert. Analyze completed ad copy runs and extract actionable insights that can improve future ad generation.

Focus on:
1. WINNING PATTERNS: What hooks, structures, or approaches scored highest?
2. WEAK DIMENSIONS: Which evaluation dimensions consistently score low?
3. REFINEMENT TIPS: What specific changes led to score improvements?
4. TOP PERFORMERS: What made the best ads stand out?

Be specific and actionable. Reference concrete elements (hooks, CTAs, emotional triggers) not generic advice.`,
    messages: [{
      role: 'user',
      content: `Analyze these ${ads.length} ad copies for ${projectContext} and extract insights:\n\n${adSummaries}`,
    }],
  })

  return {
    insights: object.insights,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}

/**
 * Save extracted insights to the database.
 */
export async function saveInsights(
  supabase: { from: (table: string) => { insert: (data: unknown) => { select: () => unknown } } },
  userId: string,
  projectId: string,
  audienceSegment: string,
  campaignGoal: string,
  insights: Array<{
    insight_type: string
    dimension: string | null
    insight_text: string
    evidence: string
    score_impact: number
  }>,
) {
  const records = insights.map((i) => ({
    user_id: userId,
    project_id: projectId,
    audience_segment: audienceSegment,
    campaign_goal: campaignGoal,
    dimension: i.dimension,
    insight_type: i.insight_type,
    insight_text: i.insight_text,
    evidence: { text: i.evidence },
    avg_score_impact: i.score_impact,
  }))

  if (records.length > 0) {
    await supabase.from('ad_insights').insert(records).select()
  }
}
