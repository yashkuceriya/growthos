// Unified Sales Outbound Suite dispatcher — mirrors /optimize pattern.
// Tools: outbound_sequence, linkedin_sequence, battle_card, objection_library,
//        discovery_script, demo_script, roi_calculator, icp_builder.
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import { getPlaybook } from '@/lib/ai/playbooks/registry'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

// ——————————————— SCHEMAS ———————————————

const OutboundSequenceSchema = z.object({
  target_persona: z.string().describe('Who these emails target'),
  sequence_name: z.string(),
  total_duration_days: z.number(),
  emails: z.array(z.object({
    step: z.number().min(1).max(8),
    send_day: z.number().describe('Days after sequence start'),
    purpose: z.enum(['cold_open', 'value_add', 'social_proof', 'case_study', 'direct_ask', 'break_up', 'reengagement']),
    subject_line: z.string().max(60).describe('A/B ready — specific, not clickbait'),
    subject_variant_b: z.string().max(60),
    preview_text: z.string().max(90),
    body: z.string().describe('Plain-text email body, 80-150 words'),
    cta: z.string().describe('Call to action (e.g. "15 min call this week?")'),
    personalization_fields: z.array(z.string()).describe('Variables like {{first_name}}, {{company}}, {{recent_event}}'),
    notes_for_sender: z.string().describe('Why this step exists in the sequence'),
  })).min(4).max(7),
  deliverability_checklist: z.array(z.string()).describe('Pre-send warmup and compliance checks'),
  follow_up_rules: z.object({
    if_reply_interested: z.string(),
    if_reply_objection: z.string(),
    if_no_reply: z.string(),
    if_unsubscribe: z.string(),
  }),
})

const LinkedInSequenceSchema = z.object({
  target_persona: z.string(),
  steps: z.array(z.object({
    step: z.number().min(1).max(6),
    day: z.number(),
    type: z.enum(['profile_view', 'connect_request', 'direct_message', 'comment_engagement', 'inmail', 'post_share']),
    message: z.string().max(300).describe('LinkedIn connection request message max 300 chars; regular DMs can be longer'),
    personalization_fields: z.array(z.string()),
    rationale: z.string(),
  })).min(4).max(6),
  engagement_tips: z.array(z.string()).describe('What to do between steps (react to their posts, etc.)'),
})

const BattleCardSchema = z.object({
  competitor: z.string(),
  one_line_summary: z.string(),
  their_positioning: z.string(),
  their_ideal_customer: z.string(),
  pricing_model: z.string(),
  their_strengths: z.array(z.string()).min(3).max(6),
  their_weaknesses: z.array(z.string()).min(3).max(6),
  our_strengths_vs_them: z.array(z.string()).min(3).max(6),
  our_weaknesses_vs_them: z.array(z.string()).describe('Honest — where they win. Use to qualify out.'),
  land_grab_segments: z.array(z.string()).describe('Customer segments where we beat them decisively'),
  avoid_segments: z.array(z.string()).describe('Where they win — do not compete here'),
  talk_track_when_prospect_mentions_them: z.string().describe('Ready-to-use response'),
  feature_comparison: z.array(z.object({
    feature: z.string(),
    us: z.string(),
    them: z.string(),
    winner: z.enum(['us', 'them', 'tie']),
  })).min(6).max(12),
  traps_to_set: z.array(z.string()).describe('Discovery questions that expose their weaknesses'),
  switching_incentive: z.string().describe('What to offer a prospect currently using them'),
})

const ObjectionLibrarySchema = z.object({
  objections: z.array(z.object({
    category: z.enum(['price', 'competitor', 'timing', 'authority', 'need', 'trust', 'fit', 'bandwidth']),
    objection_phrasing: z.array(z.string()).min(2).max(4).describe('How the prospect actually says it'),
    root_cause: z.string().describe('What is really going on beneath the surface'),
    reframe: z.string().describe('How to reframe the conversation'),
    response: z.string().describe('Word-for-word response'),
    follow_up_question: z.string(),
    proof_to_cite: z.string(),
  })).min(10).max(15),
})

