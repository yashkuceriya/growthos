import { getPlaybook, type Channel } from '@/lib/ai/playbooks/registry'
import type { Classification, Vertical } from '@/lib/ai/intelligence/classifier'

export interface BlueprintProject {
  name: string
  website: string | null
  brand_voice: unknown
}

export interface MarketingBlueprint {
  vertical: Vertical
  confidence: number | null
  icp: string | null
  primaryGoal: string | null
  primaryKpi: string
  primaryChannels: Channel[]
  secondaryChannels: Channel[]
  launchTactics: string[]
  croFocus: string[]
  lifecycleEmails: string[]
  contentMix: Array<{ label: string; pct: number }>
  readiness: Array<{ label: string; ready: boolean; hint: string }>
}

export function buildMarketingBlueprint(project: BlueprintProject): MarketingBlueprint {
  const brandVoice = asRecord(project.brand_voice)
  const classification = asRecord(brandVoice.classification) as Partial<Classification>
  const vertical = isVertical(classification.vertical) ? classification.vertical : 'other'
  const playbook = getPlaybook(vertical)

  return {
    vertical,
    confidence: typeof classification.vertical_confidence === 'number' ? classification.vertical_confidence : null,
    icp: typeof classification.ideal_customer_profile === 'string' ? classification.ideal_customer_profile : null,
    primaryGoal: typeof classification.primary_goal === 'string' ? classification.primary_goal : null,
    primaryKpi: playbook.kpis.primary,
    primaryChannels: playbook.primary_channels.slice(0, 6),
    secondaryChannels: playbook.secondary_channels.slice(0, 5),
    launchTactics: playbook.launch_tactics.slice(0, 4),
    croFocus: playbook.cro_focus.slice(0, 5),
    lifecycleEmails: playbook.lifecycle_emails.slice(0, 5),
    contentMix: [
      { label: 'Educational', pct: Math.round(playbook.content_ratios.educational * 100) },
      { label: 'Promotional', pct: Math.round(playbook.content_ratios.promotional * 100) },
      { label: 'Social proof', pct: Math.round(playbook.content_ratios.social_proof * 100) },
    ],
    readiness: [
      {
        label: 'Website synced',
        ready: !!project.website && Object.keys(brandVoice).length > 2,
        hint: 'Run Sync Site so copy, channels, and creatives are grounded in the real app.',
      },
      {
        label: 'ICP classified',
        ready: !!classification.ideal_customer_profile,
        hint: 'Classification tells GrowthOS which channels and conversion strategy to prioritize.',
      },
      {
        label: 'Design captured',
        ready: !!brandVoice.captured_screenshot || !!brandVoice.design_tokens,
        hint: 'Screenshots and design tokens keep generated creatives visually close to the product.',
      },
      {
        label: 'Launch ready',
        ready: !!classification.primary_goal && playbook.primary_channels.length > 0,
        hint: 'Once the blueprint is populated, run Launch to generate the first campaign bundle.',
      },
    ],
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function isVertical(value: unknown): value is Vertical {
  return typeof value === 'string' && [
    'b2b_saas', 'b2c_saas', 'ecommerce', 'marketplace', 'mobile_app',
    'dev_tool', 'creator_info', 'local_business', 'services', 'ai_product',
    'healthcare', 'fintech', 'edu', 'nonprofit', 'crypto', 'other',
  ].includes(value)
}
