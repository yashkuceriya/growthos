// Launch planner — pure, no I/O. Given a project + memory bundle, returns
// the recommended channel mix, KPI, content mix, angles, and defaults the
// `/launch` UI presents before the operator commits AI budget. Keeping this
// pure means it's easy to unit-test and the same logic powers both the GET
// preview endpoint and the POST run validator.
import { getPlaybook, type Channel as PlaybookChannel } from '@/lib/ai/playbooks/registry'
import type { MarketingMemory } from '@/lib/marketing/memory'

// The 8 channels the orchestrator actually implements today. The playbook
// registry knows about many more (google_search, product_hunt, etc.) but
// the launch route can only generate assets for these. We map and intersect.
export const LAUNCH_CHANNELS = ['meta', 'linkedin', 'tiktok', 'twitter', 'reddit', 'email', 'blog', 'landing'] as const
export type LaunchChannel = typeof LAUNCH_CHANNELS[number]

export function isLaunchChannel(value: unknown): value is LaunchChannel {
  return typeof value === 'string' && (LAUNCH_CHANNELS as readonly string[]).includes(value)
}

export interface LaunchChannelRecommendation {
  channel: LaunchChannel
  tier: 'primary' | 'secondary' | 'off'
  // Short human rationale for the operator: why is this channel in/out for
  // this product? Shown directly in the launch preview card.
  reason: string
  // Default-selected. Primary always on; secondary on; off off.
  defaultOn: boolean
}

export interface LaunchPlan {
  vertical: string
  icp: string | null
  primaryGoal: string | null
  primaryKpi: string
  secondaryKpis: string[]
  channels: LaunchChannelRecommendation[]
  defaultChannels: LaunchChannel[]
  contentMix: Array<{ label: string; pct: number }>
  launchTactics: string[]
  croFocus: string[]
  lifecycleEmails: string[]
  readiness: Array<{ label: string; ready: boolean; hint: string }>
  // 3-4 angle starters. Pulled from launch insights if available, otherwise
  // generated from the product's value prop + tactics. Operator can replace.
  suggestedAngles: string[]
  defaultGoal: string
  defaultAngle: string | null
  // Whether the plan came from a real classification or fell back to the
  // generic playbook. UI uses this to nudge the operator to sync the site.
  source: 'classification' | 'fallback'
}

export interface BuildLaunchPlanArgs {
  memory: MarketingMemory
}

export function buildLaunchPlan({ memory }: BuildLaunchPlanArgs): LaunchPlan {
  const vertical = memory.blueprint.vertical
  const playbook = getPlaybook(vertical)

  const primarySet = new Set<PlaybookChannel>(playbook.primary_channels)
  const secondarySet = new Set<PlaybookChannel>(playbook.secondary_channels)

  const channels: LaunchChannelRecommendation[] = LAUNCH_CHANNELS.map((ch) => {
    const pbCh = ch as PlaybookChannel
    if (primarySet.has(pbCh)) {
      return {
        channel: ch,
        tier: 'primary',
        reason: channelReason(ch, 'primary', vertical),
        defaultOn: true,
      }
    }
    if (secondarySet.has(pbCh)) {
      return {
        channel: ch,
        tier: 'secondary',
        reason: channelReason(ch, 'secondary', vertical),
        defaultOn: true,
      }
    }
    return {
      channel: ch,
      tier: 'off',
      reason: channelReason(ch, 'off', vertical),
      defaultOn: false,
    }
  })

  const defaultChannels = channels.filter((c) => c.defaultOn).map((c) => c.channel)

  const suggestedAngles = angleSuggestions(memory)
  const defaultGoal = mapPrimaryGoalToGoalString(memory.classification.primaryGoal)
  const defaultAngle = suggestedAngles[0] ?? null

  return {
    vertical,
    icp: memory.classification.icp,
    primaryGoal: memory.classification.primaryGoal,
    primaryKpi: playbook.kpis.primary,
    secondaryKpis: playbook.kpis.secondary,
    channels,
    defaultChannels,
    contentMix: memory.blueprint.contentMix,
    launchTactics: memory.blueprint.launchTactics,
    croFocus: memory.blueprint.croFocus,
    lifecycleEmails: memory.blueprint.lifecycleEmails,
    readiness: memory.blueprint.readiness,
    suggestedAngles,
    defaultGoal,
    defaultAngle,
    source: vertical === 'other' ? 'fallback' : 'classification',
  }
}

