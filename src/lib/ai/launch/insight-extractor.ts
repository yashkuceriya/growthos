import { generateObject } from 'ai'
import { z } from 'zod'
import { modelFor } from '@/lib/ai/models'

export const LaunchInsightsSchema = z.object({
  patterns_that_worked: z.array(z.object({
    pattern: z.string().describe('A specific pattern from the brief/review/channel output that should be repeated'),
    evidence: z.string().describe('Exact quote or specific detail from the inputs that supports this'),
  })).max(5),
  audience_signals: z.array(z.object({
    signal: z.string().describe('A concrete audience insight observable from the launch'),
    implication: z.string().describe('What the next launch should do differently because of this'),
  })).max(5),
  copy_snippets_to_reuse: z.array(z.string().describe('Verbatim lines from the outputs worth reusing — hooks, CTAs, framings')).max(8),
  things_to_avoid: z.array(z.string().describe('A specific tone/word/framing that failed or felt off')).max(5),
  next_launch_recommendations: z.array(z.object({
    recommendation: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })).max(5),
})

export type LaunchInsights = z.infer<typeof LaunchInsightsSchema>

export async function extractLaunchInsights(input: {
  brief: unknown
  seoPlan: unknown
  directorReview: unknown
  channelOutputs: Record<string, string>
  productName: string
  audience: string
}): Promise<LaunchInsights> {
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: LaunchInsightsSchema,
    system: `You extract durable, reusable insights from a just-completed marketing launch. Your goal: help the NEXT launch for this product perform better by identifying patterns, audience signals, and reusable copy snippets.

DO:
- Ground every insight in specifics from the inputs (don't speculate)
- Prefer concrete copy and specific hooks over generic advice
- Call out what should be avoided next time as clearly as what worked

DON'T:
- Output generic marketing clichés
- Summarize the inputs — synthesize patterns from them
- Invent facts not present in the inputs`,
    messages: [{
      role: 'user',
      content: `PRODUCT: ${input.productName}
AUDIENCE: ${input.audience}

STRATEGIC BRIEF:
${JSON.stringify(input.brief).slice(0, 3000)}

SEO PLAN:
${JSON.stringify(input.seoPlan).slice(0, 1500)}

DIRECTOR REVIEW:
${JSON.stringify(input.directorReview).slice(0, 3000)}

CHANNEL OUTPUTS:
${Object.entries(input.channelOutputs).map(([k, v]) => `--- ${k} ---\n${v.slice(0, 1500)}`).join('\n\n')}

Extract launch insights.`,
    }],
  })
  return res.object
}
