import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit, clientIp } from './rate-limit'

// rate-limit uses a module-level Map. Each test uses a unique key so isolation
// isn't strictly necessary, but we pin time for determinism.

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('allows the first call and counts remaining correctly', () => {
    const { ok, remaining } = rateLimit('test:first-call', 3, 1000)
    expect(ok).toBe(true)
    expect(remaining).toBe(2)
  })

  it('allows up to max within the window', () => {
    const key = 'test:up-to-max'
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
  })

  it('rejects calls that exceed max within the window', () => {
    const key = 'test:reject-overflow'
    rateLimit(key, 2, 1000)
    rateLimit(key, 2, 1000)
    const r = rateLimit(key, 2, 1000)
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('resets after the window elapses', () => {
    const key = 'test:reset-after-window'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    rateLimit(key, 1, 1000)
    expect(rateLimit(key, 1, 1000).ok).toBe(false)

    vi.setSystemTime(new Date('2026-01-01T00:00:02Z')) // +2s
    expect(rateLimit(key, 1, 1000).ok).toBe(true)

    vi.useRealTimers()
  })
})

describe('clientIp', () => {
  it('prefers x-forwarded-for and takes the first entry', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    })
    expect(clientIp(req)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('https://x.test', { headers: { 'x-real-ip': '203.0.113.9' } })
    expect(clientIp(req)).toBe('203.0.113.9')
  })

  it('returns "unknown" when no ip headers present', () => {
    const req = new Request('https://x.test')
    expect(clientIp(req)).toBe('unknown')
  })
})
