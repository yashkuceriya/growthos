import { beforeEach, describe, expect, it, vi } from 'vitest'

interface State {
  user: { id: string } | null
  campaign: { id: string; metadata: Record<string, unknown> | null } | null
  updates: Array<{ metadata: Record<string, unknown> }>
}

const state: State = {
  user: null,
  campaign: null,
  updates: [],
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table !== 'campaigns') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.campaign, error: null }),
            }),
          }),
        }),
        update: (payload: { metadata: Record<string, unknown> }) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  state.updates.push(payload)
                  return { data: { id: state.campaign?.id ?? 'camp_1', metadata: payload.metadata }, error: null }
                },
              }),
            }),
          }),
        }),
      }
    },
  }),
}))

import { PATCH } from './route'

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function req(body: Record<string, unknown>) {
  return new Request('https://app.test/api/campaigns/camp_1/manual-worklog', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.campaign = {
    id: 'camp_1',
    metadata: {
      keep: true,
      manual_launch_tracker: {
        tasks: [
          { id: 'strategy-angle', title: 'Lock angle', done: false },
          { id: 'channel-email', title: 'Ship email', done: false },
        ],
      },
    },
  }
  state.updates = []
})

describe('PATCH /api/campaigns/[id]/manual-worklog', () => {
  it('401 when unauthenticated', async () => {
    state.user = null
    const res = await PATCH(req({ taskId: 'strategy-angle', done: true }), ctx('camp_1'))
    expect(res.status).toBe(401)
  })

  it('400 when payload is invalid', async () => {
    const res = await PATCH(req({ taskId: 'strategy-angle', done: 'yes' }), ctx('camp_1'))
    expect(res.status).toBe(400)
  })

  it('404 when campaign is not owned', async () => {
    state.campaign = null
    const res = await PATCH(req({ taskId: 'strategy-angle', done: true }), ctx('camp_x'))
    expect(res.status).toBe(404)
  })

  it('toggles the requested task and preserves metadata', async () => {
    const res = await PATCH(req({ taskId: 'channel-email', done: true }), ctx('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tracker.tasks).toEqual([
      expect.objectContaining({ id: 'strategy-angle', done: false }),
      expect.objectContaining({ id: 'channel-email', done: true, completed_at: expect.any(String) }),
    ])
    expect(state.updates[0].metadata.keep).toBe(true)
  })

  it('404 when task is missing', async () => {
    const res = await PATCH(req({ taskId: 'missing', done: true }), ctx('camp_1'))
    expect(res.status).toBe(404)
  })
})
