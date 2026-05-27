import { beforeEach, describe, expect, it, vi } from 'vitest'

interface State {
  user: { id: string } | null
  ownedProject: { id: string } | null
  memory: unknown
}

const state: State = { user: null, ownedProject: null, memory: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.ownedProject, error: null }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

const getMarketingMemoryMock = vi.fn()
vi.mock('@/lib/marketing/memory', () => ({
  getMarketingMemory: (...args: unknown[]) => getMarketingMemoryMock(...args),
}))

const buildLaunchPlanMock = vi.fn()
vi.mock('@/lib/launch/plan', () => ({
  buildLaunchPlan: (...args: unknown[]) => buildLaunchPlanMock(...args),
}))

import { GET } from './route'

function makeMemory() {
  return {
    project: { id: 'p1', name: 'Acme', website: null, description: null },
    brand: {},
    classification: {},
    blueprint: { vertical: 'b2b_saas' },
    launchInsights: {},
    adInsights: [],
    founderVoice: { samples: [], styleNotes: null },
    styleReferences: [],
    assetKind: null,
    channel: null,
  }
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.ownedProject = { id: 'p1' }
  state.memory = makeMemory()
  getMarketingMemoryMock.mockResolvedValue(state.memory)
  buildLaunchPlanMock.mockReturnValue({ vertical: 'b2b_saas', defaultChannels: ['linkedin', 'email'] })
})

describe('GET /api/launch/plan', () => {
  it('returns 401 when unauthenticated', async () => {
    state.user = null
    const req = new Request('https://app.test/api/launch/plan?projectId=p1')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when projectId is missing', async () => {
    const req = new Request('https://app.test/api/launch/plan')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when project is not owned by the user', async () => {
    state.ownedProject = null
    const req = new Request('https://app.test/api/launch/plan?projectId=foreign')
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('returns the built plan for owned projects', async () => {
    const req = new Request('https://app.test/api/launch/plan?projectId=p1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan).toMatchObject({ vertical: 'b2b_saas', defaultChannels: ['linkedin', 'email'] })
    expect(getMarketingMemoryMock).toHaveBeenCalled()
    expect(buildLaunchPlanMock).toHaveBeenCalledWith({ memory: state.memory })
  })
})
