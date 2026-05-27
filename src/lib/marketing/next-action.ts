// Next Best Action — pure decision function.
//
// Given a snapshot of project + campaign + asset + metric state, returns
// the single highest-leverage action the operator should take next.
// Deterministic, dependency-free, and test-pinned so the dashboard's
// guidance behavior never drifts silently.
//
// The order is deliberate: missing-ingredient items dominate, then
// momentum items (campaign rolling forward), then learning items.
import type { MarketingBlueprint } from '@/lib/marketing/blueprint'

export type ActionPriority = 'high' | 'medium' | 'low'

export interface NextBestAction {
  id: string
  priority: ActionPriority
  title: string
  reason: string
  ctaLabel: string
  href: string
}

export interface NextActionSnapshot {
  // Project core
  hasProject: boolean
  projectWebsite: string | null
  blueprint?: MarketingBlueprint | null

  // Campaign + assets
  campaignCount: number
  latestCampaignId: string | null
  latestCampaignAssetCount: number
  // Number of ad copies needing operator review (status='evaluator_pass' but
  // not yet promoted or rejected).
  adsNeedingReview: number
  socialPostsDraft: number
  socialPostsScheduled: number
  // Whether at least one published asset has at least one engagement metric
  // synced. Tells us whether we're in the "operate" or "measure" phase.
  hasMeasurements: boolean
  hasManualMetrics: boolean

  // Learning
  hasInsights: boolean
  hasWinners: boolean

  // Budget / cost
  budgetExceeded: boolean
}

// Reasoned defaults so a caller that hasn't loaded a slice yet doesn't
// accidentally trigger the "missing X" path.
const EMPTY_SNAPSHOT: NextActionSnapshot = {
  hasProject: false,
  projectWebsite: null,
  blueprint: null,
  campaignCount: 0,
  latestCampaignId: null,
  latestCampaignAssetCount: 0,
  adsNeedingReview: 0,
  socialPostsDraft: 0,
  socialPostsScheduled: 0,
  hasMeasurements: false,
  hasManualMetrics: false,
  hasInsights: false,
  hasWinners: false,
  budgetExceeded: false,
}

export function nextBestAction(input: Partial<NextActionSnapshot>): NextBestAction {
  const s: NextActionSnapshot = { ...EMPTY_SNAPSHOT, ...input }

  // Highest priority: budget cap stops everything else.
  if (s.budgetExceeded) {
    return {
      id: 'raise_budget',
      priority: 'high',
      title: 'Monthly AI budget exceeded',
      reason: 'Generation routes are paused until the budget is raised or the new month starts.',
      ctaLabel: 'Open Budget',
      href: '/budget',
    }
  }

  // No project yet → create one.
  if (!s.hasProject) {
    return {
      id: 'create_project',
      priority: 'high',
      title: 'Create your first project',
      reason: 'GrowthOS scopes every asset, campaign, and metric to a project (one per product you market).',
      ctaLabel: 'Add project',
      href: '/projects',
    }
  }

  // Project but no synced site → sync it. Memory + blueprint + ads all
  // depend on the brand info that ingest extracts.
  const blueprintReady = !!s.blueprint && s.blueprint.vertical !== 'other'
  if (!s.projectWebsite || !blueprintReady) {
    return {
      id: 'sync_site',
      priority: 'high',
      title: 'Sync your project website',
      reason: 'Ingest extracts brand, ICP, design tokens, and the marketing blueprint that every generator uses.',
      ctaLabel: 'Sync site',
      href: '/projects',
    }
  }

  // Blueprint ready, no campaigns → run first launch.
  if (s.campaignCount === 0) {
    return {
      id: 'first_launch',
      priority: 'high',
      title: 'Run your first launch',
      reason: 'You have a blueprint. Generate a multi-channel campaign in one click and start the feedback loop.',
      ctaLabel: 'Launch campaign',
      href: '/launch',
    }
  }

  // Campaign exists but no assets attached → re-launch into the campaign.
  if (s.latestCampaignAssetCount === 0 && s.latestCampaignId) {
    return {
      id: 'attach_assets',
      priority: 'high',
      title: 'No assets attached to your latest campaign',
      reason: 'Re-launch into the existing campaign so ads, social, content, and landing pages stay grouped.',
      ctaLabel: 'Re-launch',
      href: `/launch?campaignId=${s.latestCampaignId}`,
    }
  }

  // Generated ads waiting for review.
  if (s.adsNeedingReview > 0) {
    return {
      id: 'review_ads',
      priority: 'medium',
      title: `Review ${s.adsNeedingReview} generated ad${s.adsNeedingReview === 1 ? '' : 's'}`,
      reason: 'Pick the strongest variant so winners feed back into your style memory for future generations.',
      ctaLabel: 'Open Ad Studio',
      href: '/ad-studio',
    }
  }

  // Drafted social posts that aren't scheduled or published.
  if (s.socialPostsDraft > 0) {
    return {
      id: 'schedule_social',
      priority: 'medium',
      title: `Schedule ${s.socialPostsDraft} draft social post${s.socialPostsDraft === 1 ? '' : 's'}`,
      reason: 'Drafts sitting in the queue are not earning impressions. Schedule or export them to your platform.',
      ctaLabel: 'Open Social',
      href: '/social',
    }
  }

  // Posts published but no engagement synced and no manual metrics. Time
  // to measure.
  if (!s.hasMeasurements && !s.hasManualMetrics) {
    return {
      id: 'log_metrics',
      priority: 'medium',
      title: 'Log results for your latest campaign',
      reason: 'No engagement or manual metrics yet. Logging spend, clicks, and conversions turns on the learning loop.',
      ctaLabel: 'Log metrics',
      href: s.latestCampaignId ? `/campaigns/${s.latestCampaignId}` : '/campaigns',
    }
  }

  // Insights exist but no winners promoted yet → promote a winner.
  if (s.hasInsights && !s.hasWinners) {
    return {
      id: 'promote_winner',
      priority: 'low',
      title: 'Promote a winning asset',
      reason: 'Winners feed into the proven-style memory so the next generation copies what worked.',
      ctaLabel: 'Open Social',
      href: '/social',
    }
  }

  // Everything's healthy → suggest the next experiment.
  return {
    id: 'next_experiment',
    priority: 'low',
    title: 'Run the next experiment',
    reason: 'Campaign is operating and you have learnings. Try a new angle from your blueprint to keep improving.',
    ctaLabel: 'Plan next launch',
    href: '/launch',
  }
}
