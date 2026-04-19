'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Campaign {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
  channels: string[]
  budget_planned: number | null
  start_date: string | null
  end_date: string | null
  created_at: string
}

const CHANNELS = ['paid_ads', 'email', 'social', 'content', 'seo']
const FILTERS = ['all', 'active', 'paused', 'completed', 'draft'] as const

export default function CampaignsPage() {
  const { activeProject } = useProject()
  const supabase = createClient()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<typeof FILTERS[number]>('all')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('draft')
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (activeProject) fetchCampaigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  async function fetchCampaigns() {
    if (!activeProject) return
    setLoading(true)
    const { data } = await supabase.from('campaigns').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false })
    setCampaigns(data ?? [])
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated'); setCreating(false); return }
    const { error } = await supabase.from('campaigns').insert({
      user_id: user.id, project_id: activeProject.id, name,
      description: description || null, status: status as Campaign['status'],
      channels: selectedChannels, budget_planned: budget ? parseFloat(budget) : null,
      start_date: startDate || null, end_date: endDate || null,
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Campaign created'); await fetchCampaigns()
      setOpen(false); setName(''); setDescription(''); setStatus('draft')
      setSelectedChannels([]); setBudget(''); setStartDate(''); setEndDate('')
    }
    setCreating(false)
  }

  function toggleChannel(ch: string) {
    setSelectedChannels((p) => p.includes(ch) ? p.filter((c) => c !== ch) : [...p, ch])
  }

  const filtered = filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter)

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Campaigns"
        subtitle={`Marketing campaigns for ${activeProject.name}`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                <Plus className="h-3.5 w-3.5" /> New Campaign
              </div>
            </DialogTrigger>
            <DialogContent className="border-slate-700 bg-slate-900 max-w-lg">
              <DialogHeader><DialogTitle className="text-slate-100">Create campaign</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <input required placeholder="Campaign name (e.g. Q2 Product Launch)" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Channels</div>
                  <div className="flex flex-wrap gap-1.5">
                    {CHANNELS.map((ch) => (
                      <button key={ch} type="button" onClick={() => toggleChannel(ch)} className={cn('rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider', selectedChannels.includes(ch) ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-slate-100')}>
                        {ch.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
                </div>
                <input type="number" step="0.01" placeholder="Budget USD" value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <button type="submit" disabled={creating} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create campaign'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5 w-fit">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider', filter === f ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200')}>
            {f} {f !== 'all' && `(${campaigns.filter((c) => c.status === f).length})`}
          </button>
        ))}
      </div>

      <SectionPanel contentClassName="p-0">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Megaphone className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No campaigns yet. Create one to get started.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Channels</th>
                <th className="px-4 py-2.5 text-right">Budget</th>
                <th className="px-4 py-2.5 text-left">Start</th>
                <th className="px-4 py-2.5 text-left">End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-100">{c.name}</div>
                    {c.description && <div className="text-xs text-slate-500 truncate max-w-xs">{c.description}</div>}
                  </td>
                  <td className="px-4 py-2.5"><StatusPill status={c.status}>{c.status}</StatusPill></td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.channels.map((ch) => <StatusPill key={ch} tone="neutral">{ch.replace('_', ' ')}</StatusPill>)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-data text-slate-300">{c.budget_planned ? `$${c.budget_planned.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-2.5 font-mono-data text-slate-400">{c.start_date ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-data text-slate-400">{c.end_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionPanel>
    </PageShell>
  )
}
