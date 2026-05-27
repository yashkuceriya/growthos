import { beforeEach, describe, expect, it, vi } from 'vitest'

interface State {
  user: { id: string } | null
  mutationResult: Record<string, unknown> | null
  mutationError: { message: string } | null
}

const state: State = {
  user: null,
  mutationResult: null,
  mutationError: null,
}

const patches: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      if (table !== 'webhook_endpoints') throw new Error(`unexpected table ${table}`)
      return {
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: state.mutationResult, error: state.mutationError }),
              }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          patches.push(patch)
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: state.mutationResult, error: state.mutationError }),
                }),
              }),
            }),
          }
        },
      }
    },
  }),
}))

import { DELETE, PATCH } from './route'

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.mutationResult = { id: 'endpoint_1', active: true, events: ['lead.created'] }
  state.mutationError = null
  patches.length = 0
})

describe('PATCH /api/webhook-endpoints/:id', () => {
  it('requires auth', async () => {
    state.user = null
    const res = await PATCH(new Request('https://app.test/api/webhook-endpoints/endpoint_1', {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    }))
    expect(res.status).toBe(401)
  })

  it('rejects requests without editable fields', async () => {
    const res = await PATCH(new Request('https://app.test/api/webhook-endpoints/endpoint_1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(400)
  })

  it('re-enables endpoint and resets failure streak', async () => {
    const res = await PATCH(new Request('https://app.test/api/webhook-endpoints/endpoint_1', {
      method: 'PATCH',
      body: JSON.stringify({ active: true, events: ['lead.created'] }),
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.endpoint).toEqual(state.mutationResult)
    expect(patches[0]).toMatchObject({
      active: true,
      consecutive_failures: 0,
      events: ['lead.created'],
    })
  })

  it('rejects unsupported event-only updates', async () => {
    const res = await PATCH(new Request('https://app.test/api/webhook-endpoints/endpoint_1', {
      method: 'PATCH',
      body: JSON.stringify({ events: ['unknown.event'] }),
    }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/webhook-endpoints/:id', () => {
  it('deletes owned endpoints', async () => {
    const res = await DELETE(new Request('https://app.test/api/webhook-endpoints/endpoint_1', {
      method: 'DELETE',
    }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, id: 'endpoint_1' })
  })

  it('returns 404 when endpoint is not found', async () => {
    state.mutationResult = null
    const res = await DELETE(new Request('https://app.test/api/webhook-endpoints/missing', {
      method: 'DELETE',
    }))
    expect(res.status).toBe(404)
  })
})
