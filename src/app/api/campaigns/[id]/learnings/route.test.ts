import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mergeBrandVoice: vi.fn(async () => ({})),
}))

interface TableResponse { data: unknown; error: unknown }

interface State {
  user: { id: string } | null
  campaignRow: { id: string; project_id: string; metadata: Record<string, unknown> | null } | null
  table: Record<string, TableResponse>
  updateCalls: Array<{ metadata: Record<string, unknown> }>
}

const state: State = {
  user: null,
  campaignRow: null,
  table: {},
  updateCalls: [],
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
          update: (payload: { metadata: Record<string, unknown> }) => ({
            eq: async () => {
              state.updateCalls.push({ metadata: payload.metadata })
              return { error: null }
            },
          }),
        }
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => state.table.projects ?? { data: { brand_voice: {} }, error: null },
            }),
          }),
        }
      }
      if (table === 'email_templates') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => state.table.email_templates ?? { data: [], error: null },
              }),
            }),
          }),
        }
      }
      if (table === 'email_sends') {
        return {
          select: () => ({
            in: async () => state.table.email_sends ?? { data: [], error: null },
          }),
        }
      }
      return {
        select: () => ({
          eq: async () => state.table[table] ?? { data: [], error: null },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/brand-voice', () => ({
  mergeBrandVoice: mocks.mergeBrandVoice,
}))

import { GET } from './route'

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.campaignRow = { id: 'camp_1', project_id: 'proj_1', metadata: {} }
  state.updateCalls = []
  mocks.mergeBrandVoice.mockClear()
  state.table = {
    projects: { data: { brand_voice: { insights: { current: { winning_hooks: ['Founder-built'] } } } }, error: null },
    campaign_metrics: { data: [
      { channel: 'meta', date: '2026-05-01', impressions: 1000, clicks: 50, conversions: 5, spend: 100, revenue: 250 },
    ], error: null },
    ad_copies: { data: [
      { id: 'a1', status: 'human_approved', weighted_average: 8.5, headline: 'Win', primary_text: 'x', is_best: true },
    ], error: null },
    social_posts: { data: [], error: null },
    email_templates: { data: [], error: null },
  }
})

describe('GET /api/campaigns/[id]/learnings', () => {
  it('401 when unauthenticated', async () => {
    state.user = null
    const res = await GET(new Request('https://app.test/api'), ctx('camp_1'))
    expect(res.status).toBe(401)
  })

  it('404 when campaign not owned', async () => {
    state.campaignRow = null
    const res = await GET(new Request('https://app.test/api'), ctx('camp_x'))
    expect(res.status).toBe(404)
  })

  it('returns summary and persists learning_summary onto campaign metadata', async () => {
    const res = await GET(new Request('https://app.test/api'), ctx('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary).toBeDefined()
    expect(body.summary.strongestHook).toBe('Founder-built')
    expect(body.summary.inputCounts.metrics).toBe(1)
    expect(body.summary.inputCounts.ads).toBe(1)
    expect(body.summary.inputCounts.manualTasks).toBe(0)
    expect(state.updateCalls.length).toBe(1)
    expect(state.updateCalls[0].metadata.learning_summary).toBeDefined()
  })

  it('includes completed manual worklog tasks in the learning summary', async () => {
    state.campaignRow = {
      id: 'camp_1',
      project_id: 'proj_1',
      metadata: {
        persona: { id: 'persona-founder', name: 'Founder Operator', role: 'Founder', skepticismLevel: 'high' },
        manual_launch_tracker: {
          tasks: [
            { id: 'email', title: 'Ship email asset', detail: 'Send the sequence', metric: 'Replies', channel: 'email', done: true },
            { id: 'social', title: 'Post thread', detail: 'Publish launch post', metric: 'Clicks', channel: 'social', done: false },
          ],
        },
      },
    }
    state.table.campaign_metrics = { data: [], error: null }
    state.table.ad_copies = { data: [], error: null }

    const res = await GET(new Request('https://app.test/api'), ctx('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.inputCounts.manualTasks).toBe(1)
    expect(body.summary.recommendedNext.join(' | ')).toMatch(/log manual results/i)
    const persisted = state.updateCalls[0].metadata.learning_summary as { inputCounts: { manualTasks: number } }
    expect(persisted.inputCounts.manualTasks).toBe(1)
    const personaLearning = state.updateCalls[0].metadata.persona_learning as { persona_id: string; insight_signal: string | null }
    expect(personaLearning.persona_id).toBe('persona-founder')
    expect(personaLearning.insight_signal).toBeTruthy()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.mergeBrandVoice).toHaveBeenCalledWith(
      expect.anything(),
      'proj_1',
      expect.objectContaining({
        insights: expect.objectContaining({
          last_persona_learning_campaign_id: 'camp_1',
          persona_current: expect.objectContaining({
            'persona-founder': expect.objectContaining({
              manual_task_count: 1,
              persona: expect.objectContaining({ name: 'Founder Operator' }),
            }),
          }),
        }),
      }),
    )
  })
})