const DiscoveryScriptSchema = z.object({
  framework: z.enum(['BANT', 'MEDDIC', 'SPIN', 'CHAMP', 'GPCT']),
  call_duration_minutes: z.number(),
  opening: z.object({
    warmup: z.string(),
    agenda_setter: z.string(),
    mutual_time_check: z.string(),
  }),
  sections: z.array(z.object({
    section: z.string(),
    time_allotted_min: z.number(),
    questions: z.array(z.string()).min(3).max(6),
    listen_for: z.array(z.string()).describe('Signals to catch in their answers'),
    red_flags: z.array(z.string()).describe('Disqualify signals'),
  })).min(4).max(6),
  closing: z.object({
    summary: z.string(),
    next_steps_options: z.array(z.string()),
    mutual_action_plan: z.string(),
  }),
  scorecard: z.array(z.object({
    criterion: z.string(),
    max_points: z.number(),
    evidence_needed: z.string(),
  })).describe('Post-call qualification scorecard'),
})

const DemoScriptSchema = z.object({
  demo_length_minutes: z.number(),
  pre_demo_questions: z.array(z.string()).describe('Async questions to ask before the call'),
  opening: z.object({
    recap_pain: z.string(),
    demo_promise: z.string(),
    agenda: z.string(),
  }),
  demo_beats: z.array(z.object({
    beat_number: z.number(),
    name: z.string(),
    time_minutes: z.number(),
    what_to_show: z.string(),
    how_to_frame: z.string(),
    interactive_moment: z.string().describe('When to hand over control or ask a question'),
    common_wow_reaction: z.string(),
  })).min(4).max(6),
  objection_anticipations: z.array(z.object({ likely_objection: z.string(), preempt: z.string() })).min(2).max(4),
  closing: z.object({
    recap_value: z.string(),
    commitment_ask: z.string(),
    next_step_options: z.array(z.string()),
  }),
})

const RoiCalculatorSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputs: z.array(z.object({
    key: z.string().describe('snake_case identifier'),
    label: z.string(),
    type: z.enum(['number', 'currency', 'percent', 'select']),
    default_value: z.union([z.number(), z.string()]),
    options: z.array(z.string()).optional(),
    help_text: z.string(),
  })).min(3).max(8),
  calculations: z.array(z.object({
    key: z.string(),
    label: z.string(),
    formula: z.string().describe('Plain-language formula using input keys (e.g. "team_size * hours_saved_per_week * 50 * hourly_rate")'),
    format: z.enum(['currency', 'percent', 'number', 'months']),
  })).min(2).max(5),
  headline_metric_key: z.string(),
  cta_text: z.string(),
  embed_html: z.string().describe('Self-contained HTML snippet with inline <script> for calculation logic'),
  assumptions: z.array(z.string()),
})

const IcpBuilderSchema = z.object({
  icp_name: z.string(),
  firmographics: z.object({
    industry: z.array(z.string()),
    company_size_range: z.string(),
    revenue_range: z.string(),
    geography: z.array(z.string()),
    stage: z.string(),
  }),
  buyer_persona: z.object({
    title: z.string(),
    seniority_level: z.string(),
    age_range: z.string(),
    tenure_years: z.string(),
    day_in_the_life: z.string(),
    reports_to: z.string(),
    success_kpis: z.array(z.string()),
  }),
  pains_top_3: z.array(z.object({
    pain: z.string(),
    status_quo_cost: z.string(),
    emotional_impact: z.string(),
  })).length(3),
  jobs_to_be_done: z.array(z.object({
    job: z.string(),
    context: z.string(),
    current_solution: z.string(),
    unmet_need: z.string(),
  })).min(2).max(4),
  buying_triggers: z.array(z.string()).describe('Events that make them actively shop (e.g. new hire, funding round)'),
  disqualifiers: z.array(z.string()).describe('Reasons to NOT sell to them'),
  watering_holes: z.array(z.string()).describe('Where they already spend attention (communities, newsletters, podcasts)'),
  ideal_messaging_angles: z.array(z.string()).length(3),
  sales_motion: z.enum(['self_serve', 'plg_with_touch', 'low_touch_sales', 'mid_market_sales', 'enterprise']),
})

