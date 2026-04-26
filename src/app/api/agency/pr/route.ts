// PR / Media Kit suite — press kit, release, journalist pitches, HARO replies,
// podcast guest pitch, speaking pitch, awards applications, newsjacking.
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

// ——————————————— SCHEMAS ———————————————

const PressKitSchema = z.object({
  company_name: z.string(),
  company_boilerplate: z.object({
    short_50: z.string().describe('50-word about paragraph'),
    medium_100: z.string().describe('100-word about'),
    long_250: z.string().describe('250-word about'),
  }),
  product_facts: z.object({
    what_it_is: z.string(),
    target_market: z.string(),
    key_differentiators: z.array(z.string()).length(3),
    pricing_summary: z.string(),
    founded_year: z.string(),
    headquartered: z.string(),
  }),
  founder_bios: z.array(z.object({
    role: z.string(),
    name_placeholder: z.string().describe('e.g. "[Founder Name]"'),
    short_bio_50: z.string(),
    long_bio_150: z.string(),
  })).min(1).max(3),
  press_friendly_stats: z.array(z.object({
    stat: z.string(),
    context: z.string(),
    source_needed: z.string(),
  })).min(5).max(8).describe('Data points journalists love — verify before using'),
  quotes_for_reuse: z.array(z.object({
    quote: z.string(),
    attribution: z.string(),
    context: z.string(),
  })).min(3).max(5),
  media_assets_checklist: z.array(z.string()).describe('What to upload to the press kit page'),
  brand_guidelines_summary: z.object({
    logo_usage: z.string(),
    color_palette_note: z.string(),
    tone_of_voice: z.string(),
    things_to_avoid: z.array(z.string()),
  }),
  faq_for_press: z.array(z.object({ q: z.string(), a: z.string() })).min(5).max(10),
  contact_block: z.object({
    press_email_placeholder: z.string(),
    response_time_commitment: z.string(),
    interview_availability: z.string(),
  }),
})

const PressReleaseSchema = z.object({
  dateline: z.string().describe('CITY, State - Month Day, Year format'),
  headline: z.string().describe('Title case, <80 chars, specific + newsworthy'),
  subheadline: z.string(),
  lede_paragraph: z.string().describe('The 5 Ws in one paragraph'),
  body_paragraphs: z.array(z.string()).min(3).max(5),
  pull_quote: z.object({
    quote: z.string(),
    attribution: z.string(),
  }),
  company_boilerplate: z.string().describe('End-of-release about paragraph'),
  media_contact: z.string().describe('Name + email placeholder block'),
  distribution_tips: z.array(z.string()),
  target_outlets: z.array(z.object({ outlet: z.string(), reporter_role_to_target: z.string(), angle_to_pitch: z.string() })).min(4).max(8),
})

const JournalistPitchSchema = z.object({
  subject_line: z.string().max(70),
  subject_variant_b: z.string().max(70),
  hook_opening: z.string().describe('Why THIS reporter right now — reference recent work'),
  story_pitch: z.string().describe('3-5 sentences: why this is news, why it matters, why now'),
  key_facts: z.array(z.string()).min(3).max(6).describe('Bullet facts the reporter can use'),
  exclusive_angle: z.string().describe('What makes this pitch special to this outlet'),
  call_to_action: z.string().describe('Specific next step ask (interview, demo, embargo copy)'),
  ps_line: z.string().describe('Short P.S. with a bonus hook or proof point'),
  full_email_draft: z.string().describe('Ready-to-send combined draft, 150-200 words'),
  follow_up_at_day_3: z.string(),
  follow_up_at_day_7: z.string(),
  breakup_email_day_14: z.string(),
})

const HaroReplySchema = z.object({
  opening: z.string().describe('Who you are + why you qualify in one line'),
  answer_body: z.string().describe('200-400 words, quotable, specific, no fluff'),
  bio_line: z.string().describe('30-word bio with link'),
  quotable_one_liner: z.string().describe('A single line reporters can pull as a quote'),
  availability_block: z.string(),
  attachments_recommendations: z.array(z.string()),
  confidence_level: z.enum(['strong_fit', 'adjacent_fit', 'reach']),
})

const PodcastPitchSchema = z.object({
  target_podcast: z.string(),
  subject_line: z.string().max(70),
  opening: z.string().describe('Reference a specific recent episode'),
  why_this_guest: z.string().describe('Why me, why now'),
  talk_track_topics: z.array(z.object({
    topic: z.string(),
    angle: z.string(),
    sample_story: z.string(),
  })).min(3).max(5),
  audience_value_prop: z.string().describe('Why their listeners will love this'),
  credibility_markers: z.array(z.string()).describe('Prior podcasts, accomplishments, media mentions'),
  sample_questions: z.array(z.string()).length(5).describe('Questions the host could ask'),
  full_email_draft: z.string(),
  follow_up_if_no_reply: z.string(),
})

const SpeakingPitchSchema = z.object({
  event_name: z.string(),
  talk_title: z.string(),
  talk_subtitle: z.string(),
  abstract_150: z.string().describe('150-word talk abstract'),
  takeaways: z.array(z.string()).length(3),
  speaker_bio: z.string(),
  why_me_why_now: z.string(),
  outline: z.array(z.object({ time_minutes: z.number(), beat: z.string(), key_insight: z.string() })).min(4).max(7),
  past_speaking_note: z.string(),
  full_email_pitch: z.string(),
})

const AwardPitchSchema = z.object({
  award_name: z.string(),
  category: z.string(),
  executive_summary_250: z.string(),
  impact_story: z.string().describe('Concrete impact narrative with numbers'),
  differentiation: z.string(),
  milestones_achieved: z.array(z.string()).min(4).max(8),
  supporting_evidence_needed: z.array(z.string()),
  press_mentions_to_cite: z.array(z.string()),
  customer_testimonials_to_request: z.array(z.string()).describe('Exact people to ask for testimonials'),
  answers_to_common_questions: z.array(z.object({ q: z.string(), a: z.string() })).min(3).max(6),
})

