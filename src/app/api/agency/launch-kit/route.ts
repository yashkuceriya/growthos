// Launch Library — ready-to-ship launch day kits for Product Hunt, Show HN,
// Indie Hackers, BetaList. Each kit returns a coordinated pack of assets + timing.
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

const ProductHuntKitSchema = z.object({
  launch_date_tip: z.string().describe('Best day/time to launch (timezone: PST)'),
  taglines: z.array(z.string()).length(5).describe('5 taglines, 60 chars max each'),
  description_short: z.string().max(260).describe('260-char max PH description'),
  description_long: z.string().describe('Detailed description for the maker comment'),
  first_maker_comment: z.string().describe('Full first comment to post immediately after launch'),
  topics: z.array(z.string()).max(5).describe('Topic tags to pick'),
  gallery_shots_plan: z.array(z.object({ name: z.string(), description: z.string(), prompt_for_ai_image: z.string() })).min(4).max(6),
  thumbnail_prompt: z.string().describe('Prompt to generate the PH thumbnail image'),
  hunter_pitch_dm: z.string().describe('DM to send a potential hunter asking them to hunt you'),
  supporter_outreach_dm: z.string().describe('Short friendly DM to send to supporters 24h before launch'),
  launch_day_outreach_dm: z.string().describe('Short launch-day notify message to supporters'),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).min(6).max(10),
  pre_launch_checklist: z.array(z.string()).describe('T-7 to T-0 tasks'),
  launch_day_schedule: z.array(z.object({ hour_pst: z.string(), action: z.string() })).min(6).max(12),
  engagement_responses: z.array(z.object({ scenario: z.string(), response: z.string() })).min(4).max(8).describe('Pre-drafted responses for common comments'),
  post_launch_followup: z.string().describe('Thank-you post 24h after launch'),
})

const ShowHNKitSchema = z.object({
  best_time: z.string().describe('Best time to post (Pacific time)'),
  title_formulas: z.array(z.object({
    title: z.string().describe('Title, <80 chars, starting with "Show HN:"'),
    rationale: z.string(),
  })).length(3).describe('3 title options — Show HN audience rewards clarity and technical honesty'),
  body: z.string().describe('Full body — first person, direct, acknowledge tradeoffs, NO marketing-speak'),
  opening_comment: z.string().describe('First comment to pin to your own post with build details'),
  technical_details: z.array(z.string()).describe('Technical bullets HN crowd cares about — stack, novel approach, benchmarks'),
  likely_questions: z.array(z.object({ q: z.string(), answer: z.string() })).min(6).max(10),
  toxic_patterns_to_avoid: z.array(z.string()).describe('HN culture red flags'),
  success_signals: z.array(z.string()).describe('What to watch for in first hour'),
  fallback_if_no_traction: z.string().describe('What to do if post stalls in /new'),
})

const IndieHackersKitSchema = z.object({
  post_types: z.array(z.object({
    type: z.enum(['launch', 'milestone', 'lesson', 'ask', 'behind_the_scenes']),
    title: z.string(),
    body: z.string(),
    ideal_tag: z.string(),
  })).length(3).describe('3 post variants — different angles'),
  product_page_copy: z.object({
    tagline: z.string(),
    description: z.string(),
    pricing_blurb: z.string(),
    founders_story: z.string(),
  }),
  response_templates: z.array(z.object({ comment_type: z.string(), response: z.string() })).min(3).max(6),
  milestone_schedule: z.array(z.object({ revenue_or_metric: z.string(), post_idea: z.string() })).min(3).max(5),
})

const BetaListKitSchema = z.object({
  tagline: z.string().max(60),
  description_short: z.string().max(300),
  description_long: z.string(),
  category: z.string(),
  key_features: z.array(z.string()).length(4),
  founder_note: z.string(),
  submission_tips: z.array(z.string()).describe('Platform-specific submission best practices'),
  waitlist_email_confirmation: z.object({ subject: z.string(), body: z.string() }),
  waitlist_follow_up_sequence: z.array(z.object({ day: z.number(), subject: z.string(), body: z.string(), purpose: z.string() })).min(3).max(5),
})

