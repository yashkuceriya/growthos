import { beforeEach, describe, expect, it, vi } from 'vitest'

const deliverWebhookMock = vi.fn()

interface Delivery {
  id: string
  endpoint_id: string
  status: 'failed' | 'exhausted' | 'success' | 'pending' | 'delivering'
}

interface State {
  user: { id: string } | null
  ownEndpoint: { id: string } | null
  delivery: Delivery | null
  resetDelivery: Delivery | null
  endpoint: Record<string, unknown> | null
}

const state: State = {
  user: null,
  ownEndpoint: null,
  delivery: null,
  resetDelivery: null,
  endpoint: null,
}

const resetPatches: Array<Record<string, unknown>> = []

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
      if (table === 'webhook_deliveries') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: state.delivery, error: null }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            resetPatches.push(patch)
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: state.resetDelivery, error: null }),
                  }),
                }),
              }),
            }
          },
        }
      }
      if (table === 'webhook_endpoints') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.endpoint, error: null }),
            }),
          }),
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
  state.delivery = { id: 'delivery_1', endpoint_id: 'endpoint_1', status: 'failed' }
  state.resetDelivery = { id: 'delivery_1', endpoint_id: 'endpoint_1', status: 'pending' }
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
  resetPatches.length = 0
  deliverWebhookMock.mockResolvedValue({ id: 'delivery_1', finalStatus: 'success' })
})

describe('POST /api/webhook-endpoints/:id/deliveries/:deliveryId/redrive', () => {
  it('requires auth', async () => {
    state.user = null
    const res = await POST(new Request('https://app.test/api/webhook-endpoints/endpoint_1/deliveries/delivery_1/redrive', {
      method: 'POST',
    }))
    expect(res.status).toBe(401)
  })

  it('rejects already successful deliveries', async () => {
    state.delivery = { id: 'delivery_1', endpoint_id: 'endpoint_1', status: 'success' }
    const res = await POST(new Request('https://app.test/api/webhook-endpoints/endpoint_1/deliveries/delivery_1/redrive', {
      method: 'POST',
    }))
    expect(res.status).toBe(409)
    expect(deliverWebhookMock).not.toHaveBeenCalled()
  })

  it('resets failed delivery and dispatches it', async () => {
    const res = await POST(new Request('https://app.test/api/webhook-endpoints/endpoint_1/deliveries/delivery_1/redrive', {
      method: 'POST',
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ delivery_id: 'delivery_1', final_status: 'success' })
    expect(resetPatches[0]).toMatchObject({
      status: 'pending',
      attempts: 0,
      error: null,
      response_status: null,
      response_body: null,
    })
    expect(deliverWebhookMock).toHaveBeenCalledTimes(1)
  })
})
