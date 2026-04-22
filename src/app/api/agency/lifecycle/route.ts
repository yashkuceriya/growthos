// Full email lifecycle generator. Reads the playbook's required lifecycle_emails for
// the project's vertical and produces a coordinated set in one run.
import { createClient } from '@/lib/supabase/server'
import { generateObject } from 'ai'
import { modelFor } from '@/lib/ai/models'
import { z } from 'zod'
import { trackAICost } from '@/lib/cost-tracker'
import { getPlaybook } from '@/lib/ai/playbooks/registry'
import type { Vertical } from '@/lib/ai/intelligence/classifier'

// ——————————————— LIFECYCLE STAGE LIBRARY ———————————————
// Each stage = a purpose + trigger + cadence. Generator produces copy per stage.

export interface LifecycleStage {
  id: string
  label: string
  purpose: string
  trigger: string
  suggested_delay_hours: number
  category: 'onboarding' | 'activation' | 'retention' | 'expansion' | 'winback' | 'transactional' | 'newsletter' | 'survey'
  tone_shift: string
}

export const LIFECYCLE_STAGES: Record<string, LifecycleStage> = {
  welcome: { id: 'welcome', label: 'Welcome', purpose: 'First touch after signup. Set expectations, point to quickstart.', trigger: 'On signup', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'warm, excited, quick' },
  activation: { id: 'activation', label: 'Activation Nudge', purpose: 'User hasn\'t hit aha moment. Reduce friction to first value.', trigger: '24h after signup with no key action', suggested_delay_hours: 24, category: 'activation', tone_shift: 'helpful, specific, low pressure' },
  aha_moment: { id: 'aha_moment', label: 'Aha Moment Reinforcement', purpose: 'Celebrate first win. Deepen engagement.', trigger: 'User completes first key action', suggested_delay_hours: 1, category: 'activation', tone_shift: 'celebratory, curious, forward-looking' },
  feature_walkthrough: { id: 'feature_walkthrough', label: 'Feature Walkthrough', purpose: 'Introduce a high-value feature they haven\'t used.', trigger: 'Day 3-5 post-signup', suggested_delay_hours: 72, category: 'activation', tone_shift: 'educational, concrete' },
  feature_education: { id: 'feature_education', label: 'Feature Education Series', purpose: 'Drip of 1 feature per email for power usage.', trigger: 'Day 7+ post-signup, weekly cadence', suggested_delay_hours: 168, category: 'activation', tone_shift: 'expert, tactical' },
  trial_activation: { id: 'trial_activation', label: 'Trial Activation', purpose: 'Get trial user to key actions before trial expires.', trigger: 'Day 3 of trial', suggested_delay_hours: 72, category: 'activation', tone_shift: 'urgent but helpful' },
  trial_expiry: { id: 'trial_expiry', label: 'Trial Expiry Warning', purpose: 'Prompt upgrade before trial ends.', trigger: '3 days before trial end', suggested_delay_hours: 0, category: 'activation', tone_shift: 'direct, benefit-led' },
  upgrade_nudge: { id: 'upgrade_nudge', label: 'Upgrade to Pro', purpose: 'Hit a plan limit or value moment → suggest upgrade.', trigger: 'When user hits plan limit or high-value action', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'confident, value-anchored' },
  abandoned_cart: { id: 'abandoned_cart', label: 'Abandoned Cart', purpose: 'Recover cart abandoners with urgency + incentive.', trigger: '1h after cart abandon', suggested_delay_hours: 1, category: 'transactional', tone_shift: 'playful, small urgency' },
  browse_abandon: { id: 'browse_abandon', label: 'Browse Abandon', purpose: 'Re-engage browsers who viewed but didn\'t buy.', trigger: '6h after session ends without purchase', suggested_delay_hours: 6, category: 'transactional', tone_shift: 'curious, helpful' },
  post_purchase: { id: 'post_purchase', label: 'Post-Purchase', purpose: 'Confirm + set expectations + reduce buyer\'s remorse.', trigger: 'Immediate after purchase', suggested_delay_hours: 0, category: 'transactional', tone_shift: 'confirming, reassuring, excited' },
  review_request: { id: 'review_request', label: 'Review Request', purpose: 'Ask for review at peak happiness.', trigger: '7-14 days post-delivery or first use', suggested_delay_hours: 336, category: 'retention', tone_shift: 'humble, direct ask' },
  replenishment: { id: 'replenishment', label: 'Replenishment', purpose: 'Remind customer when consumable is running low.', trigger: 'X days before typical run-out', suggested_delay_hours: 720, category: 'retention', tone_shift: 'helpful, functional' },
  retention_nudge: { id: 'retention_nudge', label: 'Retention Check-In', purpose: 'Light-touch value reinforcement for declining engagement.', trigger: '14 days of low usage', suggested_delay_hours: 336, category: 'retention', tone_shift: 'caring, not pushy' },
  winback_30d: { id: 'winback_30d', label: 'Win-back — 30 days', purpose: 'Re-engage lapsed user after 30 days.', trigger: '30 days inactive', suggested_delay_hours: 720, category: 'winback', tone_shift: 'honest, "we miss you", fresh value' },
  winback_90d: { id: 'winback_90d', label: 'Win-back — 90 days', purpose: 'Re-engage long lapsed user with offer.', trigger: '90 days inactive', suggested_delay_hours: 2160, category: 'winback', tone_shift: 'direct, offer-led, last attempt' },
  sunset: { id: 'sunset', label: 'Sunset', purpose: 'Honest unsubscribe offer. Protect deliverability.', trigger: '180 days no opens', suggested_delay_hours: 4320, category: 'winback', tone_shift: 'honest, no-hard-feelings' },
  referral: { id: 'referral', label: 'Referral Invite', purpose: 'Ask happy user to refer. Double-sided incentive.', trigger: '30 days post-activation', suggested_delay_hours: 720, category: 'expansion', tone_shift: 'friendly, incentive-led' },
  renewal: { id: 'renewal', label: 'Renewal Reminder', purpose: 'Annual / subscription renewal heads-up.', trigger: '30 days before renewal', suggested_delay_hours: 0, category: 'transactional', tone_shift: 'informative, benefit-reiterating' },
  feature_announcement: { id: 'feature_announcement', label: 'New Feature Announcement', purpose: 'Introduce a new feature to existing users.', trigger: 'On feature release', suggested_delay_hours: 0, category: 'retention', tone_shift: 'excited, benefit-focused' },
  nps: { id: 'nps', label: 'NPS Survey', purpose: 'Gauge satisfaction and pick up detractors early.', trigger: 'Quarterly', suggested_delay_hours: 0, category: 'survey', tone_shift: 'neutral, short' },
  case_study: { id: 'case_study', label: 'Case Study Drop', purpose: 'Share customer story for inspiration + social proof.', trigger: 'Monthly', suggested_delay_hours: 0, category: 'newsletter', tone_shift: 'story-led' },
  appointment_reminder: { id: 'appointment_reminder', label: 'Appointment Reminder', purpose: 'Reduce no-shows for booked services.', trigger: '24h before appointment', suggested_delay_hours: 0, category: 'transactional', tone_shift: 'brief, confirming' },
  booking_confirm: { id: 'booking_confirm', label: 'Booking Confirmation', purpose: 'Confirm booking + set expectations.', trigger: 'On booking', suggested_delay_hours: 0, category: 'transactional', tone_shift: 'clear, confirming' },
  aha_moment_fallback: { id: 'aha_moment', label: 'Aha (alias)', purpose: '', trigger: '', suggested_delay_hours: 0, category: 'activation', tone_shift: '' },
  kyc_nudge: { id: 'kyc_nudge', label: 'KYC Nudge', purpose: 'Push user to complete identity verification.', trigger: 'Signup + 24h no KYC', suggested_delay_hours: 24, category: 'activation', tone_shift: 'reassuring, security-led' },
  first_deposit: { id: 'first_deposit', label: 'First Deposit Nudge', purpose: 'Push user to fund account after KYC.', trigger: 'KYC complete + 24h no deposit', suggested_delay_hours: 24, category: 'activation', tone_shift: 'encouraging, benefits-led' },
  welcome_discount: { id: 'welcome_discount', label: 'Welcome Discount', purpose: 'First-time buyer code to reduce friction.', trigger: 'Newsletter/signup opt-in', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'warm, offer-led' },
  welcome_lead_magnet: { id: 'welcome_lead_magnet', label: 'Welcome + Lead Magnet Delivery', purpose: 'Deliver promised lead magnet + set tone.', trigger: 'On opt-in', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'warm, overdelivering' },
  nurture: { id: 'nurture', label: 'Nurture Series', purpose: 'Build trust and intent over 5-7 emails.', trigger: 'Post opt-in, every 2-3 days', suggested_delay_hours: 48, category: 'activation', tone_shift: 'educational, personal' },
  pre_launch: { id: 'pre_launch', label: 'Pre-Launch Build-Up', purpose: 'Build anticipation before cart open.', trigger: '7-14 days before launch', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'exciting, insider' },
  launch_cart: { id: 'launch_cart', label: 'Cart Open', purpose: 'Open cart with clear offer + urgency.', trigger: 'Launch day', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'direct, offer-led' },
  cart_close: { id: 'cart_close', label: 'Cart Close', purpose: 'Last chance before cart closes.', trigger: '4-12h before close', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'urgent, clear deadline' },
  student_onboarding: { id: 'student_onboarding', label: 'Student Onboarding', purpose: 'Get new student into course fast.', trigger: 'On enrollment', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'welcoming, clear next steps' },
  progress_check: { id: 'progress_check', label: 'Progress Check', purpose: 'Nudge learners who stall.', trigger: 'No progress in 7 days', suggested_delay_hours: 168, category: 'activation', tone_shift: 'encouraging, concrete' },
  completion_reward: { id: 'completion_reward', label: 'Course Completion', purpose: 'Celebrate + ask for review + upsell next step.', trigger: 'On completion', suggested_delay_hours: 0, category: 'retention', tone_shift: 'celebratory' },
  install_welcome: { id: 'install_welcome', label: 'Install Welcome', purpose: 'Guide first-time app user.', trigger: 'On install', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'quick, action-oriented' },
  onboarding_complete: { id: 'onboarding_complete', label: 'Onboarding Complete', purpose: 'Celebrate setup + open next horizon.', trigger: 'Setup complete', suggested_delay_hours: 0, category: 'activation', tone_shift: 'affirming, forward-looking' },
  activation_nudge: { id: 'activation_nudge', label: 'Activation Nudge', purpose: 'Push user to core value if they haven\'t reached it.', trigger: 'Day 3-5 inactive', suggested_delay_hours: 72, category: 'activation', tone_shift: 'helpful' },
  retention_win: { id: 'retention_win', label: 'Retention Win', purpose: 'Celebrate a usage milestone.', trigger: 'On milestone reached', suggested_delay_hours: 0, category: 'retention', tone_shift: 'celebratory, social' },
  churn_save: { id: 'churn_save', label: 'Churn Save', purpose: 'Intercept cancellation with offer or empathy.', trigger: 'On cancel click', suggested_delay_hours: 0, category: 'winback', tone_shift: 'empathetic, offer-led' },
  first_prompt: { id: 'first_prompt', label: 'First Prompt', purpose: 'Nudge first AI interaction.', trigger: 'Signup + 2h no prompt', suggested_delay_hours: 2, category: 'activation', tone_shift: 'playful, curiosity-led' },
  use_case_inspiration: { id: 'use_case_inspiration', label: 'Use Case Inspiration', purpose: 'Show range of use cases to deepen adoption.', trigger: 'Day 3', suggested_delay_hours: 72, category: 'activation', tone_shift: 'inspiring, specific examples' },
  impact_story: { id: 'impact_story', label: 'Impact Story', purpose: 'Show donor impact with specific beneficiary.', trigger: 'Monthly', suggested_delay_hours: 720, category: 'newsletter', tone_shift: 'emotional, specific' },
  monthly_update: { id: 'monthly_update', label: 'Monthly Update', purpose: 'Consistent newsletter with wins + asks.', trigger: 'Monthly', suggested_delay_hours: 720, category: 'newsletter', tone_shift: 'consistent, mission-forward' },
  giving_tuesday: { id: 'giving_tuesday', label: 'Giving Tuesday', purpose: 'Giving Tuesday push.', trigger: 'First Tuesday of December', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'urgent, mission-led' },
  year_end_appeal: { id: 'year_end_appeal', label: 'Year-End Appeal', purpose: 'Tax-deductible year-end push.', trigger: 'Mid-December', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'grateful, impact-led' },
  protocol_updates: { id: 'protocol_updates', label: 'Protocol Updates', purpose: 'Keep holders informed of protocol changes.', trigger: 'On release', suggested_delay_hours: 0, category: 'retention', tone_shift: 'technical, transparent' },
  security_reminder: { id: 'security_reminder', label: 'Security Reminder', purpose: 'Prompt users to verify wallet security practices.', trigger: 'Quarterly', suggested_delay_hours: 0, category: 'retention', tone_shift: 'serious, protective' },
  how_to_use: { id: 'how_to_use', label: 'How To Use', purpose: 'Educate new users on usage.', trigger: 'Day 2-3 post-wallet-connect', suggested_delay_hours: 48, category: 'activation', tone_shift: 'educational, safety-first' },
  welcome_safety: { id: 'welcome_safety', label: 'Welcome + Safety', purpose: 'Welcome new user with safety primer.', trigger: 'On wallet connect', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'welcoming, security-minded' },
  care_plan: { id: 'care_plan', label: 'Care Plan', purpose: 'Share care plan after consultation.', trigger: 'Post-consult', suggested_delay_hours: 0, category: 'retention', tone_shift: 'clinical, clear' },
  follow_up: { id: 'follow_up', label: 'Follow-Up', purpose: 'Check in after visit.', trigger: '7-14 days post-visit', suggested_delay_hours: 168, category: 'retention', tone_shift: 'caring, brief' },
  appointment_confirm: { id: 'appointment_confirm', label: 'Appointment Confirmation', purpose: 'Confirm + prep instructions.', trigger: 'On booking', suggested_delay_hours: 0, category: 'transactional', tone_shift: 'clear, reassuring' },
  post_visit_review_request: { id: 'post_visit_review_request', label: 'Post-Visit Review Ask', purpose: 'Ask for review after positive visit.', trigger: '48h post-visit', suggested_delay_hours: 48, category: 'retention', tone_shift: 'thankful, direct ask' },
  reactivation: { id: 'reactivation', label: 'Reactivation', purpose: 'Bring back lapsed user.', trigger: '60d inactive', suggested_delay_hours: 1440, category: 'winback', tone_shift: 'warm, offer-led' },
  discovery_nurture: { id: 'discovery_nurture', label: 'Discovery Nurture', purpose: 'Warm up enterprise leads post-discovery call.', trigger: 'Post-discovery call', suggested_delay_hours: 0, category: 'activation', tone_shift: 'consultative' },
  proposal_follow: { id: 'proposal_follow', label: 'Proposal Follow-Up', purpose: 'Follow up on sent proposals.', trigger: '3 days after send', suggested_delay_hours: 72, category: 'expansion', tone_shift: 'direct, helpful' },
  client_onboarding: { id: 'client_onboarding', label: 'Client Onboarding', purpose: 'Kick off delivery after contract.', trigger: 'On contract sign', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'professional, action-oriented' },
  case_study_share: { id: 'case_study_share', label: 'Case Study Share', purpose: 'Share relevant case study with lead.', trigger: 'Mid-cycle nurture', suggested_delay_hours: 0, category: 'newsletter', tone_shift: 'consultative' },
  welcome_intro_call: { id: 'welcome_intro_call', label: 'Welcome + Intro Call Invite', purpose: 'Book first intro call with lead.', trigger: 'On lead capture', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'warm, direct ask' },
  welcome_supporter: { id: 'welcome_supporter', label: 'Welcome Supporter', purpose: 'Welcome new donor or volunteer.', trigger: 'On signup', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'grateful, mission-led' },
  welcome_install: { id: 'welcome_install', label: 'Welcome Install', purpose: 'Welcome new app user.', trigger: 'On install', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'energetic, quick' },
  first_match: { id: 'first_match', label: 'First Match', purpose: 'Celebrate first marketplace match.', trigger: 'On first match', suggested_delay_hours: 0, category: 'activation', tone_shift: 'celebratory' },
  transaction_confirm: { id: 'transaction_confirm', label: 'Transaction Confirm', purpose: 'Confirm completed transaction.', trigger: 'On transaction', suggested_delay_hours: 0, category: 'transactional', tone_shift: 'clear, receipt-like' },
  welcome_per_side: { id: 'welcome_per_side', label: 'Welcome Per Side', purpose: 'Side-specific welcome for two-sided marketplace.', trigger: 'On signup', suggested_delay_hours: 0, category: 'onboarding', tone_shift: 'role-specific' },
  enrollment_close: { id: 'enrollment_close', label: 'Enrollment Close', purpose: 'Final push before enrollment window closes.', trigger: '24h before close', suggested_delay_hours: 0, category: 'expansion', tone_shift: 'urgent' },
}

