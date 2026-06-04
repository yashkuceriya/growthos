import { describe, expect, it } from 'vitest'
import { scoreGeneratedAsset } from './quality'
import type { MarketingMemory } from './memory'
import type { MarketingPersona } from './personas'

const memory = {
  project: { id: 'p1', name: 'GrowthOS', website: null, description: null },
  brand: {
    tagline: null,
    valueProp: 'launch apps faster',
    audience: 'indie app founders',
    tone: 'direct',
    features: ['campaign command center', 'lead tracking'],
    differentiators: ['learns from campaign results'],
    pricing: null,
    primaryColor: null,
    heroImageUrl: null,
    capturedScreenshotUrl: null,
    designTokens: null,
  },
  classification: {
    vertical: 'b2b_saas',
    verticalConfidence: 0.9,
    businessModel: 'subscription',
    targetMarket: 'founders',
    stage: 'launched',
    primaryGoal: 'signups',
    pricingTier: null,
    icp: 'solo founders marketing several apps',
    competitors: [],
    complianceFlags: [],
  },
  blueprint: {},
  launchInsights: { lastUpdated: null, lastCampaignId: null, current: null, recentHistory: [] },
  adInsights: [],
  performance: [],
  founderVoice: { samples: [], styleNotes: null },
  styleReferences: [],
  assetKind: null,
  channel: null,
} as unknown as MarketingMemory

describe('scoreGeneratedAsset', () => {
  it('rewards concrete audience-specific social output', () => {
    const score = scoreGeneratedAsset('social_post', {
      body: 'Solo founders: run your next app launch from one campaign command center. Track leads, ads, and learnings in 10 minutes. Start today.',
      hashtags: ['indiehackers'],
      cta: 'Start today',
    }, memory)

    expect(score.overall).toBeGreaterThanOrEqual(7.5)
    expect(score.recommendations.length).toBeLessThanOrEqual(1)
  })

  it('flags vague output with no audience or action', () => {
    const score = scoreGeneratedAsset('social_post', {
      body: 'Our innovative platform is a powerful game-changing solution for everyone.',
      hashtags: [],
    }, memory)

    expect(score.overall).toBeLessThan(7)
    expect(score.recommendations.join(' ')).toContain('Audience fit')
    expect(score.recommendations.join(' ')).toContain('Conversion intent')
  })

  it('checks email subject and preview fit', () => {
    const score = scoreGeneratedAsset('email', {
      subject: 'Launch your next app sprint from one command center',
      previewText: 'Plan assets, leads, and learnings before the week gets away from you.',
      body: 'Hi {{name}}, GrowthOS helps solo founders keep campaigns moving. Start your next sprint today.',
      cta: 'Start sprint',
    }, memory)

    expect(score.dimensions.channelFit.score).toBeGreaterThan(7)
    expect(score.dimensions.conversionIntent.score).toBeGreaterThan(7)
  })

  it('adds persona fit when a persona is supplied', () => {
    const persona: MarketingPersona = {
      id: 'preset-1',
      projectId: 'p1',
      name: 'Founder Operator',
      role: 'Founder',
      description: 'Runs launches personally and wants practical leverage.',
      painPoints: ['launches lose momentum'],
      objections: ['sounds generic'],
      buyingTriggers: ['new product launch'],
      desiredOutcomes: ['ship campaigns faster'],
      vocabulary: ['launch', 'ship', 'sprint', 'leads'],
      preferredChannels: ['landing'],
      skepticismLevel: 'high',
      isPrimary: true,
    }

    const score = scoreGeneratedAsset('landing_page', {
      headline: 'Ship your next launch sprint without losing momentum',
      body: 'Founder operators can track leads, fix campaign gaps, and keep the next launch moving from one workspace.',
      cta: 'Start launch sprint',
    }, memory, persona)

    expect(score.dimensions.personaFit?.score).toBeGreaterThan(7)
    expect(score.recommendations.join(' ')).not.toContain('Persona fit')
  })
})
