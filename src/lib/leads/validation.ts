const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MAX_METADATA_BYTES = 4096
const MAX_METADATA_DEPTH = 4
const MAX_METADATA_KEYS = 64
const MAX_METADATA_ARRAY = 32
const MAX_STRING = 500

export interface NormalizedLeadInput {
  projectId: string
  email: string
  name: string | null
  source: string | null
  sourceId: string | null
  campaignId: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  metadata: Record<string, unknown>
}

type LeadInputResult =
  | { ok: true; data: NormalizedLeadInput }
  | { ok: false; error: string }

export function normalizeLeadInput(raw: unknown): LeadInputResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid JSON body' }
  }

  const body = raw as Record<string, unknown>

  const projectId = asTrimmedString(body.projectId, 64)
  if (!projectId) return { ok: false, error: 'projectId and email are required' }
  if (!UUID_RE.test(projectId)) return { ok: false, error: 'Invalid projectId' }

  const emailRaw = asTrimmedString(body.email, 254)
  if (!emailRaw) return { ok: false, error: 'projectId and email are required' }
  const email = emailRaw.toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Invalid email' }

  const name = asNullableString(body.name, 160)
  const source = asNullableString(body.source, 120)
  const sourceId = asNullableString(body.sourceId, 160)
  const campaignId = asNullableString(body.campaignId, 64)
  const utm_source = asNullableString(body.utm_source, 120)
  const utm_medium = asNullableString(body.utm_medium, 120)
  const utm_campaign = asNullableString(body.utm_campaign, 160)
  const utm_content = asNullableString(body.utm_content, 200)
  const utm_term = asNullableString(body.utm_term, 200)

  const metadata = sanitizeMetadata(body.metadata)
  if (!metadata.ok) return metadata

  return {
    ok: true,
    data: {
      projectId,
      email,
      name,
      source,
      sourceId,
      campaignId,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      metadata: metadata.value,
    },
  }
}

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function asNullableString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function sanitizeMetadata(
  value: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: {} }
  if (!isPlainObject(value)) return { ok: false, error: 'Invalid metadata (must be an object)' }

  let keyCount = 0
  const walk = (node: unknown, depth: number): unknown => {
    if (depth > MAX_METADATA_DEPTH) throw new Error('Invalid metadata (too deeply nested)')
    if (node == null || typeof node === 'number' || typeof node === 'boolean') return node
    if (typeof node === 'string') return node.length > MAX_STRING ? node.slice(0, MAX_STRING) : node
    if (Array.isArray(node)) return node.slice(0, MAX_METADATA_ARRAY).map((v) => walk(v, depth + 1))
    if (!isPlainObject(node)) return String(node).slice(0, MAX_STRING)

    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      keyCount += 1
      if (keyCount > MAX_METADATA_KEYS) throw new Error('Invalid metadata (too many keys)')
      const key = k.slice(0, 80)
      out[key] = walk(v, depth + 1)
    }
    return out
  }

  let cleaned: Record<string, unknown>
  try {
    cleaned = walk(value, 0) as Record<string, unknown>
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid metadata'
    return { ok: false, error: msg }
  }

  const size = new TextEncoder().encode(JSON.stringify(cleaned)).length
  if (size > MAX_METADATA_BYTES) {
    return { ok: false, error: 'Invalid metadata (payload too large)' }
  }

  return { ok: true, value: cleaned }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
