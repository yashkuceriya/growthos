import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { generateJsonLd, jsonLdScriptTag } from '@/lib/ai/tools/schema-router'
import { getPlaybook } from '@/lib/ai/playbooks/registry'
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { trackAICost } from '@/lib/cost-tracker'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'

// Have the LLM extract FAQ/HowTo/Article content from project context; we compose JSON-LD.
const ContentSchema = z.object({
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).min(4).max(10).optional(),
  how_to_steps: z.array(z.object({ text: z.string() })).optional(),
  article_headline: z.string().optional(),
  article_author: z.string().optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, override } = await request.json()
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical
  const pb = getPlaybook(vertical)

  // Generate FAQ + How-To content
  const startedAt = Date.now()
  const res = await generateObject({
    model: modelFor('production'),
    schema: ContentSchema,
    system: `You generate concise FAQ entries and (when relevant) How-To steps for JSON-LD schema. Keep answers tight, factual, scannable.`,
    messages: [{ role: 'user', content: `PRODUCT: ${project.name}
DESCRIPTION: ${project.description ?? ''}
VALUE PROP: ${bv.value_proposition ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
VERTICAL: ${vertical ?? 'unknown'}

Produce 6-8 FAQ questions real buyers would ask, plus (if relevant for a ${vertical} product) 4-6 how-to steps for the primary onboarding flow.` }],
  })

  const graph = generateJsonLd({
    vertical,
    name: project.name,
    description: project.description ?? '',
    url: project.website ?? '',
    logoUrl: (bv.logo_url as string) ?? null,
    brand_voice: bv,
    faqs: res.object.faqs,
    howTo: res.object.how_to_steps ? { name: `How ${project.name} works`, steps: res.object.how_to_steps } : undefined,
    article: res.object.article_headline ? { headline: res.object.article_headline, datePublished: new Date().toISOString(), author: res.object.article_author ?? project.name } : undefined,
    ...(override ?? {}),
  })

  await trackAICost({ userId: user.id, projectId, module: 'schema_gen', costUsd: 0.01, latencyMs: Date.now() - startedAt })

  return Response.json({
    vertical,
    schema_types: pb.schema_types,
    jsonld_graph: graph,
    script_tag_html: jsonLdScriptTag(graph),
    extracted: res.object,
  })
}
