// Simple in-memory sliding-window rate limiter. Not cluster-safe (dies on cold
// start, doesn't coordinate across edge replicas) but good enough to reject
// naive floods on a single-region Vercel deployment. Swap for Upstash Ratelimit
// when traffic warrants it.

interface Bucket { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()
const CLEANUP_THRESHOLD = 10_000

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
