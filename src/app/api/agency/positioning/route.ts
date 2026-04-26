// Positioning Studio — strategic positioning, JTBD synthesis, messaging house,
// market sizing, category design, value ladder.
import { createClient } from '@/lib/supabase/server'
import { checkBudget, budgetExceededResponse } from '@/lib/budget-guard'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

const PositioningSchema = z.object({
  positioning_statement: z.string().describe('Classic: "For [audience] who [need], [product] is [category] that [primary benefit]. Unlike [competition], we [differentiation]."'),
  one_line_pitch: z.string().max(120),
  category_frame: z.object({
    current_category: z.string(),
    our_stake: z.enum(['follower', 'contender', 'reframer', 'category_creator']),
    why_this_stake: z.string(),
    alternative_category_frames: z.array(z.string()).describe('Other ways to position if current does not work'),
  }),
  differentiation_matrix: z.array(z.object({
    dimension: z.string(),
    us: z.string(),
    competitor_avg: z.string(),
    magnitude_of_difference: z.enum(['marginal', 'clear', 'step_change']),
  })).min(5).max(8),
  strategic_narrative: z.object({
    shift_in_world: z.string().describe('The inflection point that changes what customers need'),
    consequences: z.string().describe('What happens if they ignore it'),
    promised_land: z.string().describe('The new normal our product enables'),
    obstacles: z.string().describe('Why existing solutions fail'),
    how_we_uniquely_solve: z.string(),
  }),
  audiences_ordered_by_fit: z.array(z.object({
    segment: z.string(),
    fit_score_0_10: z.number(),
    why_they_buy: z.string(),
    why_we_win: z.string(),
  })).min(3).max(5),
})

const JTBDSchema = z.object({
  customer_struggle: z.string().describe('What they\'re trying to get done, not buy'),
  forces_driving: z.object({
    push_of_current_situation: z.string(),
    pull_of_new_solution: z.string(),
    anxiety_of_switching: z.string(),
    habit_of_present: z.string(),
  }),
  jobs: z.array(z.object({
    job_statement: z.string().describe('When I ___, I want to ___, so I can ___.'),
    primary_job_dimensions: z.enum(['functional', 'emotional', 'social']),
    success_criteria: z.array(z.string()).min(2).max(4),
    hiring_criteria: z.array(z.string()).describe('What they look for when "hiring" a solution'),
    firing_criteria: z.array(z.string()).describe('What makes them quit a solution'),
  })).min(3).max(5),
  job_timeline: z.array(z.object({
    stage: z.enum(['first_thought', 'passive_looking', 'active_looking', 'deciding', 'committed', 'using']),
    trigger: z.string(),
    question_they_ask: z.string(),
    where_they_look: z.array(z.string()),
    content_to_serve: z.string(),
  })).length(6),
  progress_over_features: z.string().describe('The progress they\'re making in their life, stated simply'),
})

const MessagingHouseSchema = z.object({
  core_message: z.string().describe('The single sentence that everything rolls up to'),
  pillars: z.array(z.object({
    pillar_name: z.string(),
    pillar_message: z.string(),
    proof_points: z.array(z.string()).min(3).max(5),
    supporting_stories: z.array(z.string()).min(2).max(3),
    do_say: z.array(z.string()),
    dont_say: z.array(z.string()),
  })).length(3).describe('3 core messaging pillars'),
  voice_applications: z.object({
    landing_page_hero: z.string(),
    ad_headline: z.string(),
    sales_deck_opener: z.string(),
    investor_pitch: z.string(),
    social_bio: z.string(),
    elevator_pitch_spoken: z.string(),
  }),
  objection_to_message_map: z.array(z.object({
    common_objection: z.string(),
    message_to_deploy: z.string(),
  })).min(4).max(6),
  segment_variants: z.array(z.object({
    segment: z.string(),
    hook_variant: z.string(),
    proof_variant: z.string(),
    cta_variant: z.string(),
  })).min(2).max(4),
})

const MarketSizingSchema = z.object({
  tam: z.object({
    size_usd: z.string(),
    calculation_method: z.enum(['top_down', 'bottom_up', 'value_theory']),
    logic: z.string(),
    inputs: z.array(z.object({ label: z.string(), value: z.string(), source: z.string() })),
  }),
  sam: z.object({
    size_usd: z.string(),
    geography: z.string(),
    segment_filters: z.array(z.string()),
    logic: z.string(),
  }),
  som: z.object({
    size_usd_year_1: z.string(),
    size_usd_year_3: z.string(),
    win_rate_assumption: z.string(),
    go_to_market_capacity: z.string(),
  }),
  market_trends: z.array(z.object({ trend: z.string(), direction: z.enum(['tailwind', 'headwind', 'neutral']), impact: z.string() })).min(3).max(6),
  beachhead_recommendation: z.string().describe('The first tight segment to dominate before expanding'),
  assumptions_to_validate: z.array(z.string()),
})

