import { beforeEach, describe, expect, it, vi } from 'vitest'

const deliverWebhookMock = vi.fn()

interface State {
  user: { id: string } | null
  ownEndpoint: { id: string } | null
  endpoint: Record<string, unknown> | null
  insertedDelivery: Record<string, unknown> | null
  insertError: { message: string } | null
}

const state: State = {
  user: null,
  ownEndpoint: null,
  endpoint: null,
  insertedDelivery: null,
  insertError: null,
}

const deliveryInserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/webhooks/dispatch', () => ({
  deliverWebhook: (...args: unknown[]) => deliverWebhookMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      if (table !== 'webhook_endpoints') throw new Error(`unexpected user table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.ownEndpoint, error: null }),
          }),
        }),
      }
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'webhook_endpoints') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.endpoint, error: null }),
            }),
          }),
        }
      }
      if (table === 'webhook_deliveries') {
        return {
          insert: (payload: Record<string, unknown>) => {
            deliveryInserts.push(payload)
            return {
              select: () => ({
                single: async () => ({ data: state.insertedDelivery, error: state.insertError }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected service table ${table}`)
    },
  }),
}))

import { POST } from './route'

beforeEach(() => {
  deliverWebhookMock.mockReset()
  state.user = { id: 'user_1' }
  state.ownEndpoint = { id: 'endpoint_1' }
  state.endpoint = {
    id: 'endpoint_1',
    user_id: 'user_1',
    project_id: null,
    url: 'https://example.com/hook',
    secret: 'whsec_test',
    events: ['lead.created'],
    active: true,
    consecutive_failures: 0,
  }
  state.insertedDelivery = { id: 'delivery_1', status: 'pending' }
  state.insertError = null
  deliveryInserts.length = 0
  deliverWebhookMock.mockResolvedValue({ id: 'delivery_1', finalStatus: 'success' })
})

describe('POST /api/webhook-endpoints/:id/test', () => {
  it('requires auth', async () => {
    state.user = null
    const res = await POST(new Request('https://app.test/api/webhook-endpoints/endpoint_1/test', {
      method: 'POST',
    }))
    expect(res.status).toBe(401)
  })

  it('requires endpoint ownership before service-client work', async () => {
    state.ownEndpoint = null
    const res = await POST(new Request('https://app.test/api/webhook-endpoints/endpoint_1/test', {
      method: 'POST',
    }))
    expect(res.status).toBe(404)
    expect(deliveryInserts).toHaveLength(0)
  })

  it('inserts test delivery and dispatches it', async () => {
    const res = await POST(new Request('https://app.test/api/webhook-endpoints/endpoint_1/test', {
      method: 'POST',
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ delivery_id: 'delivery_1', final_status: 'success' })
    expect(deliveryInserts[0]).toMatchObject({
      endpoint_id: 'endpoint_1',
      event_type: 'test.ping',
      status: 'pending',
    })
    expect(deliverWebhookMock).toHaveBeenCalledTimes(1)
  })
})
