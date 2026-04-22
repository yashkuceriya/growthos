'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Bug, Loader2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Issue { severity: 'critical' | 'warn' | 'info'; category: string; url: string; finding: string; fix: string }
interface Page { url: string; status: number; load_time_ms: number; title: string | null; title_length: number; meta_description: string | null; meta_description_length: number; h1_count: number; word_count: number; images_total: number; images_missing_alt: number; links_internal: number; links_external: number; has_jsonld: boolean; jsonld_types: string[]; noindex: boolean; is_https: boolean; canonical: string | null }
interface Audit { base_url: string; pages_crawled: number; pages: Page[]; issues: Issue[]; summary: Record<string, number>; started_at: string; finished_at: string }

export default function SeoAuditPage() {
  const { activeProject } = useProject()
  const [running, setRunning] = useState(false)
  const [maxPages, setMaxPages] = useState(15)
  const [result, setResult] = useState<Audit | null>(null)
  const [openPage, setOpenPage] = useState<number | null>(null)
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warn' | 'info'>('all')

  async function run() {
    if (!activeProject) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/agency/seo-audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, maxPages }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const json = await res.json()
      setResult(json)
      toast.success(`Crawled ${json.pages_crawled} pages · ${json.issues.length} issues`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    }
    setRunning(false)
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project first</p></PageShell>

  const criticalCount = result?.issues.filter((i) => i.severity === 'critical').length ?? 0
  const warnCount = result?.issues.filter((i) => i.severity === 'warn').length ?? 0
  const infoCount = result?.issues.filter((i) => i.severity === 'info').length ?? 0

  const filteredIssues = result?.issues.filter((i) => severityFilter === 'all' || i.severity === severityFilter) ?? []

  return (
    <PageShell>
      <PageHeader
        title="Technical SEO Audit"
        subtitle="Real crawl. Fetches sitemap + homepage links, checks titles, metas, H1s, schema, OG, HTTPS, perf, alt text."
      />

      <SectionPanel className="mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-300 mb-1">Audit <span className="font-semibold text-emerald-300">{activeProject.website?.replace(/^https?:\/\//, '') ?? 'no website set'}</span></p>
            <p className="text-xs text-slate-500">Discovers URLs from sitemap.xml + homepage links. Runs on-page SEO checks, flags issues by severity, surfaces fixes.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Max pages</label>
            <input type="number" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} min={1} max={25} className="w-20 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
            <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
              {running ? 'Crawling…' : 'Run Audit'}
            </button>
          </div>
        </div>
      </SectionPanel>

      {result && (
        <>
          <div className="grid grid-cols-6 gap-3 mb-4">
            <StatBox label="Pages Crawled" value={result.pages_crawled} />
            <StatBox label="Avg Load ms" value={result.summary.avg_load_ms} />
            <StatBox label="Critical" value={criticalCount} tone="error" />
            <StatBox label="Warnings" value={warnCount} tone="warn" />
            <StatBox label="Info" value={infoCount} tone="info" />
            <StatBox label="Total Issues" value={result.issues.length} />
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <StatBox label="Missing Title" value={result.summary.pages_missing_title} tone={result.summary.pages_missing_title > 0 ? 'error' : 'success'} />
            <StatBox label="Missing Meta Desc" value={result.summary.pages_missing_meta_description} tone={result.summary.pages_missing_meta_description > 0 ? 'warn' : 'success'} />
            <StatBox label="Missing H1" value={result.summary.pages_missing_h1} tone={result.summary.pages_missing_h1 > 0 ? 'error' : 'success'} />
            <StatBox label="Multiple H1" value={result.summary.pages_multiple_h1} tone={result.summary.pages_multiple_h1 > 0 ? 'warn' : 'success'} />
            <StatBox label="Thin Content" value={result.summary.pages_thin_content} tone={result.summary.pages_thin_content > 0 ? 'warn' : 'success'} />
            <StatBox label="Missing Schema" value={result.summary.pages_missing_schema} tone={result.summary.pages_missing_schema > 0 ? 'warn' : 'success'} />
            <StatBox label="Missing OG" value={result.summary.pages_missing_og} tone={result.summary.pages_missing_og > 0 ? 'warn' : 'success'} />
            <StatBox label="Alt Text Missing" value={result.summary.total_images_missing_alt} tone={result.summary.total_images_missing_alt > 0 ? 'warn' : 'success'} />
          </div>

          <SectionPanel className="mb-4"
            title={`Issues (${filteredIssues.length}/${result.issues.length})`}
            action={
              <div className="flex gap-1">
                {(['all', 'critical', 'warn', 'info'] as const).map((s) => (
                  <button key={s} onClick={() => setSeverityFilter(s)} className={cn('rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider', severityFilter === s ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200')}>{s}</button>
                ))}
              </div>
            }
            contentClassName="p-0"
          >
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-2 text-left w-20">Severity</th>
                    <th className="px-3 py-2 text-left w-28">Category</th>
                    <th className="px-3 py-2 text-left">Finding</th>
                    <th className="px-3 py-2 text-left">Fix</th>
                    <th className="px-3 py-2 text-left w-64">Page</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredIssues.map((i, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2"><StatusPill tone={i.severity === 'critical' ? 'error' : i.severity === 'warn' ? 'warn' : 'info'}>{i.severity}</StatusPill></td>
                      <td className="px-3 py-2 text-slate-300">{i.category}</td>
                      <td className="px-3 py-2 text-slate-200">{i.finding}</td>
                      <td className="px-3 py-2 text-emerald-300">{i.fix}</td>
                      <td className="px-3 py-2 font-mono-data text-[10px] text-slate-500 truncate max-w-[16rem]">
                        <a href={i.url} target="_blank" rel="noreferrer" className="hover:text-emerald-400 inline-flex items-center gap-1">
                          {new URL(i.url).pathname || '/'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>

          <SectionPanel title={`Page Details (${result.pages.length})`} contentClassName="p-0">
            <div className="divide-y divide-slate-800">
              {result.pages.map((p, i) => {
                const open = openPage === i
                const pageIssues = result.issues.filter((is) => is.url === p.url)
                return (
                  <div key={i}>
                    <button onClick={() => setOpenPage(open ? null : i)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 text-left">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <StatusPill tone={p.status === 200 ? 'success' : p.status < 400 ? 'warn' : 'error'}>{p.status}</StatusPill>
                        <span className="font-mono-data text-xs text-slate-300 truncate">{new URL(p.url).pathname || '/'}</span>
                        <span className="text-[10px] font-mono-data text-slate-500">{p.load_time_ms}ms · {p.word_count}w</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {pageIssues.length > 0 && <StatusPill tone="warn">{pageIssues.length} issues</StatusPill>}
                        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </div>
                    </button>
                    {open && (
                      <div className="bg-slate-950/50 px-4 pb-4 space-y-3">
                        <dl className="grid grid-cols-2 gap-2 text-xs">
                          <FieldRow label="Title" value={p.title ?? '—'} warn={p.title_length > 70 || !p.title} />
                          <FieldRow label="Title length" value={`${p.title_length} chars`} />
                          <FieldRow label="Meta description" value={p.meta_description ?? '—'} warn={!p.meta_description} />
                          <FieldRow label="Meta desc length" value={`${p.meta_description_length} chars`} />
                          <FieldRow label="H1 count" value={String(p.h1_count)} warn={p.h1_count !== 1} />
                          <FieldRow label="Canonical" value={p.canonical ?? '—'} />
                          <FieldRow label="Images (missing alt)" value={`${p.images_total} (${p.images_missing_alt} missing)`} warn={p.images_missing_alt > 0} />
                          <FieldRow label="Links (int/ext)" value={`${p.links_internal} / ${p.links_external}`} />
                          <FieldRow label="Schema" value={p.has_jsonld ? p.jsonld_types.join(', ') || 'present' : 'missing'} warn={!p.has_jsonld} />
                          <FieldRow label="HTTPS / noindex" value={`${p.is_https ? 'https' : 'http'} / ${p.noindex ? 'noindex' : 'indexable'}`} warn={!p.is_https || p.noindex} />
                        </dl>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionPanel>
        </>
      )}
    </PageShell>
  )
}

function StatBox({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'success' | 'warn' | 'error' | 'info' | 'neutral' }) {
  const toneClass = {
    success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    error: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    info: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300',
    neutral: 'border-slate-800 bg-slate-900/60 text-slate-200',
  }[tone]
  return (
    <div className={cn('rounded-md border p-3', toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 font-mono-data text-xl font-semibold">{value}</div>
    </div>
  )
}

function FieldRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('rounded px-2 py-1.5 border', warn ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-800 bg-slate-800/40')}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-0.5 truncate', warn ? 'text-amber-200' : 'text-slate-200')}>{value}</div>
    </div>
  )
}
