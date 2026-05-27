import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimitPublicMock = vi.fn()
const clientIpMock = vi.fn()
const emitEventMock = vi.fn()

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

const leadEvents: Array<Record<string, unknown>> = []
const insertedLeads: Array<Record<string, unknown>> = []

vi.mock('@/lib/rate-limit', () => ({
  rateLimitPublic: (...args: unknown[]) => rateLimitPublicMock(...args),
  clientIp: (...args: unknown[]) => clientIpMock(...args),
}))

vi.mock('@/lib/webhooks/dispatch', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
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
                single: async () => ({
                  data: state.insertedLead,
                  error: state.insertError,
                }),
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
  vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', '')
  vi.stubEnv('LEAD_CAPTURE_REQUIRE_TOKEN', '')
  rateLimitPublicMock.mockReset()
  clientIpMock.mockReset()
  emitEventMock.mockReset()
  state.project = { user_id: 'user_1' }
  state.existingLead = null
  state.insertedLead = { id: 'lead_new' }
  state.insertError = null
  leadEvents.length = 0
  insertedLeads.length = 0
  rateLimitPublicMock.mockResolvedValue({ ok: true, remaining: 9, source: 'memory' })
  clientIpMock.mockReturnValue('203.0.113.5')
  emitEventMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/leads/capture', () => {
  it('returns 429 when rate limit denies request', async () => {
    rateLimitPublicMock.mockResolvedValueOnce({ ok: false, remaining: 0, source: 'upstash' })
    const req = new Request('https://app.test/api/leads/capture', {
      method: 'POST',
      body: JSON.stringify({
        projectId: '123e4567-e89b-42d3-a456-426614174000',
        email: 'lead@example.com',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  it('rejects missing capture token when token enforcement is enabled', async () => {
    vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', 'secret')
    vi.stubEnv('LEAD_CAPTURE_REQUIRE_TOKEN', 'true')
    const req = new Request('https://app.test/api/leads/capture', {
      method: 'POST',
      body: JSON.stringify({
        projectId: '123e4567-e89b-42d3-a456-426614174000',
        email: 'lead@example.com',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('creates a lead and emits lead.created for new leads', async () => {
    const req = new Request('https://app.test/api/leads/capture', {
      method: 'POST',
      body: JSON.stringify({
        projectId: '123e4567-e89b-42d3-a456-426614174000',
        email: 'lead@example.com',
        source: 'landing_page',
        metadata: { campaign: 'spring' },
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('new')
    expect(body.lead_id).toBe('lead_new')
    expect(insertedLeads).toHaveLength(1)
    expect(leadEvents).toHaveLength(1)
    expect(emitEventMock).toHaveBeenCalledTimes(1)
  })

  it('returns existing lead when email already exists for project', async () => {
    state.existingLead = { id: 'lead_existing' }
    const req = new Request('https://app.test/api/leads/capture', {
      method: 'POST',
      body: JSON.stringify({
        projectId: '123e4567-e89b-42d3-a456-426614174000',
        email: 'lead@example.com',
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('existing')
    expect(body.lead_id).toBe('lead_existing')
    expect(insertedLeads).toHaveLength(0)
    expect(emitEventMock).toHaveBeenCalledTimes(0)
  })
})
