import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateWebhookSecretMock = vi.fn()

interface State {
  user: { id: string } | null
  endpoints: Array<Record<string, unknown>>
  project: { id: string } | null
  insertedEndpoint: Record<string, unknown> | null
  insertError: { message: string } | null
}

const state: State = {
  user: null,
  endpoints: [],
  project: null,
  insertedEndpoint: null,
  insertError: null,
}

const inserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/webhooks/sign', () => ({
  generateWebhookSecret: () => generateWebhookSecretMock(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      if (table === 'webhook_endpoints') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: state.endpoints, error: null }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            inserts.push(payload)
            return {
              select: () => ({
                single: async () => ({ data: state.insertedEndpoint, error: state.insertError }),
              }),
            }
          },
        }
      }

      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.project, error: null }),
            }),
          }),
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { GET, POST } from './route'

beforeEach(() => {
  generateWebhookSecretMock.mockReset()
  generateWebhookSecretMock.mockReturnValue('whsec_test')
  state.user = { id: 'user_1' }
  state.endpoints = [{ id: 'endpoint_1', url: 'https://example.com/hook' }]
  state.project = { id: 'proj_1' }
  state.insertedEndpoint = {
    id: 'endpoint_1',
    project_id: null,
    url: 'https://example.com/hook',
    events: ['lead.created'],
    active: true,
  }
  state.insertError = null
  inserts.length = 0
})

describe('GET /api/webhook-endpoints', () => {
  it('returns 401 when unauthenticated', async () => {
    state.user = null
    const res = await GET(new Request('https://app.test/api/webhook-endpoints'))
    expect(res.status).toBe(401)
  })

  it('lists user endpoints', async () => {
    const res = await GET(new Request('https://app.test/api/webhook-endpoints'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.endpoints).toEqual(state.endpoints)
  })
})

describe('POST /api/webhook-endpoints', () => {
  it('rejects unsafe webhook URLs', async () => {
    const res = await POST(new Request('https://app.test/api/webhook-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        url: 'http://169.254.169.254/latest/meta-data',
        events: ['lead.created'],
      }),
    }))
    expect(res.status).toBe(400)
  })

  it('requires at least one supported event', async () => {
    const res = await POST(new Request('https://app.test/api/webhook-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/hook',
        events: ['unknown.event'],
      }),
    }))
    expect(res.status).toBe(400)
  })

  it('creates endpoint and returns plaintext secret once', async () => {
    const res = await POST(new Request('https://app.test/api/webhook-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/hook',
        events: ['lead.created'],
        project_id: 'proj_1',
      }),
    }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.secret).toBe('whsec_test')
    expect(body.endpoint).toEqual(state.insertedEndpoint)
    expect(inserts[0]).toMatchObject({
      user_id: 'user_1',
      project_id: 'proj_1',
      url: 'https://example.com/hook',
      secret: 'whsec_test',
      events: ['lead.created'],
      active: true,
    })
  })
})
