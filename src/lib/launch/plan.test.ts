import { describe, expect, it } from 'vitest'
import { buildLaunchExecutionBrief, buildLaunchExecutionChecklist, buildLaunchPlan, isLaunchChannel, LAUNCH_CHANNELS } from './plan'
import type { MarketingMemory } from '@/lib/marketing/memory'
import type { MarketingPersona } from '@/lib/marketing/personas'

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
    performance: [],
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
    expect(plan.strategy.summary).toContain('fallback playbook')
    expect(plan.experiments).toHaveLength(3)
    expect(plan.answerEngine.assets).toContain('FAQ block answering buyer objections')
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

  it('adjusts channel defaults around persona preferred channels', () => {
    const persona: MarketingPersona = {
      id: 'persona-growth',
      projectId: 'p',
      name: 'Growth Marketer',
      role: 'Marketer',
      description: null,
      painPoints: [],
      objections: [],
      buyingTriggers: [],
      desiredOutcomes: [],
      vocabulary: [],
      preferredChannels: ['meta', 'email', 'blog'],
      skepticismLevel: 'medium',
      isPrimary: false,
    }

    const plan = buildLaunchPlan({
      memory: makeMemory({
        blueprint: {
          ...makeMemory().blueprint,
          vertical: 'b2b_saas',
        },
      }),
      persona,
    })

    const meta = plan.channels.find((c) => c.channel === 'meta')
    const linkedin = plan.channels.find((c) => c.channel === 'linkedin')
    expect(meta?.tier).toBe('secondary')
    expect(meta?.defaultOn).toBe(true)
    expect(meta?.reason).toMatch(/preferred persona channel/i)
    expect(linkedin?.tier).toBe('secondary')
    expect(plan.defaultChannels).toContain('meta')
  })

  it('uses persona learning evidence to promote and demote channels', () => {
    const persona: MarketingPersona = {
      id: 'persona-founder',
      projectId: 'p',
      name: 'Founder Operator',
      role: 'Founder',
      description: null,
      painPoints: [],
      objections: [],
      buyingTriggers: [],
      desiredOutcomes: [],
      vocabulary: ['launch', 'ship'],
      preferredChannels: ['linkedin'],
      skepticismLevel: 'high',
      isPrimary: true,
    }

    const plan = buildLaunchPlan({
      memory: makeMemory({
        blueprint: {
          ...makeMemory().blueprint,
          vertical: 'b2b_saas',
        },
      }),
      persona,
      personaLearning: {
        personaId: 'persona-founder',
        personaName: 'Founder Operator',
        campaignId: 'camp_1',
        updatedAt: '2026-06-14T01:00:00.000Z',
        insightSignal: 'Direct proof-led email got replies.',
        bestChannel: 'email',
        worstChannel: 'linkedin',
        manualTaskCount: 2,
        recommendedNext: ['Repeat email with a sharper proof point'],
        historyCount: 2,
      },
    })

    const email = plan.channels.find((c) => c.channel === 'email')
    const linkedin = plan.channels.find((c) => c.channel === 'linkedin')
    expect(email?.tier).toBe('primary')
    expect(email?.reason).toMatch(/persona-specific evidence/i)
    expect(linkedin?.tier).toBe('secondary')
    expect(linkedin?.reason).toMatch(/underperformed/i)
    expect(plan.suggestedAngles[0]).toBe('Repeat email with a sharper proof point')
    expect(plan.strategy.summary).toMatch(/Recent persona evidence/i)
    expect(plan.strategy.learningObjective).toContain('Repeat email')
    expect(plan.experiments[1].channels).toEqual(['email'])
  })

  it('sets engagement as the default goal for experiment-oriented personas', () => {
    const persona: MarketingPersona = {
      id: 'persona-growth',
      projectId: 'p',
      name: 'Growth Marketer',
      role: 'Performance Marketer',
      description: null,
      painPoints: [],
      objections: [],
      buyingTriggers: [],
      desiredOutcomes: [],
      vocabulary: ['experiment', 'creative', 'variant'],
      preferredChannels: ['meta', 'email', 'blog'],
      skepticismLevel: 'medium',
      isPrimary: false,
    }

    const plan = buildLaunchPlan({ memory: makeMemory(), persona })

    expect(plan.defaultGoal).toBe('engagement')
    expect(plan.strategy.goalRationale).toMatch(/creative learning/i)
    expect(plan.experiments[1].name).toBe('Channel fit test')
  })

  it('recommends answer-engine assets when owned channels are on', () => {
    const plan = buildLaunchPlan({
      memory: makeMemory({
        project: { id: 'p', name: 'GrowthOS', website: null, description: null },
        brand: {
          ...makeMemory().brand,
          valueProp: 'launch internal apps faster',
          audience: 'solo founders',
        },
      }),
    })

    expect(plan.answerEngine.recommended).toBe(true)
    expect(plan.answerEngine.queries.some((query) => query.includes('GrowthOS'))).toBe(true)
    expect(plan.strategy.learningObjective).toMatch(/answer-engine/i)
  })

  it('builds a local execution brief from selected plan choices', () => {
    const plan = buildLaunchPlan({
      memory: makeMemory({
        project: { id: 'p', name: 'GrowthOS', website: null, description: null },
        brand: {
          ...makeMemory().brand,
          valueProp: 'ship campaigns faster',
          audience: 'solo founders',
        },
      }),
    })

    const brief = buildLaunchExecutionBrief({
      plan,
      selectedChannels: ['blog', 'landing'],
      projectName: 'GrowthOS',
      personaName: 'Founder Operator',
      goal: 'conversion',
      angle: 'Ship the next campaign without losing the thread',
    })

    expect(brief).toContain('# Launch brief: GrowthOS')
    expect(brief).toContain('- Persona: Founder Operator')
    expect(brief).toContain('- Goal: conversion')
    expect(brief).toContain('long-form blog / SEO')
    expect(brief).toContain('landing page')
    expect(brief).toContain('- long-form blog / SEO (')
    expect(brief).toContain('- landing page (')
    expect(brief).toContain('## Manual checklist')
    expect(brief).toContain('- [ ] Ship long-form blog / SEO asset')
    expect(brief).toContain('## Next 48 hours')
  })

  it('includes prior campaign learning in the local execution brief', () => {
    const plan = buildLaunchPlan({ memory: makeMemory() })

    const brief = buildLaunchExecutionBrief({
      plan,
      priorLearning: {
        bestChannel: { channel: 'email', reason: 'highest replies' },
        worstChannel: { channel: 'tiktok', reason: 'low-fit audience' },
        strongestHook: 'Launch faster without hiring an agency',
        decisionLoop: {
          doNow: ['Reuse the email hook'],
          stopDoing: ['Avoid broad founder productivity claims'],
          testNext: ['Try a comparison landing page'],
        },
      },
    })

    expect(brief).toContain('## Prior campaign learning')
    expect(brief).toContain('Keep: email: highest replies')
    expect(brief).toContain('Avoid: tiktok: low-fit audience')
    expect(brief).toContain('Strongest hook: Launch faster without hiring an agency')
    expect(brief).toContain('Test next: Try a comparison landing page')
  })

  it('builds manual execution tasks and metrics for selected channels', () => {
    const plan = buildLaunchPlan({ memory: makeMemory() })

    const checklist = buildLaunchExecutionChecklist({
      plan,
      selectedChannels: ['email', 'landing'],
      goal: 'conversion',
      angle: 'Turn launch chaos into one operating loop',
    })

    expect(checklist[0]?.id).toBe('strategy-angle')
    expect(checklist[0]?.detail).toContain('Turn launch chaos into one operating loop')
    expect(checklist.some((task) => task.id === 'channel-email' && task.metric.includes('Open rate'))).toBe(true)
    expect(checklist.some((task) => task.id === 'channel-landing' && task.metric.includes('conversion rate'))).toBe(true)
    expect(checklist.some((task) => task.id === 'measurement-log')).toBe(true)
    expect(checklist.some((task) => task.id === 'channel-meta')).toBe(false)
  })
})
