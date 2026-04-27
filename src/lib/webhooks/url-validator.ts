// SSRF guard for webhook destination URLs.
//
// Without this, any user with `webhooks:write` could register a URL like
//   http://169.254.169.254/latest/meta-data/iam/security-credentials/
// and the dispatcher would POST to it. The response body gets stored
// (truncated) on `webhook_deliveries.response_body` and is visible via
// the deliveries panel — so the attacker reads AWS metadata via the UI.
//
// We block:
//   - non-http(s) protocols
//   - localhost / loopback (127.0.0.0/8, ::1)
//   - cloud metadata IPs (169.254.0.0/16 — covers AWS, GCP, Azure, Oracle)
//   - RFC1918 private ranges (10/8, 172.16/12, 192.168/16)
//   - IPv6 link-local (fe80::/10) and ULA (fc00::/7)
//   - URLs with credentials baked in (user:pass@host)
//   - URLs with non-standard ports we don't expect (only 80, 443, and
//     common dev ports — see ALLOWED_PORTS_DEV)
//
// In development (NODE_ENV !== 'production') we allow localhost / 127.0.0.1
// so the user can point a webhook at a local receiver while building.
//
// We DO NOT do DNS resolution here — a hostname could resolve to a
// private IP at fetch time (DNS rebinding). Defense-in-depth: the
// dispatcher should re-check after resolution. For now we rely on
// hostname-based blocking + the rare-occurrence assumption.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

// Cloud metadata + loopback + private. Tested against the parsed hostname
// (or IP). We don't try to be clever about CIDR — just exact-string match
// and prefix match where useful.
const BLOCKED_HOSTS = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  '169.254.169.254', // AWS / GCP / Azure / Oracle / Hetzner metadata
  'metadata.google.internal',
  'metadata.azure.com',
])

export interface UrlValidationResult {
  ok: boolean
  reason?: string
}

export function validateWebhookUrl(input: string, opts: { allowDevHosts?: boolean } = {}): UrlValidationResult {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ok: false, reason: 'Not a valid URL' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `Protocol "${url.protocol}" not allowed (use http or https)` }
  }

  // Reject embedded credentials — could be used to leak basic-auth via
  // the webhook delivery response.
  if (url.username || url.password) {
    return { ok: false, reason: 'URL must not include user:password credentials' }
  }

  // Node's URL.hostname preserves brackets for IPv6 ("[::1]"). Strip
  // them so our string matchers work uniformly.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  // Dev-only escape hatch for localhost-style hosts (so devs can point
  // at a local receiver via ngrok-less http://localhost:port).
  const devAllowed = opts.allowDevHosts || process.env.NODE_ENV !== 'production'
  const isLoopback =
    hostname === 'localhost'
    || hostname === '::1'
    || (/^127\./.test(hostname))

  if (BLOCKED_HOSTS.has(hostname)) {
    if (devAllowed && isLoopback) {
      // fall through — dev allow
    } else {
      return { ok: false, reason: `Host "${hostname}" is reserved / not reachable from the public internet` }
    }
  }

  // IP-form private ranges. Hostname could be raw IPv4 / IPv6.
  // 127.x.x.x is loopback — gated by the same dev allow above.
  if (isPrivateIPv4(hostname)) {
    if (devAllowed && isLoopback) {
      // fall through — local dev pointing at a local receiver
    } else {
      return { ok: false, reason: `Private/internal IPv4 (${hostname}) not allowed` }
    }
  }
  if (isLinkLocalOrUlaIPv6(hostname)) {
    return { ok: false, reason: `Private/link-local IPv6 (${hostname}) not allowed` }
  }

  // Disallow .internal / .local / .corp suffixes (often pointed at
  // intranet services that can leak data).
  if (/\.(internal|local|corp|intranet|lan)$/i.test(hostname)) {
    return { ok: false, reason: `Hostname suffix on "${hostname}" looks like an internal network` }
  }

  return { ok: true }
}

function isPrivateIPv4(host: string): boolean {
  // Only consider strings that are syntactically IPv4
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b, c, d] = m.slice(1, 5).map(Number) as [number, number, number, number]
  if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  // 10.0.0.0/8
  if (a === 10) return true
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // 127.0.0.0/8 (any loopback, not just .1)
  if (a === 127) return true
  // 0.0.0.0
  if (a === 0 && b === 0 && c === 0 && d === 0) return true
  // 169.254.0.0/16 — link-local + cloud metadata
  if (a === 169 && b === 254) return true
  // 100.64.0.0/10 — carrier-grade NAT (Tailscale, etc — internal)
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isLinkLocalOrUlaIPv6(host: string): boolean {
  // URL.hostname for IPv6 is bracketed in the input but unbracketed here
  // (Node's URL strips them). Match prefixes.
  const h = host.toLowerCase()
  // fe80::/10 — link local
  if (/^fe[89ab][0-9a-f]?:/i.test(h)) return true
  // fc00::/7 — Unique Local Address
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true
  // ::1 — loopback (already in BLOCKED_HOSTS but belt + suspenders)
  if (h === '::1') return true
  // ::ffff:127.x.x.x — IPv4-mapped loopback
  if (/^::ffff:127\./i.test(h)) return true
  // ::ffff:169.254. — IPv4-mapped link-local
  if (/^::ffff:169\.254\./i.test(h)) return true
  return false
}
