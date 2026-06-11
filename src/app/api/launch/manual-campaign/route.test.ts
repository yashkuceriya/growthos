import { beforeEach, describe, expect, it, vi } from 'vitest'

interface State {
  user: { id: string } | null
  project: { id: string; name: string } | null
  existingCampaign: { id: string; metadata: Record<string, unknown> | null } | null
  inserts: unknown[]
  updates: unknown[]
}

const state: State = {
  user: null,
  project: null,
  existingCampaign: null,
  inserts: [],
  updates: [],
}

function eqChain<T>(result: () => Promise<T>) {
  const chain = {
    eq: () => chain,
    maybeSingle: result,
  }
  return chain
}

function mutationChain<T>(payload: unknown, result: () => Promise<T>) {
  const chain = {
    eq: () => chain,
    select: () => chain,
    maybeSingle: result,
  }
  if (Array.isArray(state.updates)) state.updates.push(payload)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => eqChain(async () => ({ data: state.project, error: null })),
        }
      }
      if (table === 'campaigns') {
        return {
          select: () => eqChain(async () => ({ data: state.existingCampaign, error: null })),
          update: (payload: unknown) => mutationChain(payload, async () => ({ data: { id: state.existingCampaign?.id ?? 'camp_1' }, error: null })),
          insert: (payload: unknown) => {
            state.inserts.push(payload)
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: 'camp_new', metadata: (payload as { metadata?: unknown }).metadata }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { POST } from './route'

function request(body: Record<string, unknown>) {
  return new Request('https://app.test/api/launch/manual-campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'proj_1',
    channels: ['email', 'landing'],
    goal: 'conversion',
    angle: 'Launch with proof',
    briefMarkdown: '# Launch brief\n\nThis is a useful manual launch brief.',
    tasks: [
      { id: 'strategy-angle', owner: 'Strategy', title: 'Lock angle', detail: 'Pick the proof-led angle.', metric: 'Angle approved', done: true },
      { id: 'channel-email', owner: 'Channel', title: 'Ship email', detail: 'Send warm list email.', metric: 'Replies' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.project = { id: 'proj_1', name: 'GrowthOS' }
  state.existingCampaign = null
  state.inserts = []
  state.updates = []
})

describe('POST /api/launch/manual-campaign', () => {
  it('401 when unauthenticated', async () => {
    state.user = null
    const res = await POST(request(validPayload()))
    expect(res.status).toBe(401)
  })

  it('400 when payload is invalid', async () => {
    const res = await POST(request({ projectId: 'proj_1', channels: [] }))
    expect(res.status).toBe(400)
  })

  it('creates a draft campaign with manual tracker metadata', async () => {
    const res = await POST(request(validPayload()))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.action).toBe('created')
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({
      project_id: 'proj_1',
      status: 'draft',
      channels: ['email', 'landing'],
      metadata: {
        manual_launch_tracker: {
          goal: 'conversion',
          angle: 'Launch with proof',
          tasks: [
            expect.objectContaining({ id: 'strategy-angle', done: true }),
            expect.objectContaining({ id: 'channel-email', done: false }),
          ],
        },
      },
    })
  })

  it('updates an existing campaign when campaignId is provided', async () => {
    state.existingCampaign = { id: 'camp_1', metadata: { keep: true } }
    const res = await POST(request(validPayload({ campaignId: 'camp_1' })))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action).toBe('updated')
    expect(state.updates).toEqual([
      expect.objectContaining({
        channels: ['email', 'landing'],
        metadata: expect.objectContaining({
          keep: true,
          manual_launch_tracker: expect.objectContaining({ goal: 'conversion' }),
        }),
      }),
    ])
  })
})
