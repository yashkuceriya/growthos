import { describe, expect, it } from 'vitest'
import { buildLaunchPlan, isLaunchChannel, LAUNCH_CHANNELS } from './plan'
import type { MarketingMemory } from '@/lib/marketing/memory'

function makeMemory(overrides: Partial<MarketingMemory> = {}): MarketingMemory {
  const defaults: MarketingMemory = {
    project: { id: 'p', name: 'Acme', website: null, description: null },
    brand: {
      tagline: null, valueProp: null, audience: null, tone: null,
      features: [], differentiators: [], pricing: null,
      primaryColor: null, heroImageUrl: null, capturedScreenshotUrl: null,
      designTokens: null,
    },
    classification: {
      vertical: null, verticalConfidence: null, businessModel: null,
      targetMarket: null, stage: null, primaryGoal: null, pricingTier: null,
      icp: null, competitors: [], complianceFlags: [],
    },
    blueprint: {
      vertical: 'other',
      confidence: null, icp: null, primaryGoal: null,
      primaryKpi: 'leads → trial → paid',
      primaryChannels: ['blog', 'email', 'landing'] as never,
      secondaryChannels: [],
      launchTactics: ['Product Hunt launch'],
      croFocus: [],
      lifecycleEmails: ['welcome'],
      contentMix: [{ label: 'Educational', pct: 50 }, { label: 'Promotional', pct: 25 }, { label: 'Social proof', pct: 25 }],
      readiness: [],
    },
    launchInsights: { lastUpdated: null, lastCampaignId: null, current: null, recentHistory: [] },
    adInsights: [],
    founderVoice: { samples: [], styleNotes: null },
    styleReferences: [],
    assetKind: null,
    channel: null,
  }
  return { ...defaults, ...overrides }
}

describe('isLaunchChannel', () => {
  it('matches the 8 implemented channels', () => {
    for (const ch of LAUNCH_CHANNELS) expect(isLaunchChannel(ch)).toBe(true)
  })

  it('rejects unknown channels', () => {
    expect(isLaunchChannel('google_search')).toBe(false)
    expect(isLaunchChannel('nonsense')).toBe(false)
    expect(isLaunchChannel(null)).toBe(false)
  })
})

describe('buildLaunchPlan', () => {
  it('marks fallback for unclassified products', () => {
    const plan = buildLaunchPlan({ memory: makeMemory() })
    expect(plan.source).toBe('fallback')
    expect(plan.vertical).toBe('other')
    expect(plan.defaultChannels.length).toBeGreaterThan(0)
    expect(plan.suggestedAngles.length).toBeGreaterThan(0)
  })

  it('uses the b2b_saas playbook when classification says so', () => {
    const plan = buildLaunchPlan({
      memory: makeMemory({
        blueprint: {
          vertical: 'b2b_saas',
          confidence: 0.9, icp: 'CTOs at small SaaS', primaryGoal: 'signups',
          primaryKpi: 'MQLs → SQLs → pipeline',
          primaryChannels: ['linkedin', 'email', 'blog', 'landing'] as never,
          secondaryChannels: ['twitter'] as never,
          launchTactics: ['Product Hunt launch', 'LinkedIn thought leadership posts'],
          croFocus: ['case_studies'], lifecycleEmails: ['welcome', 'trial_activation'],
          contentMix: [{ label: 'Educational', pct: 60 }, { label: 'Promotional', pct: 20 }, { label: 'Social proof', pct: 20 }],
          readiness: [],
        },
        classification: {
          vertical: 'b2b_saas', verticalConfidence: 0.9, businessModel: 'subscription',
          targetMarket: 'smb', stage: 'launched', primaryGoal: 'signups',
          pricingTier: 'mid_ticket_50_500', icp: 'CTOs at small SaaS', competitors: [],
          complianceFlags: ['gdpr'],
        },
      }),
    })

    expect(plan.source).toBe('classification')
    expect(plan.vertical).toBe('b2b_saas')

    const linkedin = plan.channels.find((c) => c.channel === 'linkedin')
    expect(linkedin?.tier).toBe('primary')
    expect(linkedin?.defaultOn).toBe(true)

    const tiktok = plan.channels.find((c) => c.channel === 'tiktok')
    // TikTok is not in b2b_saas primary or secondary lists → off by default.
    expect(tiktok?.tier).toBe('off')
    expect(tiktok?.defaultOn).toBe(false)

    expect(plan.defaultChannels).toContain('linkedin')
    expect(plan.defaultChannels).not.toContain('tiktok')
  })

  it('maps classifier primary_goal to a campaign goal string', () => {
    const awareness = buildLaunchPlan({
      memory: makeMemory({
        classification: makeMemory().classification && { ...makeMemory().classification, primaryGoal: 'awareness' },
      }),
    })
    expect(awareness.defaultGoal).toBe('awareness')

    const signups = buildLaunchPlan({
      memory: makeMemory({
        classification: { ...makeMemory().classification, primaryGoal: 'signups' },
      }),
    })
    expect(signups.defaultGoal).toBe('conversion')

    const engagement = buildLaunchPlan({
      memory: makeMemory({
        classification: { ...makeMemory().classification, primaryGoal: 'engagement' },
      }),
    })
    expect(engagement.defaultGoal).toBe('engagement')
  })

  it('prefers angles from launch insights when present', () => {
    const plan = buildLaunchPlan({
      memory: makeMemory({
        launchInsights: {
          lastUpdated: null, lastCampaignId: null,
          current: {
            winning_hooks: [
              'Lead with stat shock: 78% of teams ship slower with X',
              'Contrast vs incumbents on price + setup time',
              'Founder-letter angle: built it for myself',
            ],
            next_experiments: ['Try a customer-story carousel'],
          },
          recentHistory: [],
        },
      }),
    })
    expect(plan.suggestedAngles[0]).toMatch(/stat shock/i)
    expect(plan.suggestedAngles.length).toBeGreaterThanOrEqual(3)
    expect(plan.defaultAngle).toBe(plan.suggestedAngles[0])
  })

  it('falls back to blueprint-derived angles when no insights exist', () => {
    const plan = buildLaunchPlan({
      memory: makeMemory({
        project: { id: 'p', name: 'Bookmarker', website: null, description: null },
        brand: {
          tagline: null, valueProp: 'Save and recall everything', audience: 'knowledge workers',
          tone: null, features: [], differentiators: ['AI built-in'], pricing: null,
          primaryColor: null, heroImageUrl: null, capturedScreenshotUrl: null, designTokens: null,
        },
      }),
    })
    expect(plan.suggestedAngles.some((a) => a.includes('Save and recall everything'))).toBe(true)
    expect(plan.suggestedAngles.some((a) => a.includes('AI built-in'))).toBe(true)
    expect(plan.defaultAngle).not.toBeNull()
  })
})
