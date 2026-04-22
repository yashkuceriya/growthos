import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import type { Vertical } from '@/lib/ai/intelligence/classifier'
import { wrapHandler } from '@/lib/api-error'

export const maxDuration = 120

const ReferralSchema = z.object({
  mechanic: z.object({
    referrer_incentive: z.string(),
    referee_incentive: z.string(),
    double_sided: z.boolean(),
    incentive_type: z.enum(['cash', 'credit', 'feature_unlock', 'physical_reward', 'tiered']),
    payout_trigger: z.string(),
    fraud_guardrails: z.array(z.string()),
  }),
  k_factor_model: z.object({
    assumed_invites_per_user: z.number(),
    assumed_conversion_rate_pct: z.number(),
    estimated_k: z.number(),
    viral_cycle_days: z.number(),
    interpretation: z.string(),
  }),
  copy: z.object({
    in_app_share_screen_headline: z.string(),
    share_message_email: z.string(),
    share_message_sms: z.string(),
    share_message_twitter: z.string(),
    share_message_linkedin: z.string(),
    referral_landing_page_headline: z.string(),
    referral_landing_body: z.string(),
  }),
  launch_plan: z.array(z.object({ week: z.number(), action: z.string() })).min(4).max(6),
  measurement: z.object({
    primary_metric: z.string(),
    secondary_metrics: z.array(z.string()),
    dashboard_columns: z.array(z.string()),
  }),
  ab_tests_to_run: z.array(z.object({ hypothesis: z.string(), test: z.string() })).min(3).max(5),
})

const AffiliateSchema = z.object({
  program_overview: z.object({
    commission_structure: z.string(),
    cookie_window_days: z.number(),
    payout_frequency: z.string(),
    minimum_payout_usd: z.number(),
    payment_method: z.string(),
  }),
  partner_tiers: z.array(z.object({
    tier: z.string(),
    qualifying_criteria: z.string(),
    perks: z.array(z.string()),
    commission_rate_pct: z.number(),
  })).min(2).max(4),
  target_affiliate_profiles: z.array(z.object({
    profile: z.string(),
    where_to_find: z.array(z.string()),
    outreach_angle: z.string(),
  })).min(3).max(5),
  outreach_email: z.object({ subject: z.string(), body: z.string() }),
  onboarding_pack_contents: z.array(z.string()),
  creative_assets_to_provide: z.array(z.string()),
  terms_and_conditions_outline: z.array(z.string()),
  tracking_setup: z.array(z.string()),
})

const CommunitySchema = z.object({
  platform_recommendation: z.enum(['discord', 'slack', 'circle', 'skool', 'mighty_networks', 'geneva', 'own_forum']),
  rationale: z.string(),
  channel_structure: z.array(z.object({ channel_name: z.string(), purpose: z.string() })).min(5).max(12),
  seed_content: z.array(z.object({ day: z.number(), post: z.string() })).min(7).max(14),
  onboarding_flow: z.array(z.object({ step: z.number(), action: z.string(), automation_possible: z.boolean() })).min(4).max(7),
  engagement_rituals: z.array(z.object({
    cadence: z.enum(['daily', 'weekly', 'monthly']),
    ritual: z.string(),
    owner: z.enum(['founder', 'community_manager', 'automated', 'ambassadors']),
  })).min(4).max(8),
  moderation_policy: z.array(z.string()).min(4).max(8),
  metrics_to_track: z.array(z.string()),
  growth_tactics: z.array(z.string()).min(4).max(6),
})

const UgcSchema = z.object({
  campaign_idea: z.string(),
  hashtag: z.string(),
  mechanic_description: z.string(),
  incentive_structure: z.string(),
  entry_requirements: z.array(z.string()),
  prompt_brief: z.object({
    what_to_create: z.string(),
    examples: z.array(z.string()),
    tone_guidance: z.string(),
    length_or_duration: z.string(),
  }),
  submission_funnel: z.array(z.object({ step: z.number(), action: z.string() })).min(3).max(5),
  selection_criteria: z.array(z.string()),
  amplification_plan: z.object({
    owned_channels: z.array(z.string()),
    paid_whitelisting: z.string(),
    creator_repost_rights: z.string(),
  }),
  legal_release_template: z.string().describe('Short plain-language UGC usage rights release to include'),
  rollout_timeline: z.array(z.object({ week: z.number(), milestone: z.string() })).min(3).max(6),
})

const AmbassadorSchema = z.object({
  program_name: z.string(),
  value_exchange: z.object({
    we_give: z.array(z.string()),
    we_ask: z.array(z.string()),
    status_perks: z.array(z.string()),
  }),
  selection_criteria: z.array(z.string()).min(4).max(6),
  application_form_questions: z.array(z.string()).min(4).max(7),
  onboarding_journey: z.array(z.object({ week: z.number(), activities: z.array(z.string()) })).min(3).max(5),
  content_calendar_template: z.array(z.object({ month: z.number(), theme: z.string(), deliverables: z.array(z.string()) })).min(3).max(6),
  ambassador_toolkit: z.array(z.string()).describe('Assets, briefs, playbooks given to ambassadors'),
  measurement_per_ambassador: z.array(z.string()),
  graduation_path: z.string().describe('What happens when an ambassador levels up'),
})

type Tool = 'referral' | 'affiliate' | 'community' | 'ugc' | 'ambassador'

async function handlePost(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, tool } = await request.json() as { projectId: string; tool: Tool }
  if (!projectId || !tool) return Response.json({ error: 'projectId and tool required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical

  const ctx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
PRICING: ${bv.pricing ?? ''}`

  const startedAt = Date.now()
  let result: unknown = null

  switch (tool) {
    case 'referral': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: ReferralSchema,
        system: `You design referral programs. Balance incentive value with margin. Include K-factor math, fraud guardrails, full copy suite for all sharing channels, launch plan and A/B tests.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the referral program.` }],
      })
      result = res.object
      break
    }
    case 'affiliate': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: AffiliateSchema,
        system: `You design affiliate programs. Realistic commission rates for this vertical. Tiered partner structure. Outreach email and onboarding pack specs.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the affiliate program.` }],
      })
      result = res.object
      break
    }
    case 'community': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: CommunitySchema,
        system: `You design community strategies. Pick the right platform. Channel structure with clear purposes. Seed content for first 2 weeks. Rituals and moderation.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the community.` }],
      })
      result = res.object
      break
    }
    case 'ugc': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: UgcSchema,
        system: `You design UGC campaigns. Concrete mechanic, legal release template, amplification plan. Natural hashtag. Creator-friendly brief.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the UGC campaign.` }],
      })
      result = res.object
      break
    }
    case 'ambassador': {
      const res = await generateObject({
        model: modelFor('strategic'),
        schema: AmbassadorSchema,
        system: `You design ambassador programs. Clear value exchange — what we give, what we ask. Application flow. 12-month content calendar. Graduation path to advocacy.`,
        messages: [{ role: 'user', content: `${ctx}\n\nDesign the ambassador program.` }],
      })
      result = res.object
      break
    }
    default:
      return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 })
  }

  await trackAICost({ userId: user.id, projectId, module: `growth_${tool}`, costUsd: 0.08, latencyMs: Date.now() - startedAt })

  return Response.json({ tool, vertical, result })
}

export const POST = wrapHandler(handlePost, 'agency/growth-loops')
