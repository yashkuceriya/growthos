import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TableResponse { data: unknown; error: unknown }

interface State {
  user: { id: string } | null
  campaignRow: { id: string } | null
  metricsList: unknown[]
  existingForUpsert: { id: string } | null
  insertResult: TableResponse
  updateResult: TableResponse
  deleteError: unknown
}

const state: State = {
  user: null,
  campaignRow: null,
  metricsList: [],
  existingForUpsert: null,
  insertResult: { data: { id: 'inserted_1' }, error: null },
  updateResult: { data: { id: 'updated_1' }, error: null },
  deleteError: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: state.campaignRow, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'campaign_metrics') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: state.metricsList, error: null }),
              }),
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: state.existingForUpsert, error: null }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              maybeSingle: async () => state.insertResult,
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => state.updateResult,
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: state.deleteError }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { GET, POST, DELETE } from './route'

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.campaignRow = { id: 'camp_1' }
  state.metricsList = []
  state.existingForUpsert = null
  state.insertResult = { data: { id: 'inserted_1' }, error: null }
  state.updateResult = { data: { id: 'updated_1' }, error: null }
  state.deleteError = null
})

describe('GET /api/campaigns/[id]/metrics', () => {
  it('401 when unauthenticated', async () => {
    state.user = null
    const res = await GET(new Request('https://app.test/api/campaigns/camp_1/metrics'), ctx('camp_1'))
    expect(res.status).toBe(401)
  })

  it('404 when campaign is not owned', async () => {
    state.campaignRow = null
    const res = await GET(new Request('https://app.test/api/campaigns/foreign/metrics'), ctx('foreign'))
    expect(res.status).toBe(404)
  })

  it('returns the rows when owned', async () => {
    state.metricsList = [{ id: 'm1', date: '2026-05-01', channel: 'meta', spend: 10 }]
    const res = await GET(new Request('https://app.test/api/campaigns/camp_1/metrics'), ctx('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.metrics).toHaveLength(1)
  })
})

describe('POST /api/campaigns/[id]/metrics', () => {
  function req(body: unknown) {
    return new Request('https://app.test/api/campaigns/camp_1/metrics', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  it('rejects bad date format', async () => {
    const res = await POST(req({ date: '05/01/2026', channel: 'meta' }), ctx('camp_1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/date/)
  })

  it('rejects bad channel format', async () => {
    const res = await POST(req({ date: '2026-05-01', channel: 'has spaces' }), ctx('camp_1'))
    expect(res.status).toBe(400)
  })

  it('rejects negative numbers', async () => {
    const res = await POST(req({ date: '2026-05-01', channel: 'meta', spend: -5 }), ctx('camp_1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/spend/)
  })

  it('inserts a new row when no duplicate exists', async () => {
    const res = await POST(req({ date: '2026-05-01', channel: 'meta', spend: 10, clicks: 5 }), ctx('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action).toBe('created')
    expect(body.metric.id).toBe('inserted_1')
  })

  it('updates an existing row keyed on (campaign, date, channel)', async () => {
    state.existingForUpsert = { id: 'existing_42' }
    const res = await POST(req({ date: '2026-05-01', channel: 'meta', spend: 99 }), ctx('camp_1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action).toBe('updated')
    expect(body.metric.id).toBe('updated_1')
  })
})

describe('DELETE /api/campaigns/[id]/metrics', () => {
  it('400 without rowId', async () => {
    const res = await DELETE(new Request('https://app.test/api/campaigns/camp_1/metrics', { method: 'DELETE' }), ctx('camp_1'))
    expect(res.status).toBe(400)
  })

  it('deletes when authorized', async () => {
    const res = await DELETE(new Request('https://app.test/api/campaigns/camp_1/metrics?rowId=m1', { method: 'DELETE' }), ctx('camp_1'))
    expect(res.status).toBe(200)
  })

  it('404 when campaign not owned', async () => {
    state.campaignRow = null
    const res = await DELETE(new Request('https://app.test/api/campaigns/foreign/metrics?rowId=m1', { method: 'DELETE' }), ctx('foreign'))
    expect(res.status).toBe(404)
  })
})
