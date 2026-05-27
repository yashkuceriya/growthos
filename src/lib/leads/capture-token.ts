import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_TTL_SECONDS = 60 * 60

interface CaptureTokenPayload {
  projectId: string
  sourceId?: string | null
  exp: number
}

export function createLeadCaptureToken(args: {
  projectId: string
  sourceId?: string | null
  now?: Date
}): string | null {
  const secret = process.env.LEAD_CAPTURE_SIGNING_SECRET
  if (!secret) return null

  const now = args.now ?? new Date()
  const payload: CaptureTokenPayload = {
    projectId: args.projectId,
    sourceId: args.sourceId ?? null,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
  }
  const body = base64UrlEncode(JSON.stringify(payload))
  const sig = sign(body, secret)
  return `${body}.${sig}`
}

export function verifyLeadCaptureToken(args: {
  token: unknown
  projectId: string
  sourceId?: string | null
  now?: Date
}): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.LEAD_CAPTURE_SIGNING_SECRET
  const required = process.env.LEAD_CAPTURE_REQUIRE_TOKEN === 'true'
  if (!secret) {
    return required
      ? { ok: false, reason: 'Lead capture token secret not configured' }
      : { ok: true }
  }

  if (typeof args.token !== 'string' || !args.token) {
    return required
      ? { ok: false, reason: 'Missing lead capture token' }
      : { ok: true }
  }

  const [body, sig, extra] = args.token.split('.')
  if (!body || !sig || extra) return { ok: false, reason: 'Malformed lead capture token' }

  const expected = sign(body, secret)
  if (!constantTimeEqual(sig, expected)) {
    return { ok: false, reason: 'Invalid lead capture token' }
  }

  let payload: CaptureTokenPayload
  try {
    payload = JSON.parse(base64UrlDecode(body)) as CaptureTokenPayload
  } catch {
    return { ok: false, reason: 'Invalid lead capture token payload' }
  }

  if (payload.projectId !== args.projectId) {
    return { ok: false, reason: 'Lead capture token project mismatch' }
  }
  if (args.sourceId && payload.sourceId && payload.sourceId !== args.sourceId) {
    return { ok: false, reason: 'Lead capture token source mismatch' }
  }

  const nowSec = Math.floor((args.now ?? new Date()).getTime() / 1000)
  if (!Number.isFinite(payload.exp) || payload.exp < nowSec) {
    return { ok: false, reason: 'Lead capture token expired' }
  }

  return { ok: true }
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}
