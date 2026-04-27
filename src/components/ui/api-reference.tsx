'use client'

// API Reference panel rendered inside /settings. Reads from two registries
// — lib/api-registry.ts and lib/webhooks/events.ts — so it auto-stays
// in sync with the actual code surface. No hand-maintained docs strings.

import { StatusPill } from './status-pill'
import { API_ENDPOINTS, groupEndpointsByResource, type ApiEndpointDef, type ApiParam } from '@/lib/api-registry'
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events'
import { Lock, RefreshCcw, Webhook as WebhookIcon, Code2 } from 'lucide-react'

const METHOD_TONES: Record<ApiEndpointDef['method'], 'success' | 'info' | 'warn' | 'neutral'> = {
  GET: 'info',
  POST: 'success',
  PATCH: 'warn',
  DELETE: 'neutral',
}

function ParamTable({ params, label }: { params: ApiParam[]; label: string }) {
  if (params.length === 0) return null
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">field</th>
            <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">type</th>
            <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">req</th>
            <th className="border-b border-slate-800 py-1 font-mono-data">description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="align-top">
              <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-200">{p.name}</td>
              <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-emerald-300">{p.type}</td>
              <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-500">
                {p.required ? 'yes' : ''}
              </td>
              <td className="border-b border-slate-900 py-1 font-mono-data text-slate-400">
                {p.description ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EndpointCard({ ep }: { ep: ApiEndpointDef }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill tone={METHOD_TONES[ep.method]}>{ep.method}</StatusPill>
        <code className="font-mono-data text-xs text-slate-100">{ep.path}</code>
        <StatusPill tone="info">
          <Lock className="mr-1 inline h-2.5 w-2.5" />
          {ep.scope}
        </StatusPill>
        {ep.idempotent && (
          <StatusPill tone="success">
            <RefreshCcw className="mr-1 inline h-2.5 w-2.5" />
            Idempotent
          </StatusPill>
        )}
        <span className="ml-auto font-mono-data text-[10px] text-slate-500">→ {ep.successStatus}</span>
      </div>
      <h3 className="text-sm font-semibold text-slate-100">{ep.title}</h3>
      <p className="text-xs text-slate-400">{ep.description}</p>
      {ep.request && <ParamTable params={ep.request} label="Request body" />}
      {ep.response && <ParamTable params={ep.response} label="Response" />}
      {ep.notes && ep.notes.length > 0 && (
        <ul className="space-y-1">
          {ep.notes.map((n) => (
            <li key={n} className="rounded border-l-2 border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ApiReference() {
  const groups = groupEndpointsByResource(API_ENDPOINTS)

  return (
    <div className="space-y-8">
      {/* ── Quick start ──────────────────────────────────────────── */}
      <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Quick start</h2>
        <div className="space-y-2 text-xs text-slate-400">
          <p>
            All endpoints under <code className="font-mono-data text-emerald-300">/api/v1/*</code> require a personal API key.
            Mint one in the <strong className="text-slate-200">API Keys</strong> tab and pass it as a Bearer token:
          </p>
          <pre className="overflow-x-auto rounded bg-slate-950 px-3 py-2 font-mono-data text-[11px] text-slate-200">
{`curl https://your-app.com/api/v1/projects \\
  -H "Authorization: Bearer gos_live_..."`}
          </pre>
          <p>
            Each key is gated by scopes — pick only the scopes the integration needs.
            Endpoints marked <StatusPill tone="success"><RefreshCcw className="mr-1 inline h-2.5 w-2.5" />Idempotent</StatusPill>{' '}
            accept an <code className="font-mono-data text-emerald-300">Idempotency-Key: &lt;uuid&gt;</code> header — retried
            requests within 24h return the cached response with an{' '}
            <code className="font-mono-data text-emerald-300">Idempotent-Replayed: true</code> header. Reusing the same key
            with a different body returns 422.
          </p>
          <p>
            <strong className="text-slate-200">Rate limits</strong>: 60 requests / minute per API key (token bucket — burst
            up to 60). Every response carries{' '}
            <code className="font-mono-data text-emerald-300">x-ratelimit-limit</code>,{' '}
            <code className="font-mono-data text-emerald-300">x-ratelimit-remaining</code>, and{' '}
            <code className="font-mono-data text-emerald-300">x-ratelimit-reset</code> (unix seconds). On 429 you also get{' '}
            <code className="font-mono-data text-emerald-300">retry-after</code> in seconds.
          </p>
        </div>
      </section>

      {/* ── Endpoints by resource ────────────────────────────────── */}
      {groups.map(({ resource, endpoints }) => (
        <section key={resource} className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
            <Code2 className="h-3.5 w-3.5 text-emerald-400" />
            {resource}
          </h2>
          {endpoints.map((ep) => <EndpointCard key={`${ep.method} ${ep.path}`} ep={ep} />)}
        </section>
      ))}

      {/* ── Webhook events ──────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
          <WebhookIcon className="h-3.5 w-3.5 text-emerald-400" />
          Webhook events
        </h2>
        <p className="text-xs text-slate-400">
          Outbound events GrowthOS POSTs to your endpoint when subscribed. All payloads share the wrapper:{' '}
          <code className="font-mono-data text-emerald-300">{`{ id, event, created_at, data: { ... } }`}</code>. Verify the{' '}
          <code className="font-mono-data text-emerald-300">x-growthos-signature</code> header before processing — see the
          verify snippet in the Webhooks tab.
        </p>
        {WEBHOOK_EVENTS.map((event) => (
          <div key={event.name} className="rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-mono-data text-xs text-emerald-300">{event.name}</code>
              <span className="text-xs text-slate-100">{event.label}</span>
            </div>
            <p className="text-[11px] text-slate-400">{event.hint}</p>
            <p className="text-[10px] text-slate-500 font-mono-data">Source: {event.source}</p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">data field</th>
                  <th className="border-b border-slate-800 py-1 pr-3 font-mono-data">type</th>
                  <th className="border-b border-slate-800 py-1 font-mono-data">description</th>
                </tr>
              </thead>
              <tbody>
                {event.payload.map((f) => (
                  <tr key={f.name} className="align-top">
                    <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-200">{f.name}</td>
                    <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-emerald-300">{f.type}</td>
                    <td className="border-b border-slate-900 py-1 font-mono-data text-slate-400">{f.description ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  )
}
