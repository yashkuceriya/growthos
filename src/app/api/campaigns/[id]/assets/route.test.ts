import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TableResponse { data: unknown; error: unknown }

interface State {
  user: { id: string } | null
  campaignRow: { id: string; project_id: string } | null
  table: Record<string, TableResponse>
}

const state: State = {
  user: null,
  campaignRow: null,
  table: {},
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: state.campaignRow, error: null }),
              }),
            }),
          }),
        }
      }
      // Other tables: end with .order() that resolves to the configured row.
      // Some chains also end with .limit() so we make both terminal forms
      // resolve to the same Promise.
      return {
        select: () => ({
          eq: () => ({
            order: () => {
              const result = state.table[table] ?? { data: [], error: null }
              return Object.assign(Promise.resolve(result), {
                limit: () => Promise.resolve(result),
              })
            },
          }),
        }),
      }
    },
  }),
}))

import { GET } from './route'

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.campaignRow = { id: 'camp_1', project_id: 'proj_1' }
  state.table = {
    ad_copies: { data: [
      { id: 'ad_1', headline: 'Hook', primary_text: 'body', status: 'compliance_pass', is_best: true, variant_group: 'g1', variant_label: 'A', hook_framework: 'stat_shock', created_at: '2026-05-01T00:00:00Z', ad_briefs: { platform: 'meta' } },
    ], error: null },
    social_posts: { data: [
      { id: 'sp_1', platform: 'twitter', content: 'short tweet', status: 'scheduled', scheduled_at: '2026-05-02T00:00:00Z', external_url: null, engagement: null, is_winner: false, created_at: '2026-05-01T01:00:00Z', metadata: { type: 'thread' } },
    ], error: null },
    content_pieces: { data: [
      { id: 'cp_1', title: 'How to ship faster', slug: 'how-to-ship-faster', body_markdown: '...', content_type: 'blog_post', status: 'drafting', word_count: 1500, seo_score: 72, created_at: '2026-05-01T02:00:00Z' },
    ], error: null },
    landing_pages: { data: [
      { id: 'lp_1', name: 'Launch', slug: 'launch-page', template: { headline: 'Launch headline', subheadline: 'sub' }, published: true, visits: 12, conversions: 2, created_at: '2026-05-01T03:00:00Z' },
    ], error: null },
    leads: { data: [
      { id: 'ld_1', email: '[email protected]', name: 'Dan', status: 'qualified', score: 50, utm_source: 'twitter', utm_medium: 'organic', utm_campaign: 'launch', created_at: '2026-05-01T04:00:00Z' },
    ], error: null },
    email_templates: { data: [
      { id: 'et_1', name: 'Welcome 1', subject: 'Hi there', category: 'welcome', is_winner: true, created_at: '2026-05-01T05:00:00Z' },
    ], error: null },
  }
})

describe('GET /api/campaigns/[id]/assets', () => {
  it('returns 401 when unauthenticated', async () => {
    state.user = null
    const res = await GET(new Request('https://app.test/api/campaigns/camp_1/assets'), makeContext('camp_1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign is not owned by the caller', async () => {
    state.campaignRow = null
    const res = await GET(new Request('https://app.test/api/campaigns/foreign/assets'), makeContext('foreign'))
    expect(res.status).toBe(404)
  })

  it('returns normalized assets and a summary for owned campaigns', async () => {
    const res = await GET(new Request('https://app.test/api/campaigns/camp_1/assets'), makeContext('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.summary).toEqual({ ads: 1, social: 1, blogs: 1, landings: 1, leads: 1 })
    expect(body.assets).toHaveLength(5)
    expect(body.projectEmails).toHaveLength(1)

    const ad = body.assets.find((a: { kind: string }) => a.kind === 'ad')
    expect(ad.title).toBe('Hook')
    expect(ad.status_tone).toBe('success')
    expect(ad.channel).toBe('meta')

    const lp = body.assets.find((a: { kind: string }) => a.kind === 'landing')
    expect(lp.href).toBe('/p/launch-page')
    expect(lp.metadata.visits).toBe(12)

    const lead = body.assets.find((a: { kind: string }) => a.kind === 'lead')
    expect(lead.status_tone).toBe('info')
    expect(lead.metadata.utm_source).toBe('twitter')
  })
})