// Pulls 3-4 narrative-angle starters out of memory. Prefers angles distilled
// by past launches (insights.current.winning_hooks). Falls back to value-prop
// derivatives so a brand-new project still gets options instead of an empty
// state.
function angleSuggestions(memory: MarketingMemory): string[] {
  const current = memory.launchInsights.current
  const fromInsights = currentInsightAngles(current)
  if (fromInsights.length >= 3) return fromInsights.slice(0, 4)

  const fromBlueprint = blueprintAngles(memory)
  const merged = unique([...fromInsights, ...fromBlueprint])
  return merged.slice(0, 4)
}

function currentInsightAngles(current: unknown): string[] {
  if (!current || typeof current !== 'object') return []
  const c = current as Record<string, unknown>
  const winning: unknown[] = Array.isArray(c.winning_hooks) ? c.winning_hooks : []
  const themesRaw = c.recommended_themes ?? c.next_experiments
  const themes: unknown[] = Array.isArray(themesRaw) ? themesRaw : []
  return [...winning, ...themes]
    .filter((s): s is string => typeof s === 'string' && s.length > 6)
    .map((s) => s.trim())
}

function blueprintAngles(memory: MarketingMemory): string[] {
  const tactics = memory.blueprint.launchTactics
  const product = memory.project.name || 'this product'
  const audience = memory.brand.audience ?? memory.classification.icp ?? 'your audience'
  const angles: string[] = []
  if (memory.brand.valueProp) angles.push(`Lead with the core promise: ${memory.brand.valueProp}`)
  if (memory.brand.differentiators[0]) angles.push(`Contrast against the alternative: ${memory.brand.differentiators[0]}`)
  if (tactics[0]) angles.push(`Anchor the campaign on ${tactics[0]}`)
  angles.push(`Speak directly to ${audience} about why ${product} is built for them`)
  return angles
}

function channelReason(channel: LaunchChannel, tier: 'primary' | 'secondary' | 'off', vertical: string): string {
  const verticalLabel = vertical === 'other' ? 'this product type' : vertical.replace(/_/g, ' ')
  if (tier === 'primary') return `Recommended for ${verticalLabel}: the playbook puts ${channelLabel(channel)} in the top channel mix.`
  if (tier === 'secondary') return `Secondary fit for ${verticalLabel}: useful as a multiplier, lower expected ROI than primary channels.`
  return `Outside the recommended playbook for ${verticalLabel}. Enable manually if you have a specific reason.`
}

function channelLabel(channel: LaunchChannel): string {
  switch (channel) {
    case 'meta': return 'Meta (Facebook + Instagram)'
    case 'linkedin': return 'LinkedIn'
    case 'tiktok': return 'TikTok'
    case 'twitter': return 'Twitter / X'
    case 'reddit': return 'Reddit'
    case 'email': return 'email lifecycle'
    case 'blog': return 'long-form blog / SEO'
    case 'landing': return 'landing page'
  }
}

// Maps the classifier's primary_goal (awareness | signups | revenue | etc.)
// to the `campaign_goal` string the generators expect (awareness | conversion
// | engagement). Mirrors normalizeGoal in /api/ai/generate-ad.
function mapPrimaryGoalToGoalString(primaryGoal: string | null): string {
  if (!primaryGoal) return 'conversion'
  const g = primaryGoal.toLowerCase()
  if (g.includes('aware')) return 'awareness'
  if (g.includes('engage')) return 'engagement'
  return 'conversion'
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
