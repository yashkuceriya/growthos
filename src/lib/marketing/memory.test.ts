/* eslint-disable @typescript-eslint/no-unused-vars -- underscore-prefixed
   args in the in-memory Supabase stub are intentionally unused; they exist
   so the chained calls satisfy the structural shape. */
import { describe, expect, it } from 'vitest'
import { getMarketingMemory, marketingMemoryPrompt, type MemorySupabaseClient } from './memory'

// In-memory Supabase stub. Each table call returns a chain whose terminal
// awaitable is configured per-test via the `responses` map keyed by
// `<table>:<terminal>` so we can exercise present/absent/error paths
// without writing a full mock client.
function makeSupabase(responses: Record<string, { data: unknown; error: unknown }>): MemorySupabaseClient {
  function answer(key: string) {
    return responses[key] ?? { data: null, error: null }
  }
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, _val: unknown) {
              return {
                async maybeSingle() {
                  return answer(`${table}:maybeSingle`)
                },
                eq(_col2: string, _val2: unknown) {
                  return {
                    order(_orderCol: string, _opts?: { ascending?: boolean }) {
                      return {
                        async limit(_n: number) {
                          return answer(`${table}:list`)
                        },
                      }
                    },
                    async limit(_n: number) {
                      return answer(`${table}:list`)
                    },
                  }
                },
                order(_orderCol: string, _opts?: { ascending?: boolean }) {
                  return {
                    async limit(_n: number) {
                      return answer(`${table}:list`)
                    },
                  }
                },
                async limit(_n: number) {
                  return answer(`${table}:list`)
                },
              }
            },
          }
        },
      }
    },
  }
}

const PROJECT_ID = 'proj-1'
const USER_ID = 'user-1'

