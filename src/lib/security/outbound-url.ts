const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

const BLOCKED_HOSTS = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.com',
])

export interface OutboundUrlValidationResult {
  ok: boolean
  reason?: string
  normalized?: string
}

export interface FetchTextOptions {
  headers?: HeadersInit
  timeoutMs?: number
  maxRedirects?: number
  maxBytes?: number
  allowDevLoopback?: boolean
}

export interface FetchTextResult {
  body: string
  finalUrl: string
  status: number
}

export function validateOutboundHttpUrl(
  input: string,
  opts: { allowDevLoopback?: boolean } = {},
): OutboundUrlValidationResult {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ok: false, reason: 'Not a valid URL' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `Protocol "${url.protocol}" not allowed (use http or https)` }
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'URL must not include credentials' }
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const devAllowed = opts.allowDevLoopback || process.env.NODE_ENV !== 'production'
  const isLoopback = hostname === 'localhost' || hostname === '::1' || /^127\./.test(hostname)

  if (BLOCKED_HOSTS.has(hostname)) {
    if (!(devAllowed && isLoopback)) {
      return { ok: false, reason: `Host "${hostname}" is reserved / not reachable from public internet` }
    }
  }

  if (isPrivateIPv4(hostname)) {
    if (!(devAllowed && isLoopback)) {
      return { ok: false, reason: `Private/internal IPv4 (${hostname}) not allowed` }
    }
  }

  if (isPrivateIPv6(hostname)) {
    return { ok: false, reason: `Private/link-local IPv6 (${hostname}) not allowed` }
  }

  if (/\.(internal|local|corp|intranet|lan)$/i.test(hostname)) {
    return { ok: false, reason: `Hostname "${hostname}" appears internal` }
  }

  return { ok: true, normalized: url.toString() }
}

export async function fetchTextWithGuards(
  input: string,
  opts: FetchTextOptions = {},
): Promise<FetchTextResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const maxRedirects = opts.maxRedirects ?? 4
  const maxBytes = opts.maxBytes ?? 2_000_000

  const validated = validateOutboundHttpUrl(input, { allowDevLoopback: opts.allowDevLoopback })
  if (!validated.ok || !validated.normalized) {
    throw new Error(`Failed to fetch site: ${validated.reason ?? 'invalid URL'}`)
  }

  let current = validated.normalized
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(current, {
      headers: opts.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error(`Failed to fetch site: redirect (${response.status}) missing location header`)
      }
      const next = new URL(location, current).toString()
      const check = validateOutboundHttpUrl(next, { allowDevLoopback: opts.allowDevLoopback })
      if (!check.ok || !check.normalized) {
        throw new Error(`Failed to fetch site: redirect blocked (${check.reason ?? 'invalid URL'})`)
      }
      current = check.normalized
      continue
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Failed to fetch site: response too large (${contentLength} bytes)`)
    }

    const body = await readTextWithLimit(response, maxBytes)
    return {
      body,
      finalUrl: current,
      status: response.status,
    }
  }

  throw new Error(`Failed to fetch site: too many redirects (max ${maxRedirects})`)
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const body = await response.text()
    const size = new TextEncoder().encode(body).length
    if (size > maxBytes) {
      throw new Error(`Failed to fetch site: response too large (${size} bytes)`)
    }
    return body
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      throw new Error(`Failed to fetch site: response too large (>${maxBytes} bytes)`)
    }
    chunks.push(decoder.decode(value, { stream: true }))
  }

  chunks.push(decoder.decode())
  return chunks.join('')
}

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b, c, d] = m.slice(1, 5).map(Number) as [number, number, number, number]
  if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 0 && b === 0 && c === 0 && d === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase()
  if (/^fe[89ab][0-9a-f]?:/i.test(h)) return true
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true
  if (h === '::1') return true
  if (/^::ffff:127\./i.test(h)) return true
  if (/^::ffff:169\.254\./i.test(h)) return true
  return false
}
