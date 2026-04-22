'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Mic, Plus, Trash2, Save, Loader2, Sparkles, Clipboard } from 'lucide-react'

interface StyleRef { id: string; asset_kind: string; asset_content: string; why_good: string | null; metric_proof: string | null; created_at: string }

export default function VoicePage() {
  const [samples, setSamples] = useState<string[]>([''])
  const [styleNotes, setStyleNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refs, setRefs] = useState<StyleRef[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')

  function applyBulk() {
    // Split on blank lines OR explicit --- separator OR numbered list items
    const chunks = bulkText
      .split(/\n\s*(?:---+|\d+[\.\)]\s*)?\n+/)
      .map((c) => c.replace(/^\s*\d+[\.\)]\s*/, '').trim())
      .filter((c) => c.length > 10 && c.length < 2000)
    if (chunks.length === 0) { toast.error('Could not find samples. Separate them with blank lines.'); return }
    // Merge with existing non-empty samples
    const existing = samples.filter((s) => s.trim().length > 0)
    setSamples([...existing, ...chunks])
    setBulkText('')
    setBulkOpen(false)
    toast.success(`Added ${chunks.length} samples`)
  }

  async function load() {
    setLoading(true)
    const [v, r] = await Promise.all([
      fetch('/api/agency/founder-voice').then((x) => x.json()),
      fetch('/api/agency/style-refs').then((x) => x.json()),
    ])
    setSamples(v.samples?.length ? v.samples : [''])
    setStyleNotes(v.style_notes ?? '')
    setRefs(r.refs ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const filtered = samples.map((s) => s.trim()).filter(Boolean)
      const res = await fetch('/api/agency/founder-voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: filtered, style_notes: styleNotes }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success(`Saved ${filtered.length} samples`)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setSaving(false)
  }

  async function deleteRef(id: string) {
    const res = await fetch('/api/agency/style-refs', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toast.success('Removed'); load() }
  }

  return (
    <PageShell>
      <PageHeader
        title="Founder Voice & Style References"
        subtitle="Train your tone into every strategic output. Paste tweets, writing samples, and mark proven assets."
      />

      <SectionPanel className="mb-4" title={<span className="flex items-center gap-2"><Mic className="h-4 w-4 text-emerald-400" />Your Writing Samples</span>}>
        <p className="text-xs text-slate-400 mb-3">Paste 5-20 of your best tweets, posts, essay paragraphs. AI uses these to match your cadence + phrasing.</p>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
          <>
            <div className="space-y-2">
              {samples.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <textarea value={s} onChange={(e) => { const next = [...samples]; next[i] = e.target.value; setSamples(next) }} rows={3} placeholder="Paste a tweet, LinkedIn post, or writing sample…" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  {samples.length > 1 && (
                    <button onClick={() => setSamples(samples.filter((_, j) => j !== i))} className="rounded-md border border-slate-700 bg-slate-800 px-2 text-slate-400 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setSamples([...samples, ''])} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/60"><Plus className="h-3.5 w-3.5" />Add Sample</button>
              <button onClick={() => setBulkOpen(!bulkOpen)} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"><Clipboard className="h-3.5 w-3.5" />Bulk Paste</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>

            {bulkOpen && (
              <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs text-slate-300 mb-2">
                  Paste all tweets/posts at once. Separate each with a blank line or a <code className="font-mono-data text-emerald-300">---</code> line. Numbered lists (<code className="font-mono-data text-emerald-300">1.</code>, <code className="font-mono-data text-emerald-300">2.</code>) are auto-stripped.
                </p>
                <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={10} placeholder={'First tweet goes here...\n\nSecond tweet goes here...\n\n---\n\nThird tweet...'} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none font-mono-data" />
                <div className="mt-2 flex gap-2">
                  <button onClick={applyBulk} disabled={!bulkText.trim()} className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">Split & Add</button>
                  <button onClick={() => { setBulkText(''); setBulkOpen(false) }} className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/60">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionPanel>

      <SectionPanel className="mb-4" title="Style Notes (optional)">
        <p className="text-xs text-slate-400 mb-2">E.g. &quot;short sentences; no emojis; never uses exclamation points; uses dashes for pauses&quot;</p>
        <textarea value={styleNotes} onChange={(e) => setStyleNotes(e.target.value)} rows={3} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none resize-none" />
      </SectionPanel>

      <SectionPanel title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" />Winning Asset Library ({refs.length})</span>}>
        <p className="text-xs text-slate-400 mb-3">Assets you&apos;ve marked as winners. Auto-used as style references for future generations of the same kind.</p>
        {refs.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No winners yet. Click the star icon on any generated output to save it here.</p>
        ) : (
          <ul className="space-y-2">
            {refs.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-800 bg-slate-800/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StatusPill tone="accent">{r.asset_kind}</StatusPill>
                    {r.metric_proof && <StatusPill tone="success">{r.metric_proof}</StatusPill>}
                  </div>
                  <button onClick={() => deleteRef(r.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-200">{r.asset_content}</pre>
                {r.why_good && <p className="mt-2 text-[11px] italic text-slate-500">Why it worked: {r.why_good}</p>}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    </PageShell>
  )
}
