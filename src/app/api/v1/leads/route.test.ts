import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticateApiKeyMock = vi.fn()
const enforceRateLimitMock = vi.fn()
const withIdempotencyMock = vi.fn()

interface State {
  project: { user_id: string } | null
  existingLead: { id: string } | null
  insertedLead: { id: string } | null
  insertError: { message: string } | null
}

const state: State = {
  project: null,
  existingLead: null,
  insertedLead: null,
  insertError: null,
}

const insertedLeads: Array<Record<string, unknown>> = []
const leadEvents: Array<Record<string, unknown>> = []

vi.mock('@/lib/api-auth', () => ({
  authenticateApiKey: (...args: unknown[]) => authenticateApiKeyMock(...args),
}))

vi.mock('@/lib/rate-limit-api', () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
  attachRateLimitHeaders: (response: Response, outcome: { ok: boolean; headers?: Record<string, string> }) => {
    if (outcome.ok && outcome.headers) {
      for (const [k, v] of Object.entries(outcome.headers)) response.headers.set(k, v)
    }
    return response
  },
}))

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (...args: unknown[]) => withIdempotencyMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
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

      if (table === 'leads') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: state.existingLead, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertedLeads.push(payload)
            return {
              select: () => ({
                single: async () => ({ data: state.insertedLead, error: state.insertError }),
              }),
            }
          },
        }
      }

      if (table === 'lead_events') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            leadEvents.push(payload)
            return { error: null }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { POST } from './route'

beforeEach(() => {
  authenticateApiKeyMock.mockReset()
  enforceRateLimitMock.mockReset()
  withIdempotencyMock.mockReset()
  insertedLeads.length = 0
  leadEvents.length = 0
  state.project = { user_id: 'user_1' }
  state.existingLead = null
  state.insertedLead = { id: 'lead_new' }
  state.insertError = null

  authenticateApiKeyMock.mockResolvedValue({
    ok: true,
    userId: 'user_1',
    keyId: 'key_1',
    scopes: ['leads:write'],
  })
  enforceRateLimitMock.mockResolvedValue({
    ok: true,
    remaining: 42,
    limit: 60,
    headers: {
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '42',
      'x-ratelimit-reset': '999',
    },
  })
  withIdempotencyMock.mockImplementation(async (args: { handler: () => Promise<Response> }) => args.handler())
})

function leadRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/v1/leads', {
    method: 'POST',
    headers: {
      authorization: 'Bearer gos_live_test',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/leads', () => {
  it('returns auth failure before doing rate limit work', async () => {
    authenticateApiKeyMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Missing bearer token' }, { status: 401 }),
    })

    const res = await POST(leadRequest({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: 'lead@example.com',
    }))

    expect(res.status).toBe(401)
    expect(enforceRateLimitMock).not.toHaveBeenCalled()
  })

  it('returns rate-limit response before parsing side-effect path', async () => {
    enforceRateLimitMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Rate limit exceeded' }, { status: 429 }),
    })

    const res = await POST(leadRequest({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: 'lead@example.com',
    }))

    expect(res.status).toBe(429)
    expect(withIdempotencyMock).not.toHaveBeenCalled()
  })

  it('rejects cross-tenant projects', async () => {
    state.project = { user_id: 'someone_else' }

    const res = await POST(leadRequest({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: 'lead@example.com',
    }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatch(/not found/i)
    expect(insertedLeads).toHaveLength(0)
  })

  it('creates new leads and attaches rate-limit headers', async () => {
    const res = await POST(leadRequest({
      projectId: '123e4567-e89b-42d3-a456-426614174000',
      email: 'LEAD@example.com',
      metadata: { plan: 'pro' },
    }, { 'idempotency-key': 'idem_1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('42')
    expect(body).toEqual({ lead_id: 'lead_new', status: 'new' })
    expect(insertedLeads[0]).toMatchObject({
      user_id: 'user_1',
      email: 'lead@example.com',
      metadata: { plan: 'pro', api_key_id: 'key_1' },
    })
    expect(leadEvents).toHaveLength(1)
    expect(withIdempotencyMock).toHaveBeenCalledWith(expect.objectContaining({
      apiKeyId: 'key_1',
      idempotencyKey: 'idem_1',
      path: '/api/v1/leads',
    }))
  })
})
