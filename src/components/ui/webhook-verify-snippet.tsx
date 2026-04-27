'use client'

// Copy-pasteable receiver-verification examples shown inline beneath each
// webhook endpoint. Customers can grab the snippet for their stack and
// drop it into their handler — no need to re-derive the algorithm from
// the signature header docs.

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NODE_SNIPPET = `// Node.js — built-in crypto, no deps
import crypto from 'node:crypto'

const SECRET = process.env.GROWTHOS_WEBHOOK_SECRET!
const TOLERANCE_SECONDS = 300

export function verifyGrowthOS(rawBody: string, header: string | null): boolean {
  if (!header) return false
  const parts = header.split(',').map(p => p.trim())
  const t = parts.find(p => p.startsWith('t='))?.slice(2)
  const v = parts.find(p => p.startsWith('v1='))?.slice(3)
  if (!t || !v) return false

  const ts = Number(t)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > TOLERANCE_SECONDS) return false

  const expected = crypto.createHmac('sha256', SECRET).update(\`\${ts}.\${rawBody}\`).digest('hex')
  if (expected.length !== v.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v))
}

// In your route handler — DO NOT use a body-parser that mutates the body;
// you need the EXACT raw bytes that were signed.
// app.post('/webhooks/growthos', express.raw({ type: 'application/json' }), (req, res) => {
//   if (!verifyGrowthOS(req.body.toString('utf8'), req.headers['x-growthos-signature'])) {
//     return res.status(401).end()
//   }
//   const event = JSON.parse(req.body.toString('utf8'))
//   // handle event...
// })`

const PYTHON_SNIPPET = `# Python — hmac stdlib, no deps
import hmac
import hashlib
import time
import os

SECRET = os.environ['GROWTHOS_WEBHOOK_SECRET'].encode()
TOLERANCE_SECONDS = 300

def verify_growthos(raw_body: bytes, header: str | None) -> bool:
    if not header:
        return False
    parts = [p.strip() for p in header.split(',')]
    t = next((p[2:] for p in parts if p.startswith('t=')), None)
    v = next((p[3:] for p in parts if p.startswith('v1=')), None)
    if not t or not v:
        return False

    try:
        ts = int(t)
    except ValueError:
        return False
    if abs(int(time.time()) - ts) > TOLERANCE_SECONDS:
        return False

    expected = hmac.new(SECRET, f'{ts}.{raw_body.decode()}'.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v)


# In your handler — pass the EXACT raw bytes; do not let your framework
# pre-parse the body (signature is over the unparsed wire format).
# @app.post('/webhooks/growthos')
# def handle(request):
#     if not verify_growthos(request.body, request.headers.get('x-growthos-signature')):
#         return Response(status=401)
#     event = json.loads(request.body)
#     # handle event...`

const GO_SNIPPET = `// Go — crypto/hmac stdlib, no deps
package webhooks

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "os"
    "strconv"
    "strings"
    "time"
)

var (
    secret    = []byte(os.Getenv("GROWTHOS_WEBHOOK_SECRET"))
    tolerance = 300 * time.Second
)

func VerifyGrowthOS(rawBody []byte, header string) bool {
    if header == "" {
        return false
    }
    var t, v string
    for _, part := range strings.Split(header, ",") {
        part = strings.TrimSpace(part)
        if strings.HasPrefix(part, "t=") {
            t = part[2:]
        } else if strings.HasPrefix(part, "v1=") {
            v = part[3:]
        }
    }
    if t == "" || v == "" {
        return false
    }

    ts, err := strconv.ParseInt(t, 10, 64)
    if err != nil {
        return false
    }
    if abs := time.Since(time.Unix(ts, 0)); abs < -tolerance || abs > tolerance {
        return false
    }

    mac := hmac.New(sha256.New, secret)
    fmt.Fprintf(mac, "%d.%s", ts, rawBody)
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(v))
}`

const TABS = [
  { key: 'node', label: 'Node.js', code: NODE_SNIPPET },
  { key: 'python', label: 'Python', code: PYTHON_SNIPPET },
  { key: 'go', label: 'Go', code: GO_SNIPPET },
] as const

type Lang = (typeof TABS)[number]['key']

export function WebhookVerifySnippet() {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<Lang>('node')

  const active = TABS.find((t) => t.key === lang) ?? TABS[0]

  function copy() {
    navigator.clipboard.writeText(active.code)
    toast.success('Copied')
  }

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200"
      >
        <Code2 className="h-3 w-3" />
        How to verify the signature
        <span className="ml-auto text-slate-500">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-2">
          <div className="flex items-center gap-1 mb-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setLang(t.key)}
                className={cn(
                  'rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider',
                  lang === t.key
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300',
                )}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={copy}
              className="ml-auto rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-700"
              title="Copy snippet"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-slate-950 px-3 py-2 font-mono-data text-[11px] leading-snug text-slate-200">
            <code>{active.code}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
