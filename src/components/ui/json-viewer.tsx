'use client'
// Generic structured-JSON viewer: renders nested objects/arrays with nice styling.
// Used by tool result pages when we don't need a custom layout per tool.
import { cn } from '@/lib/utils'
import { StatusPill } from '@/components/ui/status-pill'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

function humanizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function copyText(t: string) { navigator.clipboard.writeText(t); toast.success('Copied') }

export function JsonView({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return <span className="text-slate-500">—</span>
  if (typeof data === 'string') {
    const long = data.length > 150
    return (
      <div className={cn('relative', long && 'rounded-md border border-slate-800 bg-slate-900/60 p-3 pr-8')}>
        {long && (
          <button onClick={() => copyText(data)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-200">
            <Copy className="h-3 w-3" />
          </button>
        )}
        <p className={cn(long ? 'whitespace-pre-wrap text-sm text-slate-200' : 'text-sm text-slate-200')}>{data}</p>
      </div>
    )
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span className="font-mono-data text-emerald-300">{String(data)}</span>
  }
  if (Array.isArray(data)) {
    if (data.every((d) => typeof d === 'string' || typeof d === 'number')) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(data as Array<string | number>).map((s, i) => <StatusPill key={i} tone="neutral">{String(s)}</StatusPill>)}
        </div>
      )
    }
    return (
      <ul className={cn('space-y-2', depth === 0 && 'mt-1')}>
        {data.map((item, i) => (
          <li key={i} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
            <JsonView data={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    )
  }
  // Object
  const entries = Object.entries(data as Record<string, unknown>)
  return (
    <dl className={cn('space-y-3', depth === 0 && 'mt-0')}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{humanizeKey(k)}</dt>
          <dd><JsonView data={v} depth={depth + 1} /></dd>
        </div>
      ))}
    </dl>
  )
}
