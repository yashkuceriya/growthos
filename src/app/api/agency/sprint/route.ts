import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'

const SprintPlanSchema = z.object({
  sprint_theme: z.string().describe('Single theme tying this week together'),
  north_star: z.string().describe('Single KPI to move this week'),
  deliverables: z.array(z.object({
    day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
    time: z.string().describe('Posting time recommendation (e.g. "9:00 AM ET")'),
    channel: z.enum(['meta_ad', 'linkedin_post', 'twitter_thread', 'twitter_tweet', 'reddit_post', 'tiktok_reel', 'blog_publish', 'email_send', 'community_engage', 'outreach_dm']),
    title: z.string().describe('Short deliverable title'),
    owner: z.string().describe('Which agent produces this (e.g. "Copywriter", "Social Manager")'),
    estimated_effort_minutes: z.number(),
    success_metric: z.string().describe('How we know it worked'),
  })).min(12).max(25),
  experiments_to_run: z.array(z.object({
    name: z.string(),
    hypothesis: z.string(),
    variant_a: z.string(),
    variant_b: z.string(),
    duration_days: z.number(),
  })).length(2),
  check_ins: z.array(z.object({
    day: z.string(),
    action: z.string(),
  })).describe('Daily check-in tasks like "review yesterday metrics" or "respond to Reddit comments"'),
  week_end_review: z.string().describe('What the agency will report on Sunday'),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await request.json()
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}

  const startedAt = Date.now()
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: SprintPlanSchema,
    system: `You are a Director of Marketing running an agile weekly sprint for a lean founder-led team. Produce a concrete, time-blocked sprint plan with 12-20 deliverables spread across the week. Mix high-effort flagship pieces with quick daily wins. Respect real posting-time best practices per platform.`,
    messages: [{ role: 'user', content: `PRODUCT: ${project.name}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
CURRENT THEME: ${bv.positioning_statement ?? ''}

Design this week's marketing sprint. Week starts Monday. Balance paid/organic/content/community/outreach.` }],
  })

  // Save to project metadata
  const week = new Date().toISOString().slice(0, 10)
  const merged = {
    ...bv,
    current_sprint: { ...res.object, week_start: week },
    sprint_generated_at: new Date().toISOString(),
  }
  await supabase.from('projects').update({ brand_voice: merged }).eq('id', projectId)

  await trackAICost({
    userId: user.id, projectId, module: 'agency_sprint',
    costUsd: 0.07, latencyMs: Date.now() - startedAt,
  })

  return Response.json({ sprint: res.object })
}
