import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketingMemory } from '@/lib/marketing/memory'

const mocks = vi.hoisted(() => ({
  getMarketingMemory: vi.fn(),
}))

interface State {
  user: { id: string } | null
  project: { id: string; brand_voice: Record<string, unknown> | null } | null
  personas: Array<Record<string, unknown>>
  personasError: unknown
}

const state: State = {
  user: null,
  project: null,
  personas: [],
  personasError: null,
}

vi.mock('@/lib/marketing/memory', () => ({
  getMarketingMemory: mocks.getMarketingMemory,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.project, error: null }),
            }),
          }),
        }
      }
      if (table === 'personas') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: state.personas, error: state.personasError }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { GET } from './route'

const memory = {
  project: { id: 'proj_1', name: 'GrowthOS', website: null, description: null },
  brand: { audience: 'solo app founders' },
  classification: { icp: 'builders', targetMarket: 'founders' },
} as unknown as MarketingMemory

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.project = {
    id: 'proj_1',
    brand_voice: {
      insights: {
        persona_current: {
          'persona-1': {
            campaign_id: 'camp_1',
            timestamp: '2026-06-13T01:00:00.000Z',
            insight_signal: 'Best channel: email',
            best_channel: 'email',
            manual_task_count: 2,
            recommended_next: ['Repeat email'],
          },
        },
        persona_history: { 'persona-1': [{}, {}] },
      },
    },
  }
  state.personas = [
    {
      id: 'persona-1',
      project_id: 'proj_1',
      name: 'Founder Operator',
      role: 'Founder',
      skepticism_level: 'high',
      is_primary: true,
      pain_points: ['manual launches'],
      objections: ['too much setup'],
      buying_triggers: [],
      desired_outcomes: ['ship faster'],
      vocabulary: ['launch'],
      preferred_channels: ['email'],
    },
  ]
  state.personasError = null
  mocks.getMarketingMemory.mockReset()
  mocks.getMarketingMemory.mockResolvedValue(memory)
})

describe('GET /api/personas', () => {
  it('401 when unauthenticated', async () => {
    state.user = null
    const res = await GET(new Request('https://app.test/api/personas?project_id=proj_1'))
    expect(res.status).toBe(401)
  })

  it('returns stored personas with persona learning digests', async () => {
    const res = await GET(new Request('https://app.test/api/personas?project_id=proj_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inferred).toBe(false)
    expect(body.personas[0].name).toBe('Founder Operator')
    expect(body.personaLearning['persona-1']).toEqual(expect.objectContaining({
      insightSignal: 'Best channel: email',
      bestChannel: 'email',
      manualTaskCount: 2,
      historyCount: 2,
    }))
    expect(mocks.getMarketingMemory).not.toHaveBeenCalled()
  })

  it('returns inferred personas with the same learning map when no rows exist', async () => {
    state.personas = []
    const res = await GET(new Request('https://app.test/api/personas?projectId=proj_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inferred).toBe(true)
    expect(body.personas.length).toBeGreaterThan(0)
    expect(body.personaLearning['persona-1'].campaignId).toBe('camp_1')
    expect(mocks.getMarketingMemory).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      projectId: 'proj_1',
    }))
  })
})