const MasterLaunchPlanSchema = z.object({
  launch_thesis: z.string().describe('Why this launch will work (or how we are hedging)'),
  launch_stack_priority: z.array(z.object({
    platform: z.enum(['product_hunt', 'hacker_news_show_hn', 'indie_hackers', 'betalist', 'reddit', 'twitter_x', 'linkedin']),
    priority: z.number().min(1).max(7),
    timing_relative: z.string().describe('e.g. "T-14 submit", "T-0 launch 12:01 AM PST"'),
    rationale: z.string(),
  })).min(3).max(7),
  pre_launch_timeline: z.array(z.object({ days_before: z.number(), task: z.string(), owner: z.string() })).min(8).max(15),
  launch_day_timeline: z.array(z.object({ hour: z.string(), task: z.string() })).min(6).max(12),
  post_launch_week_plan: z.array(z.object({ day: z.number().min(1).max(7), task: z.string() })).length(7),
  success_metrics: z.object({
    vanity: z.array(z.string()),
    real: z.array(z.string()),
  }),
  common_pitfalls: z.array(z.string()).min(3).max(6),
})

type Kit = 'product_hunt' | 'show_hn' | 'indie_hackers' | 'betalist' | 'master_plan'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, kit, hunterName, launchDate } = await request.json() as { projectId: string; kit: Kit; hunterName?: string; launchDate?: string }
  if (!projectId || !kit) return Response.json({ error: 'projectId and kit required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
DIFFERENTIATORS: ${Array.isArray(bv.differentiators) ? (bv.differentiators as string[]).join(' · ') : ''}
PRICING: ${bv.pricing ?? ''}
WEBSITE: ${project.website ?? ''}
TONE: ${bv.tone_of_voice ?? 'professional'}
${hunterName ? `HUNTER: ${hunterName}` : ''}
${launchDate ? `LAUNCH DATE: ${launchDate}` : ''}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (kit) {
    case 'product_hunt': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ProductHuntKitSchema,
        system: `You produce Product Hunt launch kits for solo founders. Target #1 of the day. Follow PH culture norms: thoughtful maker comment, specific taglines (no "the easiest way to…" slop), 4-6 gallery shots telling a before/after story, pre-warmed supporter network. Launch time: 12:01 AM PST. Avoid dishonesty or growth hacks that backfire.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the complete Product Hunt launch kit.` }],
      })
      result = res.object
      break
    }
    case 'show_hn': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ShowHNKitSchema,
        system: `You write Show HN posts for the Hacker News community. They reward: specificity, technical honesty, acknowledgment of tradeoffs, founder-first-person voice. They punish: marketing speak, hype, excessive humility, growth hacks. Ideal post time: 8-9 AM Pacific. Title format: "Show HN: [what it does] ([context])". Post a detailed opening comment with technical details.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the Show HN kit.` }],
      })
      result = res.object
      break
    }
    case 'indie_hackers': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: IndieHackersKitSchema,
        system: `You write for the Indie Hackers community. They reward: real numbers (MRR, churn, users), behind-the-scenes, lessons learned, honest struggles. Three post variants should hit different angles (launch announcement, milestone, behind-the-scenes).`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the Indie Hackers kit.` }],
      })
      result = res.object
      break
    }
    case 'betalist': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: BetaListKitSchema,
        system: `You produce BetaList / Betapage / Launching Next submission kits. Focus: clear promise, category fit, concrete early features. Include the waitlist confirmation email + 3-5 follow-up sequence to keep signups warm until launch.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the BetaList kit.` }],
      })
      result = res.object
      break
    }
    case 'master_plan': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: MasterLaunchPlanSchema,
        system: `You are a launch director. Sequence platforms based on this vertical's audience. Not every product should go on HN (e.g. ecommerce should not). Not every product benefits from Product Hunt (local businesses don't). Build a timeline with concrete tasks. Separate vanity metrics from real metrics. Flag common pitfalls.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the master launch plan for this product.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown kit: ${kit}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `launch_kit_${kit}`, costUsd: 0.08, latencyMs: Date.now() - startedAt })

  return Response.json({ kit, vertical, result })
}
