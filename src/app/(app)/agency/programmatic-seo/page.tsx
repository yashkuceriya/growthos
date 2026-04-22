'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { JsonView } from '@/components/ui/json-viewer'
import { LayoutTemplate, FilePlus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ProgrammaticSEOPage() {
  const { activeProject } = useProject()
  const [seedIdea, setSeedIdea] = useState('')
  const [valuesJson, setValuesJson] = useState('')
  const [running, setRunning] = useState(false)
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null)
  const [pages, setPages] = useState<unknown>(null)

  async function designTemplate() {
    if (!activeProject || !seedIdea) return
    setRunning(true)
    try {
      const res = await fetch('/api/agency/programmatic-seo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, tool: 'design_template', input: { seed_idea: seedIdea } }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setTemplate(json.result)
      toast.success('Template designed')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setRunning(false)
  }

  async function generatePages() {
    if (!activeProject || !template) return
    let values: unknown[] = []
    try { values = JSON.parse(valuesJson || '[]') } catch { toast.error('Values JSON invalid'); return }
    setRunning(true)
    try {
      const res = await fetch('/api/agency/programmatic-seo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, tool: 'generate_pages', input: { template, values } }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setPages(json.result)
      toast.success('Pages generated & saved to Content Workshop')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setRunning(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  return (
    <PageShell>
      <PageHeader title="Programmatic SEO" subtitle="Design a page template once. Generate 20-100 pages with structured-same / content-different scaffolding." />

      <SectionPanel className="mb-4" title={<span className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-emerald-400" />Step 1 · Design Template</span>}>
        <p className="text-xs text-slate-400 mb-2">Seed ideas: &quot;best [competitor] alternatives for [segment]&quot;, &quot;[city] [service] near me&quot;, &quot;[language] tutorial for [use case]&quot;, &quot;best [category] tools for [role]&quot;.</p>
        <div className="flex gap-2">
          <input value={seedIdea} onChange={(e) => setSeedIdea(e.target.value)} placeholder="Seed idea" className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
          <button onClick={designTemplate} disabled={running || !seedIdea} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Design Template'}
          </button>
        </div>
      </SectionPanel>

      {template && (
        <>
          <SectionPanel className="mb-4 border-emerald-500/30" title={`Template · ${template.template_name as string}`}>
            <div className="flex flex-wrap gap-2 mb-3">
              <StatusPill tone="accent">URL: {template.url_pattern as string}</StatusPill>
              <StatusPill tone="neutral">{template.variables_grid_size as string}</StatusPill>
            </div>
            <JsonView data={template} />
          </SectionPanel>

          <SectionPanel className="mb-4" title={<span className="flex items-center gap-2"><FilePlus className="h-4 w-4 text-emerald-400" />Step 2 · Generate Pages</span>}>
            <p className="text-xs text-slate-400 mb-2">Paste a JSON array of variable sets. Each object = one page. Max 10 per run.</p>
            <textarea rows={6} value={valuesJson} onChange={(e) => setValuesJson(e.target.value)} placeholder='[{"competitor":"Huntr","segment":"new grads"}, {"competitor":"Teal","segment":"career switchers"}]' className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
            <button onClick={generatePages} disabled={running || !valuesJson} className="mt-2 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate Pages'}
            </button>
          </SectionPanel>
        </>
      )}

      {pages !== null && (
        <SectionPanel title="Generated Pages (saved to Content Workshop)">
          <JsonView data={pages} />
        </SectionPanel>
      )}
    </PageShell>
  )
}
