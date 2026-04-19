'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Sparkline } from '@/components/ui/sparkline'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Mail, Sparkles, Upload, Globe, List, LayoutGrid } from 'lucide-react'

interface Lead {
  id: string
  email: string
  name: string | null
  source: string | null
  score: number
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

const STATUS_COLUMNS = ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost'] as const

export default function LeadsPage() {
  const { activeProject } = useProject()
  const supabase = createClient()

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (activeProject) fetchLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  async function fetchLeads() {
    if (!activeProject) return
    setLoading(true)
    const { data } = await supabase.from('leads').select('*').eq('project_id', activeProject.id).order('score', { ascending: false })
    setLeads((data as Lead[]) ?? [])
    setLoading(false)
  }

  async function createLead(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated'); setCreating(false); return }
    const { error } = await supabase.from('leads').insert({
      user_id: user.id, project_id: activeProject.id,
      email, name: name || null, source: source || 'manual', score: 10,
    })
    if (error) toast.error(error.message)
    else { toast.success('Lead added'); setOpen(false); setEmail(''); setName(''); setSource(''); fetchLeads() }
    setCreating(false)
  }

  async function updateStatus(id: string, status: string) {
    const updates: Record<string, unknown> = { status }
    if (status === 'converted') updates.converted_at = new Date().toISOString()
    const { error } = await supabase.from('leads').update(updates).eq('id', id)
    if (error) toast.error(error.message); else fetchLeads()
  }

  async function deleteLead(id: string) {
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchLeads() }
  }

  const estimatedMRR = leads.reduce((sum, l) => sum + (l.score * 100), 0)
  const pipelineData = STATUS_COLUMNS.map((s) => leads.filter((l) => l.status === s).length)

  if (!activeProject) {
    return <PageShell><p className="text-slate-400">Select a project</p></PageShell>
  }

  return (
    <PageShell>
      <PageHeader
        title="Lead Pipeline"
        subtitle={
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono-data text-xs uppercase tracking-wider">{leads.length} active records</span>
          </span>
        }
        actions={
          <>
            <div className="flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${view === 'list' ? 'bg-slate-700 text-slate-100' : 'text-slate-400'}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setView('kanban')}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${view === 'kanban' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban View
              </button>
            </div>
            <Link href="/leads/pages" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
              <Globe className="h-3.5 w-3.5" /> Landing Pages
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                  <Upload className="h-3.5 w-3.5" /> Import Leads
                </div>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Add a lead</DialogTitle></DialogHeader>
                <form onSubmit={createLead} className="space-y-3">
                  <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <input placeholder="Source (e.g. landing_page, ad, organic)" value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" disabled={creating} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {creating ? 'Adding...' : 'Add Lead'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-6 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} className="h-64 rounded-md bg-slate-800/60" />)}
        </div>
      ) : view === 'kanban' ? (
        <>
          <div className="grid grid-cols-6 gap-3 overflow-x-auto mb-6">
            {STATUS_COLUMNS.map((status) => {
              const col = leads.filter((l) => l.status === status)
              return (
                <div key={status} className="min-w-[180px]">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <StatusPill status={status}>{status}</StatusPill>
                    <span className="font-mono-data text-[10px] text-slate-500">{String(col.length).padStart(2, '0')}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((lead) => {
                      const prob = Math.min(100, lead.score + 20)
                      const value = lead.score * 150
                      return (
                        <div key={lead.id} className={`rounded-md border p-3 ${status === 'qualified' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-sm font-semibold text-slate-100 truncate">{lead.name || lead.email}</h3>
                            <Mail className="h-3 w-3 text-slate-500 shrink-0" />
                          </div>
                          <div className="flex items-center gap-1 mb-2">
                            <StatusPill tone={prob >= 90 ? 'success' : prob >= 70 ? 'info' : 'warn'}>{prob}% PROB</StatusPill>
                            {lead.source === 'ai' && <StatusPill tone="accent"><Sparkles className="h-2.5 w-2.5" />AI</StatusPill>}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono-data text-slate-300">${value.toLocaleString()}</span>
                            <Select value={lead.status} onValueChange={(v) => v && updateStatus(lead.id, v)}>
                              <SelectTrigger className="h-6 w-20 border-slate-700 bg-slate-800 text-[10px] text-slate-400"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUS_COLUMNS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SectionPanel title="Pipeline Velocity">
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1">
                  <Sparkline data={pipelineData} className="h-12" />
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Estimated MRR</div>
                  <div className="font-mono-data text-xl font-semibold text-slate-100">${estimatedMRR.toLocaleString()}</div>
                  <div className="font-mono-data text-[10px] text-emerald-400">+12.4% vs last mo</div>
                </div>
              </div>
            </SectionPanel>

            <SectionPanel className="border-emerald-500/40" title={<span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-emerald-400" /> Growth Intelligence</span>}>
              <p className="text-xs text-slate-400 mb-3">
                3 high-intent leads from &quot;New&quot; are showing patterns similar to converted &quot;Zenith Tech&quot;. Prioritize immediate outreach.
              </p>
              <button className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:text-emerald-300">
                Execute AI Workflow →
              </button>
            </SectionPanel>
          </div>
        </>
      ) : (
        <SectionPanel title={`All Leads · ${leads.length}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 font-mono-data text-emerald-400">{lead.score}</td>
                    <td className="px-3 py-2 text-slate-100">{lead.name || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{lead.email}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{lead.source || '—'}</td>
                    <td className="px-3 py-2">
                      <Select value={lead.status} onValueChange={(v) => v && updateStatus(lead.id, v)}>
                        <SelectTrigger className="h-7 w-28 border-slate-700 bg-slate-800 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_COLUMNS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => deleteLead(lead.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      )}
    </PageShell>
  )
}
