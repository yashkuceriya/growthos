// Public endpoint rate limiter.
//
// Primary mode: Upstash Redis sliding-window limiter (cluster-safe).
// Fallback mode: in-memory limiter if Upstash env vars are missing or the
// Upstash call errors. This keeps capture endpoints alive during outages while
// still providing best-effort abuse protection.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

interface Bucket { count: number; windowStart: number }
interface PublicRateLimitResult {
  ok: boolean
  remaining: number
  source: 'upstash' | 'memory'
}

const buckets = new Map<string, Bucket>()
const CLEANUP_THRESHOLD = 10_000
const upstashLimiters = new Map<string, Ratelimit>()
let warnedUpstashError = false

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    if (buckets.size > CLEANUP_THRESHOLD) prune(now, windowMs)
    return { ok: true, remaining: max - 1 }
  }

  existing.count += 1
  if (existing.count > max) {
    return { ok: false, remaining: 0 }
  }
  return { ok: true, remaining: max - existing.count }
}

export async function rateLimitPublic(
  key: string,
  max: number,
  windowMs: number,
): Promise<PublicRateLimitResult> {
  const limiter = getUpstashLimiter(max, windowMs)
  if (limiter) {
    try {
      const r = await limiter.limit(key)
      return {
        ok: r.success,
        remaining: Math.max(0, r.remaining ?? 0),
        source: 'upstash',
      }
    } catch (err) {
      if (!warnedUpstashError) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[rate-limit] Upstash limiter failed; falling back to in-memory limiter:', msg)
        warnedUpstashError = true
      }
    }
  }

  const local = rateLimit(key, max, windowMs)
  return {
    ...local,
    source: 'memory',
  }
}

function prune(now: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key)
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

function getUpstashLimiter(max: number, windowMs: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const seconds = Math.max(1, Math.ceil(windowMs / 1000))
  const key = `${max}:${seconds}`
  const existing = upstashLimiters.get(key)
  if (existing) return existing

  const redis = new Redis({ url, token })
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${seconds} s`),
    analytics: false,
    prefix: 'growthos:public',
  })
  upstashLimiters.set(key, limiter)
  return limiter
}
