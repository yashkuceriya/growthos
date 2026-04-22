import { createClient } from '@/lib/supabase/server'
import { crawlSite } from '@/lib/ai/seo/crawler'
import { trackAICost } from '@/lib/cost-tracker'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, maxPages, baseUrl: overrideUrl } = await request.json()
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('website, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const baseUrl = overrideUrl || project.website
  if (!baseUrl) return Response.json({ error: 'No project website set; pass baseUrl' }, { status: 400 })

  const startedAt = Date.now()
  const audit = await crawlSite(baseUrl, { maxPages: Math.min(Math.max(1, maxPages ?? 10), 25) })

  // Persist latest audit snapshot
  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const merged = { ...bv, seo_audit: { summary: audit.summary, pages_crawled: audit.pages_crawled, finished_at: audit.finished_at, issues_sample: audit.issues.slice(0, 20) } }
  await supabase.from('projects').update({ brand_voice: merged }).eq('id', projectId)

  await trackAICost({ userId: user.id, projectId, module: 'seo_audit_crawl', costUsd: 0, latencyMs: Date.now() - startedAt })

  return Response.json(audit)
}
