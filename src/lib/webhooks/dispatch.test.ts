// Dispatcher state-machine tests. We stub fetch + the supabase chain and
// verify status transitions for the tricky outcome paths: 2xx success,
// 4xx terminal failure, 5xx retry, exhaustion, and the endpoint-level
// auto-disable threshold.

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  deliverWebhook,
  MAX_DELIVERY_ATTEMPTS,
  AUTO_DISABLE_THRESHOLD,
  __testing,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from './dispatch'

const ORIGINAL_FETCH = globalThis.fetch

type StoredDelivery = WebhookDeliveryRow
type StoredEndpoint = WebhookEndpointRow

function makeFakeSupabase(opts: {
  delivery?: StoredDelivery
  endpoint?: StoredEndpoint
  refuseClaim?: boolean
}) {
  const delivery = opts.delivery
  const endpoint = opts.endpoint
  let refuseNextClaim = !!opts.refuseClaim

  const updates: Array<{ table: string; patch: Record<string, unknown>; id?: string }> = []
  let pendingId: string | undefined

  type Resolver = () => Promise<{ data: unknown; error: null }>
  function chain(resolver: Resolver): Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> {
    const proxy: Record<string, unknown> = {}
    proxy.eq = (col: string, val: string) => {
      if (col === 'id') pendingId = val
      return chain(resolver)
    }
    proxy.lt = () => chain(resolver)
    proxy.lte = () => chain(resolver)
    proxy.in = () => chain(resolver)
    proxy.contains = () => chain(resolver)
    proxy.order = () => chain(resolver)
    proxy.limit = () => chain(resolver)
    proxy.select = () => chain(resolver)
    proxy.maybeSingle = () => Promise.resolve(undefined).then(resolver)
    proxy.single = () => Promise.resolve(undefined).then(resolver)
    ;(proxy as unknown as PromiseLike<{ data: unknown; error: null }>).then = (res, rej) =>
      resolver().then(res, rej)
    return proxy as Record<string, unknown> & PromiseLike<{ data: unknown; error: null }>
  }

  return {
    updates,
    supabase: {
      from: (table: string) => ({
        update: (patch: Record<string, unknown>) => {
          // Claim is the only update on webhook_deliveries that sets status='delivering'.
          if (table === 'webhook_deliveries' && patch.status === 'delivering' && refuseNextClaim) {
            refuseNextClaim = false
            return chain(async () => ({ data: null, error: null }))
          }
          return chain(async () => {
            // Resolve at terminal time, after .eq() chains have populated
            // pendingId. Decide which row to mutate based on table + id.
            if (table === 'webhook_deliveries' && delivery && (pendingId === delivery.id || patch.status === 'delivering')) {
              Object.assign(delivery, patch)
            }
            if (table === 'webhook_endpoints' && endpoint && (pendingId === endpoint.id || pendingId === undefined)) {
              Object.assign(endpoint, patch)
            }
            updates.push({ table, patch, id: pendingId })
            pendingId = undefined
            return { data: delivery ?? endpoint ?? null, error: null }
          })
        },
        select: () => chain(async () => ({ data: [], error: null })),
        insert: () => chain(async () => ({ data: null, error: null })),
        delete: () => chain(async () => ({ data: null, error: null })),
      }),
    },
  }
}

function baseDelivery(overrides: Partial<WebhookDeliveryRow> = {}): StoredDelivery {
  return {
    id: 'd-1',
    endpoint_id: 'e-1',
    event_type: 'ingest.completed',
    event_payload: { foo: 'bar' },
    attempts: 0,
    status: 'pending',
    next_attempt_at: new Date().toISOString(),
    ...overrides,
  }
}

function baseEndpoint(overrides: Partial<WebhookEndpointRow> = {}): StoredEndpoint {
  return {
    id: 'e-1',
    user_id: 'u-1',
    project_id: 'p-1',
    url: 'https://example.com/hook',
    secret: 'whsec_test',
    events: ['ingest.completed'],
    active: true,
    consecutive_failures: 0,
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

function stubFetch(responder: (input: RequestInfo | URL) => Response | Promise<Response> | Error) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const result = await responder(input)
    if (result instanceof Error) throw result
    return result
  }) as unknown as typeof fetch
}