const CategoryDesignSchema = z.object({
  recommendation: z.enum(['category_creation', 'category_reframe', 'category_contender', 'stay_generic']),
  rationale: z.string(),
  proposed_category_name: z.string(),
  category_creation_playbook: z.array(z.object({
    move: z.string(),
    why: z.string(),
    timeline_months: z.number(),
  })).min(4).max(8),
  languaging_shifts: z.array(z.object({
    old_language: z.string(),
    new_language: z.string(),
    why_shift: z.string(),
  })).min(3).max(6),
  thought_leadership_topics: z.array(z.string()).min(5).max(8).describe('Talks, essays, POVs to seed the category'),
  lighting_talks_to_give: z.array(z.string()),
  books_podcasts_to_appear_on: z.array(z.string()),
  manifest_document: z.string().describe('The POV manifesto that defines the new category (200-300 words)'),
})

const ValueLadderSchema = z.object({
  ladder: z.array(z.object({
    rung: z.number().min(1).max(6),
    name: z.string(),
    price_usd: z.string(),
    what_is_included: z.array(z.string()),
    target_buyer: z.string(),
    primary_channel_to_sell: z.string(),
    conversion_rate_from_previous: z.string(),
    avg_time_to_purchase: z.string(),
  })).min(3).max(6),
  ascension_moments: z.array(z.object({
    trigger: z.string(),
    message: z.string(),
    offer: z.string(),
  })).min(3).max(5),
  lead_magnets: z.array(z.object({
    name: z.string(),
    format: z.string(),
    target_segment: z.string(),
    promotion_channel: z.string(),
  })).min(2).max(4),
  descension_offers: z.array(z.object({
    trigger_churn_signal: z.string(),
    save_offer: z.string(),
  })).min(2).max(3),
  upsell_sequences: z.array(z.object({
    from_rung: z.number(),
    to_rung: z.number(),
    email_count: z.number(),
    trigger: z.string(),
  })).min(2).max(4),
})

type Tool = 'positioning' | 'jtbd' | 'messaging_house' | 'market_sizing' | 'category_design' | 'value_ladder'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool, input } = await request.json() as { projectId: string; tool: Tool; input?: Record<string, unknown> }
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const budget = await checkBudget(supabase, projectId)
  if (!budget.ok) return budgetExceededResponse(budget)

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).maybeSingle()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical
  const intel = (bv.competitive_intel as Record<string, unknown> | undefined)

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
DIFFERENTIATORS: ${Array.isArray(bv.differentiators) ? (bv.differentiators as string[]).join(' · ') : ''}
PRICING: ${bv.pricing ?? ''}
COMPETITORS: ${intel?.competitors ? JSON.stringify(intel.competitors).slice(0, 2000) : 'unknown'}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'positioning': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: PositioningSchema,
        system: `You are April Dunford caliber on positioning. Ruthlessly specific. Force a choice on category. No generic "best-in-class". Every dimension of differentiation must be concrete and testable.`,
        messages: [{ role: 'user', content: `${ctx}\n\nProduce the positioning brief.` }],
      })
      result = res.object
      break
    }
    case 'jtbd': {
      const interviewNotes = input?.interview_notes ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: JTBDSchema,
        system: `You synthesize Jobs to be Done using the Christensen / Bob Moesta approach. Forces-of-Progress framework. Jobs must focus on progress-in-life, not features. 6-stage timeline maps to marketing content.`,
        messages: [{ role: 'user', content: `${ctx}\nCUSTOMER INTERVIEW NOTES (if any):\n${interviewNotes}\n\nSynthesize the JTBD for this product.` }],
      })
      result = res.object
      break
    }
    case 'messaging_house': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: MessagingHouseSchema,
        system: `You build the messaging house: one roof message, 3 pillars with proof, segment variants, and objection-to-message map. Every voice application must be usable as-is.`,
        messages: [{ role: 'user', content: `${ctx}\n\nBuild the messaging house.` }],
      })
      result = res.object
      break
    }
    case 'market_sizing': {
      const method = (input?.method as 'top_down' | 'bottom_up' | 'value_theory') ?? 'bottom_up'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: MarketSizingSchema,
        system: `You do rigorous TAM/SAM/SOM sizing using the ${method} method. Show the math. Flag assumptions that need validation. Recommend a beachhead segment to dominate before broad expansion.`,
        messages: [{ role: 'user', content: `${ctx}\n\nSize the market for this product.` }],
      })
      result = res.object
      break
    }
    case 'category_design': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: CategoryDesignSchema,
        system: `You assess whether to create a new category, reframe an existing one, be a contender, or stay generic. Most products should NOT create categories — reserve that for cases with true novelty. Include a manifest-style POV document if category creation is warranted.`,
        messages: [{ role: 'user', content: `${ctx}\n\nAssess category strategy and produce the playbook.` }],
      })
      result = res.object
      break
    }
    case 'value_ladder': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ValueLadderSchema,
        system: `You design a Russell-Brunson-meets-PLG value ladder — free lead magnet → entry → core → premium → high-ticket. Each rung has a clear buyer, channel, and ascension trigger. Include descension (save) offers and upsell sequences.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the value ladder.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `positioning_${tool}`, costUsd: 0.09, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}
