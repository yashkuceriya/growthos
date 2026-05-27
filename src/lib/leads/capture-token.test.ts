import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLeadCaptureToken, verifyLeadCaptureToken } from './capture-token'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lead capture tokens', () => {
  it('returns null when signing secret is unset', () => {
    vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', '')
    expect(createLeadCaptureToken({ projectId: 'project_1' })).toBeNull()
  })

  it('creates and verifies a token', () => {
    vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', 'secret')
    const token = createLeadCaptureToken({
      projectId: 'project_1',
      sourceId: 'page_1',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(token).toBeTruthy()
    expect(verifyLeadCaptureToken({
      token,
      projectId: 'project_1',
      sourceId: 'page_1',
      now: new Date('2026-01-01T00:10:00Z'),
    })).toEqual({ ok: true })
  })

  it('rejects project mismatch', () => {
    vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', 'secret')
    const token = createLeadCaptureToken({ projectId: 'project_1' })
    const result = verifyLeadCaptureToken({ token, projectId: 'project_2' })
    expect(result.ok).toBe(false)
  })

  it('rejects expired tokens', () => {
    vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', 'secret')
    const token = createLeadCaptureToken({
      projectId: 'project_1',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    const result = verifyLeadCaptureToken({
      token,
      projectId: 'project_1',
      now: new Date('2026-01-01T02:00:00Z'),
    })
    expect(result.ok).toBe(false)
  })

  it('requires token only when require flag is enabled', () => {
    vi.stubEnv('LEAD_CAPTURE_SIGNING_SECRET', 'secret')
    vi.stubEnv('LEAD_CAPTURE_REQUIRE_TOKEN', 'true')
    const result = verifyLeadCaptureToken({ token: null, projectId: 'project_1' })
    expect(result.ok).toBe(false)
  })
})