describe('deliverWebhook outcomes', () => {
  it('marks success on 2xx', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint()
    const { supabase } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('ok', { status: 200 }))

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('success')
    expect(delivery.status).toBe('success')
  })

  it('marks failed (no retry) on 400', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint()
    const { supabase } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('bad', { status: 400 }))

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('failed')
    expect(delivery.status).toBe('failed')
  })

  it('schedules retry on 503 (transient)', async () => {
    const delivery = baseDelivery({ attempts: 0 })
    const endpoint = baseEndpoint()
    const { supabase } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('upstream down', { status: 503 }))

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('pending')
    expect(delivery.status).toBe('pending')
    // attempts incremented during claim
    expect(delivery.attempts).toBe(1)
  })

  it('schedules retry on 429 (rate limit)', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint()
    const { supabase } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('slow down', { status: 429 }))

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('pending')
  })

  it('schedules retry on network error', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint()
    const { supabase, updates } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Error('ECONNRESET'))

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('pending')
    const finalDeliveryPatch = updates.filter((u) => u.table === 'webhook_deliveries').at(-1)!.patch
    expect(finalDeliveryPatch.error).toBe('ECONNRESET')
  })

  it('marks exhausted at MAX_DELIVERY_ATTEMPTS even if transient', async () => {
    // claim increments attempts to MAX → exhausted check fires.
    const delivery = baseDelivery({ attempts: MAX_DELIVERY_ATTEMPTS - 1 })
    const endpoint = baseEndpoint()
    const { supabase } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('still down', { status: 502 }))

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('exhausted')
    expect(delivery.status).toBe('exhausted')
  })

  it('skips when claim is lost', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint()
    const { supabase } = makeFakeSupabase({ delivery, endpoint, refuseClaim: true })

    const result = await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    expect(result.finalStatus).toBe('skipped')
  })

  it('signs the request with the endpoint secret', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint({ secret: 'whsec_unique_test_value' })
    const { supabase } = makeFakeSupabase({ delivery, endpoint })

    stubFetch(() => new Response('ok', { status: 200 }))
    await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: Array<[unknown, RequestInit]> } }
    const init = fetchMock.mock.calls[0]![1]
    const captured = init.headers as Record<string, string>

    expect(captured['x-growthos-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(captured['x-growthos-event']).toBe('ingest.completed')
    expect(captured['x-growthos-delivery']).toBe(delivery.id)
  })

  it('auto-disables endpoint after AUTO_DISABLE_THRESHOLD consecutive failures', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint({ consecutive_failures: AUTO_DISABLE_THRESHOLD - 1 })
    const { supabase, updates } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('bad', { status: 400 }))

    await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    const endpointUpdates = updates.filter((u) => u.table === 'webhook_endpoints')
    const lastEndpointPatch = endpointUpdates[endpointUpdates.length - 1]!.patch
    expect(lastEndpointPatch.consecutive_failures).toBe(AUTO_DISABLE_THRESHOLD)
    expect(lastEndpointPatch.active).toBe(false)
  })

  it('resets consecutive_failures on success', async () => {
    const delivery = baseDelivery()
    const endpoint = baseEndpoint({ consecutive_failures: 7 })
    const { supabase, updates } = makeFakeSupabase({ delivery, endpoint })
    stubFetch(() => new Response('ok', { status: 200 }))

    await deliverWebhook(supabase as unknown as Parameters<typeof deliverWebhook>[0], delivery, endpoint)

    const endpointUpdates = updates.filter((u) => u.table === 'webhook_endpoints')
    const patch = endpointUpdates[endpointUpdates.length - 1]!.patch
    expect(patch.consecutive_failures).toBe(0)
    expect(patch.last_delivery_status).toBe('success')
  })
})

describe('nextAttemptIso backoff', () => {
  it('grows monotonically across the schedule', () => {
    const baseTime = Date.now()
    const t1 = new Date(__testing.nextAttemptIso(1)).getTime() - baseTime
    const t2 = new Date(__testing.nextAttemptIso(2)).getTime() - baseTime
    const t3 = new Date(__testing.nextAttemptIso(3)).getTime() - baseTime
    expect(t1).toBeLessThan(t2)
    expect(t2).toBeLessThan(t3)
  })

  it('clamps past the schedule length', () => {
    const last = __testing.nextAttemptIso(__testing.BACKOFF_MINUTES.length)
    const beyond = __testing.nextAttemptIso(__testing.BACKOFF_MINUTES.length + 5)
    // Both should land on the longest bucket — within a few ms of each other.
    const diff = Math.abs(new Date(last).getTime() - new Date(beyond).getTime())
    expect(diff).toBeLessThan(50)
  })
})