const EmailSchema = z.object({
  stage_id: z.string(),
  subject_a: z.string().max(60),
  subject_b: z.string().max(60),
  preview_text: z.string().max(90),
  body_plain_text: z.string().describe('Plain text version, 80-200 words'),
  body_html: z.string().describe('Simple HTML body with inline styles, single-column'),
  cta_text: z.string(),
  cta_url: z.string().describe('Use relative path or {{placeholder}}'),
  personalization: z.array(z.string()),
  send_rules: z.object({
    trigger: z.string(),
    delay_hours: z.number(),
    skip_if: z.string(),
    send_time_tip: z.string(),
  }),
})

const LifecycleResultSchema = z.object({
  vertical: z.string(),
  emails: z.array(EmailSchema),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, persist } = await request.json()
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('name, description, website, brand_voice').eq('id', projectId).single()
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const bv = (project.brand_voice as Record<string, unknown>) ?? {}
  const vertical = (bv.classification as { vertical?: Vertical } | undefined)?.vertical
  const pb = getPlaybook(vertical)

  // Build the stage list for this vertical (with fallback to the generic set)
  const stageIds = pb.lifecycle_emails.length > 0 ? pb.lifecycle_emails : ['welcome', 'activation_nudge', 'feature_walkthrough', 'retention_nudge', 'winback_30d']
  const stages = stageIds.map((id) => LIFECYCLE_STAGES[id]).filter(Boolean)

  const baseCtx = `PRODUCT: ${project.name}
VERTICAL: ${vertical ?? 'unknown'}
VALUE PROP: ${bv.value_proposition ?? project.description ?? ''}
AUDIENCE: ${bv.target_audience ?? ''}
FEATURES: ${Array.isArray(bv.key_features) ? (bv.key_features as string[]).join(' · ') : ''}
TONE: ${bv.tone_of_voice ?? 'professional'}
WEBSITE: ${project.website ?? ''}`

  const stagesSpec = stages.map((s) => `
- id: ${s.id}
  label: ${s.label}
  purpose: ${s.purpose}
  trigger: ${s.trigger}
  suggested_delay_hours: ${s.suggested_delay_hours}
  tone_shift: ${s.tone_shift}
`).join('')

  const startedAt = Date.now()
  const res = await generateObject({
    model: modelFor('strategic'),
    schema: LifecycleResultSchema,
    system: `You write complete email lifecycle flows for products. Produce ALL emails as a coordinated set — consistent voice, compounding narrative. Each email must respect its tone_shift. Subjects feel personal, not clickbait. Bodies are 80-200 words, conversational. HTML = simple single-column. Include a no-reply-safe CTA url placeholder. Never repeat exact phrasing across emails.`,
    messages: [{ role: 'user', content: `${baseCtx}\n\nProduce one email per stage below, in this order:\n${stagesSpec}\n\nReturn all emails in the array with matching stage_id.` }],
  })

  // Persist as email templates if requested
  const saved: string[] = []
  if (persist) {
    // Remove any prior lifecycle templates flagged by our runs (optional — keep soft)
    for (const e of res.object.emails) {
      const stage = LIFECYCLE_STAGES[e.stage_id]
      const { data: tmpl } = await supabase.from('email_templates').insert({
        user_id: user.id, project_id: projectId,
        name: `${stage?.label ?? e.stage_id} — ${e.subject_a.slice(0, 40)}`,
        subject: e.subject_a,
        body_html: e.body_html,
        category: stage?.category ?? 'lifecycle',
        metadata: {
          lifecycle_stage: e.stage_id,
          preview_text: e.preview_text,
          subject_b: e.subject_b,
          cta: { text: e.cta_text, url: e.cta_url },
          send_rules: e.send_rules,
          personalization: e.personalization,
          body_plain_text: e.body_plain_text,
        },
      }).select('id').single()
      if (tmpl) saved.push(tmpl.id)
    }
  }

  await trackAICost({ userId: user.id, projectId, module: 'lifecycle_emails', costUsd: 0.12, latencyMs: Date.now() - startedAt })

  return Response.json({
    vertical,
    stages_planned: stages.map((s) => ({ id: s.id, label: s.label, category: s.category, trigger: s.trigger })),
    emails: res.object.emails,
    saved_template_ids: saved,
  })
}
