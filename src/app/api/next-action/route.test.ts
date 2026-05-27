import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketingBlueprint } from '@/lib/marketing/blueprint'

const DEFAULT_BP: MarketingBlueprint = {
  vertical: 'b2b_saas',
  confidence: 0.9,
  icp: 'ICP',
  primaryGoal: 'signups',
  primaryKpi: 'MQLs',
  primaryChannels: ['linkedin'],
  secondaryChannels: [],
  launchTactics: [],
  croFocus: [],
  lifecycleEmails: [],
  contentMix: [],
  readiness: [],
}

vi.mock('@/lib/marketing/memory', () => ({
  getMarketingMemory: vi.fn(async () => ({
    project: { id: 'p1', name: 'P', website: 'https://example.com', description: null },
    brand: {
      tagline: null, valueProp: null, audience: null, tone: null, features: [], differentiators: [],
      pricing: null, primaryColor: null, heroImageUrl: null, capturedScreenshotUrl: null, designTokens: null,
    },
    classification: {
      vertical: 'b2b_saas', verticalConfidence: 0.9, businessModel: null, targetMarket: null, stage: null,
      primaryGoal: null, pricingTier: null, icp: null, competitors: [], complianceFlags: [],
    },
    blueprint: DEFAULT_BP,
    launchInsights: { lastUpdated: null, lastCampaignId: null, current: null, recentHistory: [] },
    adInsights: [],
    founderVoice: { samples: [], styleNotes: null },
    styleReferences: [],
    assetKind: null,
    channel: null,
  })),
}))

vi.mock('@/lib/budget-guard', () => ({
  checkBudget: vi.fn(async () => ({ ok: true, spent: 0, cap: null, remaining: null })),
}))

interface State {
  user: { id: string } | null
  projectRow: { id: string; website: string | null } | null
  latestCampaign: { id: string } | null
  campaignCount: number | null
  fanout: Record<string, { count?: number | null; data?: unknown[] }>
}

const state: State = {
  user: null,
  projectRow: null,
  latestCampaign: null,
  campaignCount: null,
  fanout: {},
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.projectRow, error: null }),
            }),
          }),
        }
      }
      if (table === 'campaigns') {
        return {
          select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact' && opts?.head) {
              return {
                eq: async () => ({ count: state.campaignCount, error: null }),
              }
            }
            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    /* focus campaign by id */
                    return { data: null, error: null }
                  },
                }),
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: state.latestCampaign, error: null }),
                  }),
                }),
              }),
            }
          },
        }
      }
      const snap = state.fanout[table] ?? { data: [], count: 0 }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: snap.data ?? [], error: null }),
              }),
              limit: async () => ({ data: snap.data ?? [], error: null }),
            }),
            order: () => ({
              limit: async () => ({ data: snap.data ?? [], error: null }),
            }),
          }),
          order: () => ({
            limit: async () => ({ data: snap.data ?? [], error: null }),
          }),
        }),
      }
    },
  }),
}))

import { GET } from './route'

beforeEach(() => {
  state.user = { id: 'u1' }
  state.projectRow = { id: 'proj_1', website: 'https://example.com' }
  state.latestCampaign = { id: 'camp_latest' }
  state.campaignCount = 2
  state.fanout = {
    ad_copies: { data: [{ status: 'evaluator_pass' }] },
    social_posts: { data: [], count: 0 },
    campaign_metrics: { count: 0 },
    content_pieces: { count: 0 },
    landing_pages: { count: 0 },
  }
})

describe('GET /api/next-action', () => {
  it('401 when unauthenticated', async () => {
    state.user = null
    const res = await GET(new Request('https://app.test/api/next-action?projectId=proj_1'))
    expect(res.status).toBe(401)
  })

  it('returns create_project when projectId missing (after auth)', async () => {
    const res = await GET(new Request('https://app.test/api/next-action'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action.id).toBe('create_project')
  })

  it('returns review_ads when latest campaign has evaluator_pass copies', async () => {
    const res = await GET(new Request('https://app.test/api/next-action?projectId=proj_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action.id).toBe('review_ads')
  })
})
