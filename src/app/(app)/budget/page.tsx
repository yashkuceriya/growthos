'use client'

import { useEffect, useState, useMemo } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DollarSign, Plus, Trash2, TrendingDown } from 'lucide-react'

interface Campaign { id: string; name: string }
interface BudgetAllocation { id: string; campaign_id: string; channel: string; planned_amount: number; period_start: string; period_end: string }
interface BudgetExpense { id: string; allocation_id: string; amount: number; description: string | null; date: string }

const PIE = ['#34d399', '#059669', '#06b6d4', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#f97316']

export default function BudgetPage() {
  const { activeProject } = useProject()
  const supabase = createClient()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([])
  const [expenses, setExpenses] = useState<BudgetExpense[]>([])
  const [loading, setLoading] = useState(true)

  const [aOpen, setAOpen] = useState(false)
  const [aCampaign, setACampaign] = useState('')
  const [aChannel, setAChannel] = useState('')
  const [aAmount, setAAmount] = useState('')
  const [aPeriodStart, setAPeriodStart] = useState('')
  const [aPeriodEnd, setAPeriodEnd] = useState('')
  const [aCreating, setACreating] = useState(false)

  const [eOpen, setEOpen] = useState(false)
  const [eAllocation, setEAllocation] = useState('')
  const [eAmount, setEAmount] = useState('')
  const [eDesc, setEDesc] = useState('')
  const [eDate, setEDate] = useState('')
  const [eCreating, setECreating] = useState(false)

  useEffect(() => { if (activeProject) fetchAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject?.id])

  async function fetchAll() {
    if (!activeProject) return
    setLoading(true)
    const { data: campData } = await supabase.from('campaigns').select('id, name').eq('project_id', activeProject.id).order('created_at', { ascending: false })
    const camps = (campData as Campaign[]) ?? []
    setCampaigns(camps)
    const ids = camps.map((c) => c.id)
    if (ids.length > 0) {
      const allocRes = await supabase.from('budget_allocations').select('*').in('campaign_id', ids).order('created_at', { ascending: false })
      const allocIds = ((allocRes.data as BudgetAllocation[]) ?? []).map((a) => a.id)
      const expRes = allocIds.length ? await supabase.from('budget_expenses').select('*').in('allocation_id', allocIds).order('date', { ascending: false }) : { data: [] }
      setAllocations((allocRes.data as BudgetAllocation[]) ?? [])
      setExpenses((expRes.data as BudgetExpense[]) ?? [])
    } else {
      setAllocations([]); setExpenses([])
    }
    setLoading(false)
  }

  const spentByAlloc = useMemo(() => {
    const m: Record<string, number> = {}
    expenses.forEach((e) => { m[e.allocation_id] = (m[e.allocation_id] || 0) + (e.amount || 0) })
    return m
  }, [expenses])

  const totalAllocated = useMemo(() => allocations.reduce((s, a) => s + (a.planned_amount || 0), 0), [allocations])
  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses])
  const remaining = totalAllocated - totalSpent

  const spendByChannel = useMemo(() => {
    const m: Record<string, number> = {}
    allocations.forEach((a) => {
      const sp = spentByAlloc[a.id] || 0
      if (sp > 0) m[a.channel] = (m[a.channel] || 0) + sp
    })
    return Object.entries(m).map(([name, value]) => ({ name, value: +value.toFixed(2) }))
  }, [allocations, spentByAlloc])

  const campaignName = (id: string) => campaigns.find((c) => c.id === id)?.name ?? 'Unknown'

  async function createAllocation(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setACreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setACreating(false); return }
    const { error } = await supabase.from('budget_allocations').insert({
      user_id: user.id, campaign_id: aCampaign, channel: aChannel,
      planned_amount: parseFloat(aAmount), period_start: aPeriodStart, period_end: aPeriodEnd,
    })
    if (error) toast.error(error.message)
    else { toast.success('Allocation created'); setAOpen(false); setACampaign(''); setAChannel(''); setAAmount(''); setAPeriodStart(''); setAPeriodEnd(''); fetchAll() }
    setACreating(false)
  }

  async function createExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setECreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setECreating(false); return }
    const { error } = await supabase.from('budget_expenses').insert({
      user_id: user.id, allocation_id: eAllocation, amount: parseFloat(eAmount),
      description: eDesc || null, date: eDate,
    })
    if (error) toast.error(error.message)
    else { toast.success('Expense logged'); setEOpen(false); setEAllocation(''); setEAmount(''); setEDesc(''); setEDate(''); fetchAll() }
    setECreating(false)
  }

  async function deleteAllocation(id: string) {
    const { error } = await supabase.from('budget_allocations').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchAll() }
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Budget Tracker"
        subtitle="Allocations & spend tracking"
        actions={
          <>
            <Dialog open={eOpen} onOpenChange={setEOpen}>
              <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"><TrendingDown className="h-3.5 w-3.5" />Log Expense</div></DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Log Expense</DialogTitle></DialogHeader>
                <form onSubmit={createExpense} className="space-y-3">
                  <select required value={eAllocation} onChange={(ev) => setEAllocation(ev.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="">Select allocation</option>
                    {allocations.map((a) => <option key={a.id} value={a.id}>{campaignName(a.campaign_id)} — {a.channel} (${a.planned_amount})</option>)}
                  </select>
                  <input required type="number" step="0.01" placeholder="Amount" value={eAmount} onChange={(e) => setEAmount(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <input placeholder="Description" value={eDesc} onChange={(e) => setEDesc(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <input required type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" disabled={eCreating || !eAllocation} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {eCreating ? 'Saving…' : 'Log Expense'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={aOpen} onOpenChange={setAOpen}>
              <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"><Plus className="h-3.5 w-3.5" />New Allocation</div></DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Create Allocation</DialogTitle></DialogHeader>
                <form onSubmit={createAllocation} className="space-y-3">
                  <select required value={aCampaign} onChange={(e) => setACampaign(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="">Select campaign</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select required value={aChannel} onChange={(e) => setAChannel(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="">Select channel</option>
                    <option value="facebook">Facebook</option>
                    <option value="google">Google</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="twitter">Twitter / X</option>
                    <option value="instagram">Instagram</option>
                    <option value="email">Email</option>
                    <option value="content">Content / SEO</option>
                    <option value="other">Other</option>
                  </select>
                  <input required type="number" step="0.01" placeholder="Planned Amount" value={aAmount} onChange={(e) => setAAmount(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <div className="grid grid-cols-2 gap-3">
                    <input required type="date" value={aPeriodStart} onChange={(e) => setAPeriodStart(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
                    <input required type="date" value={aPeriodEnd} onChange={(e) => setAPeriodEnd(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
                  </div>
                  <button type="submit" disabled={aCreating || !aCampaign || !aChannel} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {aCreating ? 'Creating…' : 'Create Allocation'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {loading ? <SectionPanel>Loading…</SectionPanel> : allocations.length === 0 ? (
        <SectionPanel><div className="flex flex-col items-center py-16"><DollarSign className="h-12 w-12 text-slate-600 mb-3" /><p className="text-sm text-slate-400">Create budget allocations to start tracking spend.</p></div></SectionPanel>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Total Allocated', value: `$${totalAllocated.toFixed(2)}`, tone: 'success' as const },
              { label: 'Total Spent', value: `$${totalSpent.toFixed(2)}`, tone: 'warn' as const },
              { label: 'Remaining', value: `$${Math.abs(remaining).toFixed(2)}${remaining < 0 ? ' over' : ''}`, tone: (remaining >= 0 ? 'success' : 'error') as 'success' | 'error' },
            ].map((k) => (
              <div key={k.label} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</span>
                  <StatusPill tone={k.tone}>{k.tone.toUpperCase()}</StatusPill>
                </div>
                <div className="font-mono-data text-2xl font-semibold text-slate-100">{k.value}</div>
              </div>
            ))}
            <SectionPanel title="Spend by Channel" contentClassName="p-2">
              {spendByChannel.length === 0 ? (
                <p className="py-4 text-center text-[10px] text-slate-500">No spend yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={90}>
                  <PieChart>
                    <Pie data={spendByChannel} cx="50%" cy="50%" innerRadius={24} outerRadius={40} paddingAngle={2} dataKey="value">
                      {spendByChannel.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', fontSize: '11px' }} formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Spent']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionPanel>
          </div>

          <SectionPanel title="Allocations" contentClassName="p-0">
            <ul className="divide-y divide-slate-800">
              {allocations.map((a) => {
                const sp = spentByAlloc[a.id] || 0
                const rem = a.planned_amount - sp
                const pct = a.planned_amount > 0 ? Math.min((sp / a.planned_amount) * 100, 100) : 0
                const over = sp > a.planned_amount
                return (
                  <li key={a.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-100">{campaignName(a.campaign_id)}</span>
                        <StatusPill tone="neutral">{a.channel}</StatusPill>
                        {over && <StatusPill tone="error">Over Budget</StatusPill>}
                        <span className="font-mono-data text-[10px] text-slate-500">{a.period_start} → {a.period_end}</span>
                      </div>
                      <button onClick={() => deleteAllocation(a.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-xs mb-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Planned</div>
                        <div className="font-mono-data text-slate-100">${a.planned_amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Spent</div>
                        <div className={`font-mono-data ${over ? 'text-rose-400' : 'text-slate-100'}`}>${sp.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Remaining</div>
                        <div className={`font-mono-data ${rem >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${Math.abs(rem).toFixed(2)}{rem < 0 ? ' over' : ''}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Usage</div>
                        <div className="font-mono-data text-slate-100">{pct.toFixed(0)}%</div>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className={over ? 'h-full bg-rose-400' : pct > 80 ? 'h-full bg-amber-400' : 'h-full bg-emerald-400'} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </SectionPanel>
        </>
      )}
    </PageShell>
  )
}