const NewsjackingSchema = z.object({
  scan_framework: z.string().describe('How to spot opportunities — search queries, alerts, feeds'),
  opportunity_types: z.array(z.object({
    type: z.enum(['breaking_story', 'industry_report', 'viral_moment', 'competitor_news', 'policy_change', 'cultural_event']),
    description: z.string(),
    how_to_jump_in: z.string(),
    response_time_window_hours: z.number(),
    channels_to_use: z.array(z.string()),
    example_hook: z.string(),
  })).min(4).max(6),
  templates: z.array(z.object({
    trigger_scenario: z.string(),
    social_response: z.string(),
    reporter_pitch: z.string(),
    blog_angle: z.string(),
  })).min(3).max(5),
  red_flags: z.array(z.string()).describe('When NOT to newsjack — tragedies, sensitive news, etc.'),
  current_watchlist: z.array(z.string()).describe('Topics in this vertical to set Google Alerts for'),
})

type Tool = 'press_kit' | 'press_release' | 'journalist_pitch' | 'haro_reply' | 'podcast_pitch' | 'speaking_pitch' | 'award_pitch' | 'newsjacking'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool, input } = await request.json() as { projectId: string; tool: Tool; input?: Record<string, unknown> }
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
DIFFERENTIATORS: ${Array.isArray(bv.differentiators) ? (bv.differentiators as string[]).join(' · ') : ''}
WEBSITE: ${project.website ?? ''}
FOUNDED: (placeholder)
HEADQUARTERED: (placeholder)`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'press_kit': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: PressKitSchema,
        system: `You build press kits for tech companies. Be specific, non-hyped, usable. Boilerplates should be copy-paste ready at 3 lengths. Stats must be claimed carefully — flag when source verification is needed.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the complete press kit. For missing facts, use bracketed placeholders like [Founder Name] or [Year].` }],
      })
      result = res.object
      break
    }
    case 'press_release': {
      const angle = input?.angle ?? 'Product launch'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: PressReleaseSchema,
        system: `You write AP-style press releases. Lede = 5 Ws (who/what/when/where/why). Body = inverted pyramid. Avoid adjective soup. Include a newsworthy pull quote. Suggest target outlets + specific reporters by role.`,
        messages: [{ role: 'user', content: `${ctx}\nANGLE: ${angle}\n\nProduce the press release + target outlet list.` }],
      })
      result = res.object
      break
    }
    case 'journalist_pitch': {
      const outlet = input?.outlet ?? ''
      const reporter = input?.reporter ?? ''
      const angle = input?.angle ?? ''
      const recent_work = input?.recent_work ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: JournalistPitchSchema,
        system: `You write personalized journalist pitches. Reference the reporter's recent work genuinely. Keep emails 150-200 words. Never lead with company pitch — lead with why the reporter cares. Offer exclusivity or embargo when appropriate.`,
        messages: [{ role: 'user', content: `${ctx}\nOUTLET: ${outlet}\nREPORTER: ${reporter}\nTHEIR RECENT WORK: ${recent_work}\nANGLE: ${angle}\n\nDraft the pitch + 2 follow-ups + breakup email.` }],
      })
      result = res.object
      break
    }
    case 'haro_reply': {
      const query = input?.query ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: HaroReplySchema,
        system: `You write HARO/Qwoted/Featured replies that get picked. Be specific, quotable, and generous with insight. No corporate voice. Give the reporter a pulled-quote one-liner. Honestly assess fit.`,
        messages: [{ role: 'user', content: `${ctx}\nREPORTER QUERY:\n${query}\n\nDraft the reply.` }],
      })
      result = res.object
      break
    }
    case 'podcast_pitch': {
      const podcast = input?.podcast ?? ''
      const recent_episode = input?.recent_episode ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: PodcastPitchSchema,
        system: `You pitch as a potential podcast guest. Reference a real recent episode. Bring 3-5 topic angles with sample stories. Provide 5 questions the host could ask. Never pitch-slap.`,
        messages: [{ role: 'user', content: `${ctx}\nPODCAST: ${podcast}\nRECENT EPISODE: ${recent_episode}\n\nDraft the pitch.` }],
      })
      result = res.object
      break
    }
    case 'speaking_pitch': {
      const event = input?.event ?? ''
      const topic = input?.topic ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: SpeakingPitchSchema,
        system: `You pitch speakers to conferences. Strong talk titles, 150-word abstracts, 3 concrete takeaways, credible speaker bio. Outline beat-by-beat with timing. Acknowledge past speaking experience (or be honest about none).`,
        messages: [{ role: 'user', content: `${ctx}\nEVENT: ${event}\nTOPIC: ${topic}\n\nDraft the speaking pitch.` }],
      })
      result = res.object
      break
    }
    case 'award_pitch': {
      const award = input?.award ?? ''
      const category = input?.category ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: AwardPitchSchema,
        system: `You write award applications. Lead with impact with numbers. Differentiation must be specific. Flag what evidence to gather (testimonials, press, metrics).`,
        messages: [{ role: 'user', content: `${ctx}\nAWARD: ${award}\nCATEGORY: ${category}\n\nDraft the award application.` }],
      })
      result = res.object
      break
    }
    case 'newsjacking': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: NewsjackingSchema,
        system: `You design newsjacking frameworks — how to monitor opportunities and respond with speed. Be specific about time windows. Include red flags for when NOT to jump in.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the newsjacking playbook for this product + vertical.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `pr_${tool}`, costUsd: 0.07, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}
