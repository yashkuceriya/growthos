import { beforeEach, describe, expect, it, vi } from 'vitest'

const runIngestMock = vi.fn()

interface State {
  user: { id: string } | null
  ownedProject: { id: string } | null
}

const state: State = {
  user: null,
  ownedProject: null,
}

vi.mock('@/lib/ai/intelligence/ingest', () => ({
  runIngest: (...args: unknown[]) => runIngestMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.ownedProject, error: null }),
            }),
          }),
        }),
      }
    },
  }),
}))

import { POST } from './route'

beforeEach(() => {
  state.user = { id: 'user_1' }
  state.ownedProject = { id: 'proj_1' }
  runIngestMock.mockResolvedValue({ brand: { tagline: 'x' } })
})

describe('POST /api/projects/ingest', () => {
  it('returns 401 for unauthenticated users', async () => {
    state.user = null
    const req = new Request('https://app.test/api/projects/ingest', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj_1', url: 'https://example.com' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 404 when project is not owned by user', async () => {
    state.ownedProject = null
    const req = new Request('https://app.test/api/projects/ingest', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj_2', url: 'https://example.com' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('runs ingest and returns brand payload for owned projects', async () => {
    const req = new Request('https://app.test/api/projects/ingest', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj_1', url: 'https://example.com' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.brand).toEqual({ tagline: 'x' })
    expect(runIngestMock).toHaveBeenCalledTimes(1)
  })
})