describe('getMarketingMemory', () => {
  it('returns empty defaults when project + tables are empty', async () => {
    const memory = await getMarketingMemory({
      supabase: makeSupabase({}),
      userId: USER_ID,
      projectId: PROJECT_ID,
    })

    expect(memory.project.id).toBe(PROJECT_ID)
    expect(memory.brand.tagline).toBeNull()
    expect(memory.classification.vertical).toBeNull()
    expect(memory.blueprint.vertical).toBe('other')
    expect(memory.adInsights).toEqual([])
    expect(memory.styleReferences).toEqual([])
    expect(memory.founderVoice.samples).toEqual([])
    expect(memory.launchInsights.current).toBeNull()
  })

  it('survives table errors without throwing', async () => {
    const memory = await getMarketingMemory({
      supabase: makeSupabase({
        'projects:maybeSingle': { data: null, error: { message: 'boom' } },
        'founder_voice:maybeSingle': { data: null, error: { message: 'boom' } },
        'ad_insights:list': { data: null, error: { message: 'boom' } },
        'style_references:list': { data: null, error: { message: 'boom' } },
      }),
      userId: USER_ID,
      projectId: PROJECT_ID,
      assetKind: 'twitter_post',
    })

    expect(memory.brand.tagline).toBeNull()
    expect(memory.adInsights).toEqual([])
    expect(memory.styleReferences).toEqual([])
  })

  it('hydrates brand, classification, blueprint, and insights when data exists', async () => {
    const memory = await getMarketingMemory({
      supabase: makeSupabase({
        'projects:maybeSingle': {
          data: {
            id: PROJECT_ID,
            name: 'Bookmarker',
            website: 'https://bookmarker.app',
            description: 'Save and recall everything.',
            brand_voice: {
              tagline: 'Your second brain for bookmarks',
              value_proposition: 'Organize bookmarks with AI summaries',
              target_audience: 'Knowledge workers',
              tone_of_voice: 'friendly expert',
              key_features: ['AI summaries', 'tag tree', 'fast search'],
              differentiators: ['AI built-in', 'private by default'],
              pricing: '$5/mo',
              primary_color: '#10b981',
              captured_screenshot: { url: 'https://example.com/shot.png' },
              design_tokens: { color_palette: ['#10b981'], typography_vibe: 'sans, soft' },
              classification: {
                vertical: 'b2c_saas',
                vertical_confidence: 0.83,
                business_model: 'subscription',
                target_market: 'consumer',
                stage: 'launched',
                primary_goal: 'signups',
                pricing_tier: 'low_ticket_under_50',
                ideal_customer_profile: 'Knowledge workers drowning in tabs.',
                key_competitors: ['Raindrop', 'Notion'],
                compliance_flags: ['gdpr'],
              },
              insights: {
                last_updated: '2026-04-01T00:00:00Z',
                last_campaign_id: 'camp-1',
                current: {
                  winning_hooks: ['question + agitate', 'stat shock'],
                  weak_areas: ['vague CTAs'],
                  channel_notes: { twitter: 'short hooks beat threads' },
                  next_experiments: ['try a contrarian angle'],
                },
                history: [
                  { campaign_id: 'camp-0', timestamp: '2026-03-01T00:00:00Z', insights: { winning_hooks: ['demo first'] } },
                ],
              },
            },
          },
          error: null,
        },
        'founder_voice:maybeSingle': {
          data: { samples: ['I build for the chronically curious.'], style_notes: 'plain words, no fluff' },
          error: null,
        },
        'ad_insights:list': {
          data: [
            { insight_text: 'Stat-shock hooks score highest on conversion-goal ads.', insight_type: 'winning_pattern', dimension: 'clarity', audience_segment: 'knowledge workers', campaign_goal: 'conversion' },
          ],
          error: null,
        },
        'style_references:list': {
          data: [
            { asset_kind: 'twitter_post', asset_content: '12 tools I use every day. #1 will surprise you.', why_good: 'list + cliffhanger', metric_proof: { likes: 200 } },
          ],
          error: null,
        },
      }),
      userId: USER_ID,
      projectId: PROJECT_ID,
      assetKind: 'twitter_post',
    })

    expect(memory.brand.tagline).toBe('Your second brain for bookmarks')
    expect(memory.brand.features).toContain('AI summaries')
    expect(memory.classification.vertical).toBe('b2c_saas')
    expect(memory.classification.complianceFlags).toEqual(['gdpr'])
    expect(memory.blueprint.vertical).toBe('b2c_saas')
    expect(memory.adInsights).toHaveLength(1)
    expect(memory.styleReferences).toHaveLength(1)
    expect(memory.styleReferences[0].whyGood).toBe('list + cliffhanger')
    expect(memory.founderVoice.samples).toContain('I build for the chronically curious.')
    expect(memory.launchInsights.current).toMatchObject({ winning_hooks: ['question + agitate', 'stat shock'] })
    expect(memory.launchInsights.recentHistory[0].campaignId).toBe('camp-0')
  })

  it('skips style references when no assetKind is provided', async () => {
    const memory = await getMarketingMemory({
      supabase: makeSupabase({
        'projects:maybeSingle': {
          data: { id: PROJECT_ID, name: 'X', website: null, description: null, brand_voice: {} },
          error: null,
        },
        // style_references should not even be queried — but if it were, we'd
        // return data to verify it gets ignored.
        'style_references:list': {
          data: [{ asset_kind: 'twitter_post', asset_content: 'should be ignored', why_good: null, metric_proof: null }],
          error: null,
        },
      }),
      userId: USER_ID,
      projectId: PROJECT_ID,
    })

    expect(memory.styleReferences).toEqual([])
  })
})

