import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'

const ClusterSchema = z.object({
  pillar: z.object({
    title: z.string().describe('Pillar page title (comprehensive guide)'),
    target_keyword: z.string(),
    outline: z.array(z.string()).describe('H2 sections for pillar'),
    target_word_count: z.number(),
  }),
  supporting_articles: z.array(z.object({
    title: z.string(),
    target_keyword: z.string(),
    search_intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
    target_word_count: z.number(),
    internal_links_to: z.array(z.string()).describe('Other supporting articles or pillar this links to'),
    hook_paragraph: z.string().describe('First paragraph draft, 80 words'),
  })).length(10),
  internal_link_map: z.array(z.object({
    from: z.string(),
    to: z.string(),
    anchor_text: z.string(),
  })).describe('Recommended internal links between cluster articles'),
  publishing_cadence: z.array(z.object({
    week: z.number().min(1).max(8),
    publish: z.array(z.string()),
  })).describe('8-week publishing schedule'),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, pillarKeyword } = await request.json()
  if (!projectId || !pillarKeyword) return Response.json({ error: 'projectId and pillarKeyword required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).maybeSingle()
  const bv = (project?.brand_voice as Record<string, unknown>) ?? {}

  const startedAt = Date.now()
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: ClusterSchema,
    system: `You design topical authority content clusters. Produce one pillar + 10 supporting articles with a cohesive internal linking structure and 8-week publishing plan.`,
    messages: [{ role: 'user', content: `PILLAR KEYWORD: ${pillarKeyword}
PRODUCT: ${project?.name}
AUDIENCE: ${bv.target_audience ?? ''}

Build the content cluster.` }],
  })

  await trackAICost({ userId: user.id, projectId, module: 'seo_cluster', costUsd: 0.06, latencyMs: Date.now() - startedAt })

  return Response.json(res.object)
}