// ——————————————— DISPATCHER ———————————————

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool, input } = await request.json()
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical
  const pb = getPlaybook(vertical)

  const baseCtx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'} (${pb.kpis.primary})
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
DIFFERENTIATORS: ${Array.isArray(bv.differentiators) ? (bv.differentiators as string[]).join(' · ') : ''}
PRICING: ${bv.pricing ?? ''}
WEBSITE: ${project.website ?? ''}
TONE: ${bv.tone_of_voice ?? 'professional'}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'outbound_sequence': {
      const persona = input?.target_persona ?? bv.target_audience ?? 'decision maker'
      const painPoint = input?.pain_point ?? ''
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: OutboundSequenceSchema,
        system: `You are a top-1% cold email copywriter (think Jason Bay, Josh Braun). Write direct, short, specific sequences. No fluff, no "I hope this finds you well". Each email earns the next. Use the "problem-agitate-proof-ask" or "observation-insight-ask" patterns. Respect CAN-SPAM.`,
        messages: [{ role: 'user', content: `${baseCtx}\nTARGET PERSONA: ${persona}\nPAIN POINT: ${painPoint}\n\nWrite a 4-6 email cold outbound sequence.` }],
      })
      result = res.object
      break
    }
    case 'linkedin_sequence': {
      const persona = input?.target_persona ?? bv.target_audience ?? 'decision maker'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: LinkedInSequenceSchema,
        system: `You design LinkedIn outbound cadences that feel human, not automated. Connection request msgs <300 chars. Mix of profile views, engagement on their posts, and DMs. Avoid pitch-slaps.`,
        messages: [{ role: 'user', content: `${baseCtx}\nTARGET PERSONA: ${persona}\n\nDesign a 4-6 step LinkedIn cadence.` }],
      })
      result = res.object
      break
    }
    case 'battle_card': {
      const competitor = input?.competitor ?? ''
      if (!competitor) return Response.json({ error: 'competitor required' }, { status: 400 })
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: BattleCardSchema,
        system: `You write sales battle cards — internal docs sales reps use in deals. Be honest. Acknowledge where the competitor wins. Give specific talk tracks, not generic "we're better". This is a fighting document.`,
        messages: [{ role: 'user', content: `${baseCtx}\nCOMPETITOR: ${competitor}\n\nProduce the battle card. Be honest about where they beat us.` }],
      })
      result = res.object
      break
    }
    case 'objection_library': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ObjectionLibrarySchema,
        system: `You produce an objection handling library for sales reps. Every objection has a real root cause — surface it. Responses must be conversational and land well on a call, not written-sales-letter voice.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nProduce 10-15 objections the sales team will hear, with root cause + reframe + response + follow-up.` }],
      })
      result = res.object
      break
    }
    case 'discovery_script': {
      const framework = input?.framework ?? 'MEDDIC'
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: DiscoveryScriptSchema,
        system: `You write discovery call scripts in the ${framework} framework. Each question must earn the next. Include listen-for signals and red-flag disqualifiers. End with a mutual action plan.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nProduce the discovery call script.` }],
      })
      result = res.object
      break
    }
    case 'demo_script': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: DemoScriptSchema,
        system: `You design demo scripts that sell, not tour. Tie every beat to a confirmed pain from discovery. Hand over control at key moments. Preempt likely objections inline.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nDesign a 20-30 min demo script.` }],
      })
      result = res.object
      break
    }
    case 'roi_calculator': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: RoiCalculatorSchema,
        system: `You build embeddable ROI calculators. Inputs must be realistic things prospects know. Calculations must be defensible (we'll show assumptions). Output clean vanilla-JS HTML that can drop into any landing page.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nDesign an ROI calculator prospects can fill out to justify purchase. Include self-contained HTML + JS.` }],
      })
      result = res.object
      break
    }
    case 'icp_builder': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: IcpBuilderSchema,
        system: `You synthesize Ideal Customer Profiles. Be specific — "SMB tech companies" is lazy; "Series A/B B2B SaaS with 15-60 employees, $1-10M ARR, sales-led, HubSpot users" is useful. Include disqualifiers.`,
        messages: [{ role: 'user', content: `${baseCtx}\n\nBuild the ICP.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `sales_${tool}`, costUsd: 0.06, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}