describe('marketingMemoryPrompt', () => {
  const baseMemory = {
    project: { id: 'p', name: 'Acme', website: 'https://acme.dev', description: null },
    brand: {
      tagline: 'Acme tagline',
      valueProp: 'do X faster',
      audience: 'engineers',
      tone: 'sharp',
      features: ['a', 'b'],
      differentiators: ['unique thing'],
      pricing: null,
      primaryColor: '#000',
      heroImageUrl: null,
      capturedScreenshotUrl: null,
      designTokens: null,
    },
    classification: {
      vertical: 'dev_tool',
      verticalConfidence: 0.9,
      businessModel: 'subscription',
      targetMarket: 'developer',
      stage: 'launched',
      primaryGoal: 'signups',
      pricingTier: 'low_ticket_under_50',
      icp: 'devs at small SaaS teams',
      competitors: ['CompA'],
      complianceFlags: [],
    },
    blueprint: {
      vertical: 'dev_tool' as const,
      confidence: 0.9,
      icp: 'devs at small SaaS teams',
      primaryGoal: 'signups',
      primaryKpi: 'installs',
      primaryChannels: ['github', 'hackernews'] as const as unknown as ['github', 'hackernews'],
      secondaryChannels: [],
      launchTactics: ['HN launch'],
      croFocus: ['fast install path'],
      lifecycleEmails: ['welcome'],
      contentMix: [{ label: 'Educational', pct: 60 }, { label: 'Promotional', pct: 20 }, { label: 'Social proof', pct: 20 }],
      readiness: [],
    } as unknown as Parameters<typeof marketingMemoryPrompt>[0]['blueprint'],
    launchInsights: { lastUpdated: null, lastCampaignId: null, current: null, recentHistory: [] },
    adInsights: [],
    founderVoice: { samples: ['I write blunt copy.'], styleNotes: 'plain words' },
    styleReferences: [],
    assetKind: null,
    channel: null,
  } as Parameters<typeof marketingMemoryPrompt>[0]

  it('always emits the brand block', () => {
    const prompt = marketingMemoryPrompt(baseMemory, 'ad_copy')
    expect(prompt).toContain('BRAND CONTEXT')
    expect(prompt).toContain('Acme tagline')
    expect(prompt).toContain('FOUNDER VOICE')
  })

  it('includes launch tactics and CRO focus for ad_copy surface', () => {
    const prompt = marketingMemoryPrompt(baseMemory, 'ad_copy')
    expect(prompt).toContain('Launch tactics: HN launch')
    expect(prompt).toContain('CRO focus: fast install path')
  })

  it('includes lifecycle emails for email surface but not CRO focus', () => {
    const prompt = marketingMemoryPrompt(baseMemory, 'email')
    expect(prompt).toContain('Lifecycle emails: welcome')
    expect(prompt).not.toContain('CRO focus')
  })

  it('omits style references when none are present', () => {
    const prompt = marketingMemoryPrompt(baseMemory, 'social_post')
    expect(prompt).not.toContain('PROVEN STYLE REFERENCES')
  })

  it('renders style references and ad insights when present', () => {
    const enriched = {
      ...baseMemory,
      assetKind: 'twitter_post',
      styleReferences: [
        { kind: 'twitter_post', content: 'short punchy hook', whyGood: 'leads with verb', metricProof: null },
      ],
      adInsights: [
        { text: 'Stat-shock hooks convert 2x better.', type: 'winning_pattern', dimension: 'clarity', audienceSegment: null, campaignGoal: null },
      ],
    }
    const prompt = marketingMemoryPrompt(enriched, 'ad_copy')
    expect(prompt).toContain('PROVEN STYLE REFERENCES for twitter_post')
    expect(prompt).toContain('Ad performance insights')
    expect(prompt).toContain('Stat-shock hooks')
  })

  it('summarizes launch insights when current is populated', () => {
    const enriched = {
      ...baseMemory,
      launchInsights: {
        lastUpdated: '2026-05-01T00:00:00Z',
        lastCampaignId: 'c1',
        current: {
          winning_hooks: ['stat shock', 'before/after'],
          weak_areas: ['vague CTAs'],
          channel_notes: { twitter: 'short threads beat long ones' },
          next_experiments: ['try a contrarian angle'],
        },
        recentHistory: [],
      },
    }
    const prompt = marketingMemoryPrompt(enriched, 'launch_strategy')
    expect(prompt).toContain('Winning hooks: stat shock · before/after')
    expect(prompt).toContain('Avoid: vague CTAs')
    expect(prompt).toContain('twitter: short threads')
    expect(prompt).toContain('Next experiments: try a contrarian angle')
  })
})
