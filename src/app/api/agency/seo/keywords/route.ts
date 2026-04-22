import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'

const KeywordResearchSchema = z.object({
  seed: z.string(),
  keywords: z.array(z.object({
    keyword: z.string(),
    intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
    funnel_stage: z.enum(['awareness', 'consideration', 'decision']),
    est_monthly_volume: z.number().describe('Estimated US monthly searches'),
    est_difficulty_0_100: z.number().min(0).max(100),
    priority_score: z.number().min(1).max(10),
    rationale: z.string().describe('Why this keyword matters for this product'),
    content_type: z.enum(['blog', 'comparison', 'landing', 'faq', 'guide', 'tool']),
  })).min(15).max(25),
  question_keywords: z.array(z.string()).describe('Question-format keywords to target for featured snippets'),
  long_tail_opportunities: z.array(z.string()).describe('Low-volume easy-rank long-tail keywords'),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, seedKeyword } = await request.json()
  if (!projectId || !seedKeyword) return Response.json({ error: 'projectId and seedKeyword required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).single()
  const bv = (project?.brand_voice as Record<string, unknown>) ?? {}

  const startedAt = Date.now()
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: KeywordResearchSchema,
    system: `You are a senior SEO strategist with deep recall of SERP behavior. Produce keyword research grounded in realistic volume and difficulty estimates. Favor keywords with commercial intent and achievable difficulty over vanity terms.`,
    messages: [{ role: 'user', content: `SEED: ${seedKeyword}
PRODUCT: ${project?.name}
AUDIENCE: ${bv.target_audience ?? ''}
VALUE PROP: ${bv.value_proposition ?? project?.description ?? ''}

Produce 15-25 keyword targets with realistic volume/difficulty/priority.` }],
  })

  await trackAICost({
    userId: user.id, projectId, module: 'seo_keywords',
    costUsd: 0.05, latencyMs: Date.now() - startedAt,
  })

  return Response.json(res.object)
}
