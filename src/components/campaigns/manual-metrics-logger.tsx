'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, TrendingUp } from 'lucide-react'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import {
  aggregateRows, deriveMetrics, rollupByChannel,
  formatMoney, formatPct, formatNumber,
} from '@/lib/metrics/derive'

interface MetricRow {
  id: string
  date: string
  channel: string
  impressions: number
  clicks: number
  conversions: number
  spend: number | string
  revenue: number | string
  metadata: { notes?: string } | null
}

// Today's date in YYYY-MM-DD without timezone surprises. Used as the
// default form value so quick entry is one click.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface ManualMetricsLoggerProps {
  campaignId: string
  channels: string[]
}

export function ManualMetricsLogger({ campaignId, channels }: ManualMetricsLoggerProps) {
  const [rows, setRows] = useState<MetricRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const channelOptions = useMemo(() => {
    const set = new Set<string>(channels.length ? channels : ['meta', 'linkedin', 'twitter', 'email', 'blog', 'landing'])
    rows.forEach((r) => set.add(r.channel))
    return Array.from(set)
  }, [channels, rows])

  const [form, setForm] = useState({
    date: todayIso(),
    channel: channelOptions[0] ?? 'meta',
    impressions: '',
    clicks: '',
    conversions: '',
    spend: '',
    revenue: '',
    notes: '',
  })

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/metrics`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Failed to load metrics')
      }
      const body = (await res.json()) as { metrics: MetricRow[] }
      setRows(body.metrics)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          channel: form.channel,
          impressions: Number(form.impressions) || 0,
          clicks: Number(form.clicks) || 0,
          conversions: Number(form.conversions) || 0,
          spend: Number(form.spend) || 0,
          revenue: Number(form.revenue) || 0,
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Failed to save')
      }
      const body = (await res.json()) as { action: 'created' | 'updated' }
      toast.success(body.action === 'updated' ? 'Updated daily metric' : 'Saved daily metric')
      setForm((prev) => ({ ...prev, impressions: '', clicks: '', conversions: '', spend: '', revenue: '', notes: '' }))
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rowId: string) {
    if (!confirm('Delete this metrics row?')) return
    const res = await fetch(`/api/campaigns/${campaignId}/metrics?rowId=${rowId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(err.error ?? 'Failed to delete')
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== rowId))
  }

  // Normalize numeric Supabase columns (numeric → string at JSON time).
  const normalized = useMemo(
    () => rows.map((r) => ({
      ...r,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      conversions: Number(r.conversions) || 0,
      spend: Number(r.spend) || 0,
      revenue: Number(r.revenue) || 0,
    })),
    [rows],
  )

  const totals = aggregateRows(normalized)
  const channelTotals = rollupByChannel(normalized)

  return (
    <SectionPanel
      title={
        <span className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Metrics Logger
          {rows.length > 0 && <StatusPill tone="neutral">{rows.length} entries</StatusPill>}
        </span>
      }
    >
      <form onSubmit={handleSave} className="grid grid-cols-2 gap-2 md:grid-cols-8 mb-4">
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
          required
        />
        <select
          value={form.channel}
          onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
        >
          {channelOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <NumberInput placeholder="Impr." value={form.impressions} onChange={(v) => setForm((p) => ({ ...p, impressions: v }))} />
        <NumberInput placeholder="Clicks" value={form.clicks} onChange={(v) => setForm((p) => ({ ...p, clicks: v }))} />
        <NumberInput placeholder="Conv." value={form.conversions} onChange={(v) => setForm((p) => ({ ...p, conversions: v }))} />
        <NumberInput placeholder="Spend $" value={form.spend} onChange={(v) => setForm((p) => ({ ...p, spend: v }))} step="0.01" />
        <NumberInput placeholder="Revenue $" value={form.revenue} onChange={(v) => setForm((p) => ({ ...p, revenue: v }))} step="0.01" />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          <Plus className="h-3 w-3" /> {saving ? 'Saving…' : 'Log'}
        </button>
        <input
          type="text"
          placeholder="Optional notes (source, paused at $X, etc.)"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          className="md:col-span-8 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600"
        />
      </form>

      {rows.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Kpi label="Spend" value={formatMoney(totals.spend)} />
            <Kpi label="Revenue" value={formatMoney(totals.revenue)} />
            <Kpi label="CTR" value={formatPct(totals.ctr)} />
            <Kpi label="Conv. rate" value={formatPct(totals.conversion_rate)} />
            <Kpi label="ROAS" value={totals.roas != null ? totals.roas.toFixed(2) + 'x' : '—'} />
          </div>

          {channelTotals.length > 1 && (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="border-b border-slate-800 py-1 pr-3">Channel</th>
                    <th className="border-b border-slate-800 py-1 pr-3 text-right">Impr.</th>
                    <th className="border-b border-slate-800 py-1 pr-3 text-right">Clicks</th>
                    <th className="border-b border-slate-800 py-1 pr-3 text-right">Conv.</th>
                    <th className="border-b border-slate-800 py-1 pr-3 text-right">Spend</th>
                    <th className="border-b border-slate-800 py-1 pr-3 text-right">CTR</th>
                    <th className="border-b border-slate-800 py-1 pr-3 text-right">CPL</th>
                    <th className="border-b border-slate-800 py-1 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {channelTotals.map((r) => (
                    <tr key={r.channel}>
                      <td className="border-b border-slate-900 py-1 pr-3 font-mono-data text-slate-200">{r.channel}</td>
                      <td className="border-b border-slate-900 py-1 pr-3 text-right text-slate-300">{formatNumber(r.impressions)}</td>
                      <td className="border-b border-slate-900 py-1 pr-3 text-right text-slate-300">{formatNumber(r.clicks)}</td>
                      <td className="border-b border-slate-900 py-1 pr-3 text-right text-slate-300">{formatNumber(r.conversions)}</td>
                      <td className="border-b border-slate-900 py-1 pr-3 text-right text-slate-300">{formatMoney(r.spend)}</td>
                      <td className="border-b border-slate-900 py-1 pr-3 text-right text-slate-400">{formatPct(r.ctr)}</td>
                      <td className="border-b border-slate-900 py-1 pr-3 text-right text-slate-400">{formatMoney(r.cpl)}</td>
                      <td className="border-b border-slate-900 py-1 text-right text-emerald-300">{r.roas != null ? r.roas.toFixed(2) + 'x' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          No metrics logged yet. Log a row above to start tracking CTR, conversion rate, CPL, and ROAS.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {normalized.slice(0, 40).map((r) => {
            const d = deriveMetrics(r)
            return (
              <li key={r.id} className="grid grid-cols-2 items-center gap-2 px-1 py-1.5 md:grid-cols-9 text-xs">
                <span className="font-mono-data text-slate-400">{r.date}</span>
                <span className="text-slate-200">{r.channel}</span>
                <span className="text-right text-slate-300">{formatNumber(r.impressions)} impr.</span>
                <span className="text-right text-slate-300">{formatNumber(r.clicks)} clicks</span>
                <span className="text-right text-slate-300">{formatNumber(r.conversions)} conv.</span>
                <span className="text-right text-slate-300">{formatMoney(r.spend)}</span>
                <span className="text-right text-slate-400">{formatPct(d.ctr, 1)} CTR</span>
                <span className="text-right text-emerald-300">{d.roas != null ? d.roas.toFixed(2) + 'x' : '—'}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  className="justify-self-end text-slate-500 hover:text-rose-400"
                  title="Delete row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </SectionPanel>
  )
}

function NumberInput({
  value, onChange, placeholder, step,
}: { value: string; onChange: (v: string) => void; placeholder: string; step?: string }) {
  return (
    <input
      type="number"
      step={step}
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600"
    />
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
      <div className="font-mono-data text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono-data text-sm text-slate-100">{value}</div>
    </div>
  )
}
