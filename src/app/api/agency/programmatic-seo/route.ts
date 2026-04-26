// Programmatic SEO — take a template + a list of modifiers → generate N pages at once.
// Examples:
//   "best [niche] alternatives to [competitor]" × 20
//   "how to [action] in [city]" × 50
//   "[language] for [use case]" × 30
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

const TemplateDesignSchema = z.object({
  template_name: z.string(),
  url_pattern: z.string().describe('e.g. /alternatives/[competitor] or /[city]/[service]'),
  title_pattern: z.string().describe('e.g. "Best {competitor} Alternatives for {segment} — 2025"'),
  meta_description_pattern: z.string(),
  content_pattern: z.object({
    hero_headline: z.string(),
    intro_paragraph: z.string(),
    section_order: z.array(z.string()),
    closing_cta: z.string(),
  }),
  variables: z.array(z.object({
    name: z.string(),
    example_values: z.array(z.string()).min(3).max(8),
    description: z.string(),
  })).min(1).max(3),
  variables_grid_size: z.string().describe('e.g. "20 competitors × 3 segments = 60 pages"'),
  internal_linking_strategy: z.string(),
  canonical_strategy: z.string(),
  sample_pages_preview: z.array(z.object({ slug: z.string(), title: z.string() })).min(3).max(5),
})

const GeneratePagesSchema = z.object({
  pages: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    meta_description: z.string(),
    h1: z.string(),
    sections: z.array(z.object({ heading: z.string(), body_markdown: z.string() })).min(3).max(6),
    internal_links: z.array(z.object({ to_slug: z.string(), anchor: z.string() })).min(2).max(5),
    schema_suggestion: z.string(),
    target_keyword: z.string(),
  })).min(3).max(20),
})

type Tool = 'design_template' | 'generate_pages'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool, input } = await request.json() as { projectId: string; tool: Tool; input?: Record<string, unknown> }
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice, website, slug').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
WEBSITE: ${project.website ?? ''}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'design_template': {
      const seedIdea = input?.seed_idea ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: TemplateDesignSchema,
        system: `You design programmatic SEO templates. Produce URL patterns, title patterns, a content scaffold, variable lists with real example values, and internal linking strategy. Calculate the grid size explicitly. Sample 3-5 generated slugs/titles.`,
        messages: [{ role: 'user', content: `${ctx}\nSEED IDEA: ${seedIdea}\n\nDesign the programmatic SEO template.` }],
      })
      result = res.object
      break
    }
    case 'generate_pages': {
      const template = input?.template ?? {}
      const values = input?.values ?? []
      const count = Math.min(Math.max(3, (values as unknown[]).length || 5), 10)
      const res = await generateObject({
        model: modelFor('production'),
        schema: GeneratePagesSchema,
        system: `You fill programmatic SEO templates with real content. Each page must be substantive (not thin), structurally identical to the template, and meaningfully different in content. Internal-link pages across the set.`,
        messages: [{ role: 'user', content: `${ctx}\n\nTEMPLATE:\n${JSON.stringify(template).slice(0, 3000)}\n\nVALUES TO FILL (first ${count}):\n${JSON.stringify((values as unknown[]).slice(0, count))}\n\nGenerate ${count} full pages.` }],
      })
      result = res.object

      // Persist as content_pieces
      const pages = (res.object as unknown as { pages: Array<{ slug: string; title: string; meta_description: string; sections: Array<{ heading: string; body_markdown: string }>; target_keyword: string }> }).pages
      for (const p of pages) {
        const body = p.sections.map((s) => `## ${s.heading}\n\n${s.body_markdown}`).join('\n\n')
        await supabase.from('content_pieces').insert({
          user_id: user.id, project_id: projectId,
          title: p.title, slug: p.slug,
          body_markdown: body,
          content_type: 'blog_post', status: 'drafting',
          target_keywords: [p.target_keyword],
          word_count: body.split(/\s+/).filter(Boolean).length,
          metadata: { programmatic: true, meta_description: p.meta_description },
        })
      }
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `pseo_${tool}`, costUsd: tool === 'generate_pages' ? 0.15 : 0.06, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}
