// Unified optimization endpoint. Dispatches by `tool` field to keep one API + one model router.
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import { getPlaybook } from '@/lib/ai/playbooks/registry'
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { complianceForVertical } from '@/lib/ai/compliance/rules'
import { wrapHandler } from '@/lib/api-error'

export const maxDuration = 120

// ————————————————— Schemas —————————————————

const OnPageAuditSchema = z.object({
  page_url: z.string(),
  overall_score_0_100: z.number().min(0).max(100),
  checks: z.array(z.object({
    category: z.enum(['title', 'meta_description', 'h1', 'headings', 'images_alt', 'internal_links', 'canonical', 'schema', 'word_count', 'readability', 'og_tags', 'twitter_card', 'core_web_vitals_guess']),
    status: z.enum(['pass', 'warn', 'fail']),
    finding: z.string(),
    fix: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
  })).min(8),
  quick_wins: z.array(z.string()).max(5),
})

const InternalLinkSchema = z.object({
  source_page: z.string(),
  suggested_links: z.array(z.object({
    target_page_or_topic: z.string(),
    anchor_text: z.string(),
    rationale: z.string(),
    placement_suggestion: z.string(),
  })).min(3).max(7),
})

const RepurposingMapSchema = z.object({
  source_piece: z.string(),
  derivatives: z.array(z.object({
    channel: z.string(),
    format: z.string(),
    hook: z.string(),
    full_content: z.string(),
    estimated_reach_impact: z.enum(['low', 'medium', 'high']),
  })).min(8).max(15),
})

const AEOSchema = z.object({
  page_url: z.string(),
  current_fit_score: z.number().min(0).max(100),
  optimizations: z.array(z.object({
    area: z.enum(['claim_structure', 'citation_format', 'heading_questions', 'direct_answers', 'statistic_density', 'llms_txt', 'structured_data', 'author_bio']),
    issue: z.string(),
    fix: z.string(),
  })).min(5),
  llms_txt_content: z.string().describe('Full llms.txt file content'),
  featured_snippet_draft: z.string().describe('40-50 word answer block for target query'),
})

const LPAuditSchema = z.object({
  headline_clarity_0_10: z.number(),
  value_prop_specificity_0_10: z.number(),
  cta_prominence_0_10: z.number(),
  social_proof_0_10: z.number(),
  friction_score_0_10: z.number().describe('Higher = more friction (bad)'),
  overall_conversion_prediction: z.enum(['poor', 'below_avg', 'avg', 'above_avg', 'excellent']),
  findings: z.array(z.object({
    element: z.string(),
    issue: z.string(),
    fix: z.string(),
    lift_estimate_pct: z.number(),
  })).min(6),
  top_3_fixes: z.array(z.string()).length(3),
})

const ABHypothesisSchema = z.object({
  hypotheses: z.array(z.object({
    name: z.string(),
    hypothesis: z.string().describe('If we [change X] we expect [outcome Y] because [reason Z]'),
    variant_a: z.string(),
    variant_b: z.string(),
    metric: z.string(),
    duration_days: z.number(),
    ice_impact: z.number().min(1).max(10),
    ice_confidence: z.number().min(1).max(10),
    ice_effort: z.number().min(1).max(10),
    ice_score: z.number().describe('I × C / E rounded'),
    rationale: z.string(),
  })).min(8).max(15).describe('Ranked by ICE score descending'),
})

// ————————————————— Dispatcher —————————————————

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { projectId, tool, input } = body
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical
  const pb = getPlaybook(vertical)
  const compliance = complianceForVertical(vertical)

  const baseCtx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
