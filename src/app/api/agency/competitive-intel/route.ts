import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import { mergeBrandVoice } from '@/lib/brand-voice'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'

const CompetitiveIntelSchema = z.object({
  competitors: z.array(z.object({
    name: z.string(),
    positioning: z.string().describe('Their core positioning statement'),
    target_audience: z.string(),
    pricing_model: z.string(),
    strengths: z.array(z.string()).min(2).max(4),
    weaknesses: z.array(z.string()).min(2).max(4),
    their_hook: z.string().describe('The angle they lead with'),
  })),
  market_gaps: z.array(z.string()).describe('Positioning gaps nobody occupies well'),
  recommended_positioning: z.string().describe('Where this product should stake a claim'),
  differentiation_angles: z.array(z.string()).length(5).describe('5 concrete differentiation angles'),
  threat_assessment: z.object({
    biggest_threat: z.string(),
    why: z.string(),
    counter_strategy: z.string(),
  }),
  content_gaps: z.array(z.string()).describe('Content topics competitors cover poorly or not at all'),
})

async function fetchTrimmed(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GrowthOS/1.0' } })
    if (!res.ok) return `[Could not fetch: ${res.status}]`
    const html = await res.text()
    return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').slice(0, 20_000)
  } catch {
    return '[fetch failed]'
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, competitorUrls } = await request.json()
  if (!projectId || !Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    return Response.json({ error: 'projectId and competitorUrls[] required' }, { status: 400 })
  }

  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}

  // Fetch each competitor page (parallel, bounded)
  const pages = await Promise.all(competitorUrls.slice(0, 5).map(async (url: string) => ({
    url, html: await fetchTrimmed(url),
  })))

  const startedAt = Date.now()
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: CompetitiveIntelSchema,
    system: `You are a senior competitive intelligence analyst. Read competitor landing pages carefully and extract concrete, specific observations. Never give generic SWOT slop — every point must be traceable to evidence on the page.`,
    messages: [{ role: 'user', content: `MY PRODUCT: ${project.name}
MY POSITIONING: ${bv.value_proposition ?? project.description ?? ''}
MY AUDIENCE: ${bv.target_audience ?? ''}

COMPETITOR PAGES (trimmed HTML):
${pages.map((p) => `\n=== ${p.url} ===\n${p.html}`).join('\n')}

Produce a competitive intelligence report that helps me pick the positioning gap to own.` }],
  })

  // Atomic shallow merge via RPC
  await mergeBrandVoice(supabase, projectId, { competitive_intel: res.object, intel_generated_at: new Date().toISOString() })

  await trackAICost({
    userId: user.id, projectId, module: 'agency_intel',
    costUsd: 0.10, latencyMs: Date.now() - startedAt,
  })

  return Response.json({ intel: res.object })
}
