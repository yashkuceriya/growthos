import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'

const ComparisonPageSchema = z.object({
  title: z.string().describe('SEO title: "[Product] vs [Competitor]: [Promise]"'),
  slug: z.string(),
  meta_description: z.string().max(160),
  hero: z.object({
    headline: z.string(),
    subheadline: z.string(),
  }),
  comparison_table: z.array(z.object({
    feature: z.string(),
    us: z.string(),
    them: z.string(),
    advantage: z.enum(['us', 'them', 'tie']),
  })).min(6).max(10),
  sections: z.array(z.object({
    heading: z.string(),
    content_markdown: z.string(),
  })).min(3).max(5).describe('Narrative sections explaining key differences'),
  when_to_choose_us: z.array(z.string()).length(4),
  when_to_choose_them: z.array(z.string()).length(3).describe('Be honest — build trust by acknowledging their strengths'),
  switch_cta: z.object({
    text: z.string(),
    url: z.string(),
  }),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).min(4).max(8),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, competitors } = await request.json()
  if (!projectId || !Array.isArray(competitors) || competitors.length === 0) {
    return Response.json({ error: 'projectId and competitors[] required' }, { status: 400 })
  }

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice, slug').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
  const bv = (project.brand_voice as Record<string, unknown>) ?? {}

  const startedAt = Date.now()
  const pages: Array<Record<string, unknown>> = []

  for (const competitor of competitors.slice(0, 5)) {
    const res = await generateObject({
      model: modelFor('strategic'),
      schema: ComparisonPageSchema,
      system: `You write conversion-focused comparison pages that rank for "[product] vs [competitor]" searches. Be honest about their strengths — this builds trust. Lead with clear differentiation.`,
      messages: [{ role: 'user', content: `MY PRODUCT: ${project.name}
MY VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
MY FEATURES: ${(bv.key_features as string[])?.join(', ') ?? ''}
COMPETITOR: ${competitor}

Produce a comparison landing page.` }],
    })
    pages.push({ competitor, page: res.object })

    // Save as a landing page
    const slug = `${project.slug}-vs-${competitor.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    await supabase.from('landing_pages').insert({
      user_id: user.id, project_id: projectId,
      name: `${project.name} vs ${competitor}`,
      slug,
      template: {
        headline: res.object.hero.headline,
        subheadline: res.object.hero.subheadline,
        bodyText: res.object.sections.map((s) => `## ${s.heading}\n${s.content_markdown}`).join('\n\n'),
        ctaText: res.object.switch_cta.text,
        ctaColor: (bv.primary_color as string) ?? '#10b981',
      },
      published: false,
    })
  }

  await trackAICost({ userId: user.id, projectId, module: 'seo_comparison', costUsd: 0.08 * pages.length, latencyMs: Date.now() - startedAt })

  return Response.json({ pages })
}