DESCRIPTION: ${project.description ?? ''}
VALUE PROP: ${bv.value_proposition ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
KEY FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
WEBSITE: ${project.website ?? ''}
PRIMARY KPI: ${pb.kpis.primary}
COMPLIANCE FLAGS: ${compliance.map((c) => c.flag).join(', ')}
CRO FOCUS FOR THIS VERTICAL: ${pb.cro_focus.join(', ')}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'onpage_audit': {
      // Optional: fetch page HTML
      let html = ''
      const url = input?.url ?? project.website
      if (url) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'GrowthOS/1.0' } })
          if (r.ok) html = (await r.text()).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').slice(0, 20_000)
        } catch { /* ignore */ }
      }
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: OnPageAuditSchema,
        system: `You audit on-page SEO for a ${vertical ?? 'general'} product. Base findings on actual HTML evidence, not assumptions. Score from 0-100. Mark fixes as low/medium/high impact — prioritize high-impact quick wins.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nPAGE URL: ${url}\n\nHTML (trimmed):\n${html || '[no HTML provided]'}` }],
      })
      result = res.object
      break
    }
    case 'internal_links': {
      const existingPosts = (input?.posts as Array<{ title: string; excerpt?: string; url: string }>) ?? []
      const sourcePage = input?.source ?? 'Latest post'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: InternalLinkSchema,
        system: `You suggest internal links between a source page and existing content. Prioritize topical relevance. Anchor text should match user intent, not be generic.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nSOURCE PAGE: ${sourcePage}\n\nEXISTING PUBLISHED CONTENT:\n${existingPosts.map((p) => `- ${p.title} (${p.url})${p.excerpt ? '\n  ' + p.excerpt : ''}`).join('\n')}\n\nSuggest 5-7 internal links to add to the source page.` }],
      })
      result = res.object
      break
    }
    case 'repurposing': {
      const source = input?.source ?? ''
      const res = await generateObject({
        model: modelFor('production'),
        schema: RepurposingMapSchema,
        system: `You take one content piece and produce 8-15 derivative pieces for channels that matter to ${vertical ?? 'this'} verticals. Each derivative should be fully drafted, ready to post. Match each channel's native format and tone. Target these channels: ${[...pb.primary_channels, ...pb.secondary_channels].join(', ')}.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nSOURCE PIECE:\n${source}\n\nProduce derivatives across channels relevant to the vertical.` }],
      })
      result = res.object
      break
    }
    case 'aeo': {
      const url = input?.url ?? project.website
      const targetQuery = input?.target_query ?? ''
      let html = ''
      if (url) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'GrowthOS/1.0' } })
          if (r.ok) html = (await r.text()).replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 15_000)
        } catch { /* ignore */ }
      }
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: AEOSchema,
        system: `You optimize pages for Answer Engine citations (ChatGPT, Perplexity, Gemini, Claude). AEO differs from classic SEO — clear claims, quotable statistics, structured answers, llms.txt files matter. Produce the llms.txt contents following the spec (https://llmstxt.org).`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nTARGET QUERY: ${targetQuery}\nPAGE URL: ${url}\nHTML (trimmed):\n${html || '[no HTML]'}\n\nAudit for answer-engine citation readiness and produce fixes + a llms.txt.` }],
      })
      result = res.object
      break
    }
    case 'lp_audit': {
      const url = input?.url ?? project.website
      let html = ''
      if (url) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'GrowthOS/1.0' } })
          if (r.ok) html = (await r.text()).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').slice(0, 20_000)
        } catch { /* ignore */ }
      }
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: LPAuditSchema,
        system: `You audit landing pages for conversion. Use ${vertical ?? 'general'} benchmarks. CRO focus for this vertical: ${pb.cro_focus.join(', ')}. Score each element and estimate the lift from fixing it.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nLANDING PAGE URL: ${url}\n\nHTML:\n${html || '[no HTML]'}` }],
      })
      result = res.object
      break
    }
    case 'ab_hypotheses': {
      const currentPerformance = input?.current_metrics ?? 'baseline unknown'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ABHypothesisSchema,
        system: `You design A/B tests ranked by ICE (Impact × Confidence / Effort). Produce 8-15 hypotheses specific to this product + vertical. Include exact variant copy where possible.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nCURRENT METRICS / CONTEXT: ${currentPerformance}\n\nPropose 8-15 A/B test hypotheses with ICE scores. Sort by ICE descending.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `optimize_${tool}`, costUsd: 0.04, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}

export const POST = wrapHandler(handlePost, 'agency/optimize')
