// Market Intelligence — scans Reddit (playbook subreddits), HN, optional RSS
// and synthesizes trending themes, pains, gaps, angles via LLM.
export const runtime = 'nodejs'
export const maxDuration = 120

import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { pickSubreddits } from '@/lib/ai/launch/specs'
import { fetchSubredditTop, fetchHNTopStories, fetchRss } from '@/lib/ai/market/pullers'
import { mergeBrandVoice } from '@/lib/brand-voice'

const SynthesisSchema = z.object({
  scanned_at: z.string(),
  trending_themes: z.array(z.object({
    theme: z.string(),
    why_hot: z.string(),
    evidence: z.array(z.string()).describe('Quoted snippets or thread titles driving this'),
    relevance_to_product_0_10: z.number(),
    angle_we_could_own: z.string(),
  })).min(3).max(6),
  pain_points_surfacing: z.array(z.object({
    pain: z.string(),
    frequency_signal: z.enum(['rare', 'common', 'dominant']),
    emotional_tone: z.enum(['frustrated', 'confused', 'angry', 'defeated', 'curious', 'hopeful']),
    example_quote: z.string(),
    can_we_solve: z.enum(['directly', 'partially', 'adjacent', 'no']),
  })).min(3).max(8),
  feature_requests_heard: z.array(z.string()),
  competitor_moves: z.array(z.object({
    competitor: z.string(),
    move: z.string(),
    our_response_angle: z.string(),
  })),
  white_space_gaps: z.array(z.string()).describe('What the audience is asking for that nobody addresses'),
  newsjacking_opportunities: z.array(z.object({
    headline: z.string(),
    response_angle: z.string(),
    urgency_hours: z.number(),
  })).min(1).max(4),
  recommended_content_hooks: z.array(z.object({
    hook: z.string(),
    format: z.enum(['reddit_post', 'tweet', 'thread', 'blog', 'video_short']),
    why_now: z.string(),
  })).min(4).max(8),
  avoid_topics: z.array(z.string()).describe('Topics currently radioactive or saturated'),
  sentiment_summary: z.string(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, extraSubreddits, rssFeeds } = await request.json()
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical
  const audience = (bv.target_audience as string) ?? ''
  const valueProp = (bv.value_proposition as string) ?? project.description ?? ''
  const competitors = ((bv.competitive_intel as { competitors?: Array<{ name: string }> } | undefined)?.competitors ?? []).map((c) => c.name)

  const startedAt = Date.now()

  // 1. Pull data in parallel
  const subs = [
    ...pickSubreddits(audience, valueProp),
    ...(Array.isArray(extraSubreddits) ? (extraSubreddits as string[]).slice(0, 3) : []),
  ]
  const uniqSubs = Array.from(new Set(subs)).slice(0, 5)

  // Keyword seeds for HN filtering
  const hnSeeds = [
    project.name,
    ...(vertical ? vertical.split('_') : []),
    ...(audience ? audience.split(/\s+/).slice(0, 3) : []),
  ].filter((w) => typeof w === 'string' && w.length > 3)

  const [redditResults, hnStories, rssItems] = await Promise.all([
    Promise.all(uniqSubs.map((s) => fetchSubredditTop(s, 10))),
    fetchHNTopStories(12, hnSeeds),
    Promise.all((Array.isArray(rssFeeds) ? (rssFeeds as string[]).slice(0, 3) : []).map((u) => fetchRss(u, 8))),
  ])

  const redditFlat = redditResults.flat()
  const rssFlat = rssItems.flat()

  // 2. Compact context for LLM
  const dataDigest = `REDDIT THREADS (past 7d top, ${uniqSubs.join(', ')}):
${redditFlat.map((t) => `[r/${t.subreddit} · ${t.upvotes}↑ · ${t.num_comments}💬] ${t.title}${t.selftext ? '\n  → ' + t.selftext.slice(0, 400) : ''}${t.top_comments.length ? '\n  top comments:\n    ' + t.top_comments.slice(0, 2).join('\n    ') : ''}`).join('\n\n')}

HACKER NEWS (top stories filtered to topic):
${hnStories.map((s) => `[${s.score}↑ · ${s.descendants}💬] ${s.title}${s.url ? ' — ' + s.url : ''}`).join('\n')}

${rssFlat.length ? `RSS (competitor blogs / industry):\n${rssFlat.map((r) => `- ${r.title}${r.pubDate ? ' (' + r.pubDate + ')' : ''}\n  ${r.summary}`).join('\n\n')}` : ''}`

  const synth = await generateObject({
    model: modelFor('strategic'),
    schema: SynthesisSchema,
    system: `You are a market intelligence analyst. Synthesize raw signals (Reddit threads, HN stories, RSS) into: trending themes, pain points, feature requests, competitor moves, white-space gaps, newsjacking opportunities, content hooks. Be ruthlessly specific — cite evidence from the data, don't hallucinate. Prioritize signals with high volume or strong emotional weight.`,
    messages: [{ role: 'user', content: `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${valueProp}
AUDIENCE: ${audience}
KNOWN COMPETITORS: ${competitors.join(', ')}

RAW MARKET DATA (past 7 days):
${dataDigest.slice(0, 24_000)}

Synthesize market intelligence. Today's date: ${new Date().toISOString().slice(0, 10)}` }],
  })

  const intel = { ...synth.object, scanned_at: new Date().toISOString() }

  // Atomic shallow merge via RPC
  await mergeBrandVoice(supabase, projectId, { market_intel: intel, market_intel_scanned_at: intel.scanned_at })

  await trackAICost({ userId: user.id, projectId, module: 'market_intel', costUsd: 0.10, latencyMs: Date.now() - startedAt })

  return Response.json({
    intel,
    sources: {
      subreddits_scanned: uniqSubs,
      reddit_threads_count: redditFlat.length,
      hn_stories_count: hnStories.length,
      rss_items_count: rssFlat.length,
    },
  })
}
