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
import { Plus, Mail, Users, Workflow, Sparkles, Loader2, Eye, Trash2, FileText, X, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmailTemplate { id: string; name: string; subject: string; body_html: string | null; category: string | null; created_at: string; is_winner: boolean; winner_score: number | null }
interface EmailList { id: string; name: string; description: string | null; subscriber_count: number }
interface EmailSequence { id: string; name: string; trigger_type: string; status: string }
interface EnrollmentStats { active: number; completed: number; failed: number; cancelled: number; next_due?: string | null }

type Tab = 'templates' | 'lists' | 'sequences'

export default function EmailPage() {
  const { activeProject } = useProject()
  const supabase = createClient()

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [lists, setLists] = useState<EmailList[]>([])
  const [sequences, setSequences] = useState<EmailSequence[]>([])
  const [enrollStats, setEnrollStats] = useState<Record<string, EnrollmentStats>>({})
  const [tab, setTab] = useState<Tab>('templates')
  const [loading, setLoading] = useState(true)

  const [tOpen, setTOpen] = useState(false)
  const [tName, setTName] = useState('')
  const [tSubject, setTSubject] = useState('')
  const [tBody, setTBody] = useState('')
  const [tCategory, setTCategory] = useState('')
  const [tCreating, setTCreating] = useState(false)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiPurpose, setAiPurpose] = useState('')
  const [aiAudience, setAiAudience] = useState('')
  const [aiType, setAiType] = useState('welcome')
  const [aiGenerating, setAiGenerating] = useState(false)

  const [lOpen, setLOpen] = useState(false)
  const [lName, setLName] = useState('')
  const [lDesc, setLDesc] = useState('')

  const [sOpen, setSOpen] = useState(false)
  const [sName, setSName] = useState('')
  const [sTrigger, setSTrigger] = useState('manual')

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  useEffect(() => { if (activeProject) fetchAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject?.id])

  async function fetchAll() {
    if (!activeProject) return
    setLoading(true)
    const [t, l, s] = await Promise.all([
      supabase.from('email_templates').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }),
      supabase.from('email_lists').select('*').eq('project_id', activeProject.id),
      supabase.from('email_sequences').select('*').eq('project_id', activeProject.id),
    ])
    setTemplates((t.data as EmailTemplate[]) ?? [])
    setLists((l.data as EmailList[]) ?? [])
    setSequences((s.data as EmailSequence[]) ?? [])

    // Fetch enrollment stats per sequence in one query
    const seqIds = ((s.data as EmailSequence[]) ?? []).map((r) => r.id)
    if (seqIds.length > 0) {
      const { data: enrolls } = await supabase
        .from('email_sequence_enrollments')
        .select('sequence_id, status, next_send_at')
        .in('sequence_id', seqIds)
      const stats: Record<string, EnrollmentStats> = {}
      for (const sid of seqIds) stats[sid] = { active: 0, completed: 0, failed: 0, cancelled: 0, next_due: null }
      for (const e of (enrolls ?? []) as Array<{ sequence_id: string; status: string; next_send_at: string | null }>) {
        const b = stats[e.sequence_id]
        if (!b) continue
        if (e.status === 'active') {
          b.active += 1
          if (e.next_send_at && (!b.next_due || e.next_send_at < b.next_due)) b.next_due = e.next_send_at
        } else if (e.status === 'completed') b.completed += 1
        else if (e.status === 'failed') b.failed += 1
        else if (e.status === 'cancelled') b.cancelled += 1
      }
      setEnrollStats(stats)
    } else {
      setEnrollStats({})
    }

    setLoading(false)
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setTCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated'); setTCreating(false); return }
    const { error } = await supabase.from('email_templates').insert({
      user_id: user.id, project_id: activeProject.id,
      name: tName, subject: tSubject, body_html: tBody || null, category: tCategory || null,
    })
    if (error) toast.error(error.message)
    else { toast.success('Template created'); setTOpen(false); setTName(''); setTSubject(''); setTBody(''); setTCategory(''); fetchAll() }
    setTCreating(false)
  }

  async function generateWithAI(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setAiGenerating(true)
    try {
      const res = await fetch('/api/ai/generate-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, purpose: aiPurpose, audience: aiAudience, emailType: aiType }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const email = await res.json()
      setTName(`AI: ${aiType} email`); setTSubject(email.subject); setTBody(email.body_html)
      setAiOpen(false); setTOpen(true); toast.success('Email generated')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setAiGenerating(false)
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('email_lists').insert({
      user_id: user.id, project_id: activeProject.id, name: lName, description: lDesc || null,
    })
    if (error) toast.error(error.message)
    else { toast.success('List created'); setLOpen(false); setLName(''); setLDesc(''); fetchAll() }
  }

  async function createSequence(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('email_sequences').insert({
      user_id: user.id, project_id: activeProject.id, name: sName, trigger_type: sTrigger,
    })
    if (error) toast.error(error.message)
    else { toast.success('Sequence created'); setSOpen(false); setSName(''); setSTrigger('manual'); fetchAll() }
  }

  async function deleteTemplate(id: string) {
    const { error } = await supabase.from('email_templates').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchAll() }
  }

  const TABS: Array<{ key: Tab; label: string; icon: typeof Mail; count: number }> = [
    { key: 'templates', label: 'Templates', icon: FileText, count: templates.length },
    { key: 'lists', label: 'Lists', icon: Users, count: lists.length },
    { key: 'sequences', label: 'Sequences', icon: Workflow, count: sequences.length },
  ]

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Email Engine"
        subtitle="Templates, sequences & subscriber lists"
        actions={
          <>
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
              <DialogTrigger>
                <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20">
                  <Sparkles className="h-3.5 w-3.5" /> AI Generate
                </div>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Generate with AI</DialogTitle></DialogHeader>
                <form onSubmit={generateWithAI} className="space-y-3">
                  <select value={aiType} onChange={(e) => setAiType(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="welcome">Welcome</option>
                    <option value="nurture">Nurture</option>
                    <option value="announcement">Announcement</option>
                    <option value="promotion">Promotion</option>
                    <option value="followup">Follow-up</option>
                  </select>
                  <textarea required placeholder="Purpose" value={aiPurpose} onChange={(e) => setAiPurpose(e.target.value)} rows={3} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <input required placeholder="Audience" value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" disabled={aiGenerating} className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiGenerating ? 'Generating…' : 'Generate'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={tOpen} onOpenChange={setTOpen}>
              <DialogTrigger>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                  <Plus className="h-3.5 w-3.5" /> New Template
                </div>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900 max-w-2xl">
                <DialogHeader><DialogTitle className="text-slate-100">Create email template</DialogTitle></DialogHeader>
                <form onSubmit={createTemplate} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input required placeholder="Template name" value={tName} onChange={(e) => setTName(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                    <input placeholder="Category" value={tCategory} onChange={(e) => setTCategory(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  </div>
                  <input required placeholder="Subject line" value={tSubject} onChange={(e) => setTSubject(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <textarea placeholder="<h1>Welcome!</h1>…" value={tBody} onChange={(e) => setTBody(e.target.value)} rows={10} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={tCreating} className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                      {tCreating ? 'Saving…' : 'Save Template'}
                    </button>
                    {tBody && (
                      <button type="button" onClick={() => setPreviewHtml(tBody)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/60">
                        <Eye className="h-3.5 w-3.5 inline mr-1" /> Preview
                      </button>
                    )}
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="mb-4 flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5 w-fit">
        {TABS.map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)} className={cn('inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider', tab === key ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200')}>
            <Icon className="h-3.5 w-3.5" /> {label} ({count})
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        loading ? <SectionPanel>Loading…</SectionPanel> : templates.length === 0 ? (
          <SectionPanel><div className="flex flex-col items-center py-12"><Mail className="h-10 w-10 text-slate-600 mb-3" /><p className="text-sm text-slate-400">No templates. Create one or generate with AI.</p></div></SectionPanel>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">{t.name}</h3>
                    {t.is_winner && (
                      <StatusPill tone="success">
                        <Trophy className="h-2.5 w-2.5" /> Top performer
                      </StatusPill>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.category && <StatusPill tone="neutral">{t.category}</StatusPill>}
                    {t.body_html && <button onClick={() => setPreviewHtml(t.body_html)} className="text-slate-500 hover:text-slate-300"><Eye className="h-3.5 w-3.5" /></button>}
                    <button onClick={() => deleteTemplate(t.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 truncate">Subject: {t.subject}</p>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'lists' && (
        <>
          <div className="flex justify-end mb-3">
            <Dialog open={lOpen} onOpenChange={setLOpen}>
              <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />New List</div></DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Create list</DialogTitle></DialogHeader>
                <form onSubmit={createList} className="space-y-3">
                  <input required placeholder="List name" value={lName} onChange={(e) => setLName(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <input placeholder="Description" value={lDesc} onChange={(e) => setLDesc(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">Create List</button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {lists.length === 0 ? (
            <SectionPanel><div className="flex flex-col items-center py-12"><Users className="h-10 w-10 text-slate-600 mb-3" /><p className="text-sm text-slate-400">No subscriber lists yet.</p></div></SectionPanel>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {lists.map((l) => (
                <div key={l.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                  <h3 className="text-sm font-semibold text-slate-100">{l.name}</h3>
                  {l.description && <p className="text-xs text-slate-400 mt-1">{l.description}</p>}
                  <div className="mt-3 flex items-center gap-1 font-mono-data text-xs text-emerald-400">
                    <Users className="h-3 w-3" /> {l.subscriber_count} subscribers
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'sequences' && (
        <>
          <div className="flex justify-end mb-3">
            <Dialog open={sOpen} onOpenChange={setSOpen}>
              <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />New Sequence</div></DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Create sequence</DialogTitle></DialogHeader>
                <form onSubmit={createSequence} className="space-y-3">
                  <input required placeholder="Name" value={sName} onChange={(e) => setSName(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <select value={sTrigger} onChange={(e) => setSTrigger(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="manual">Manual</option>
                    <option value="signup">On signup</option>
                    <option value="tag_added">Tag added</option>
                    <option value="event">Custom event</option>
                  </select>
                  <button type="submit" className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">Create Sequence</button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {sequences.length === 0 ? (
            <SectionPanel><div className="flex flex-col items-center py-12"><Workflow className="h-10 w-10 text-slate-600 mb-3" /><p className="text-sm text-slate-400">No sequences yet.</p></div></SectionPanel>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sequences.map((s) => {
                const stats = enrollStats[s.id] ?? { active: 0, completed: 0, failed: 0, cancelled: 0, next_due: null }
                const nextDue = stats.next_due ? new Date(stats.next_due) : null
                const dueLabel = nextDue ? (nextDue.getTime() < Date.now() ? 'Firing on next tick' : `Next fire ${nextDue.toLocaleString()}`) : null
                return (
                  <div key={s.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{s.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Trigger: <span className="font-mono-data text-slate-300">{s.trigger_type}</span></p>
                      </div>
                      <StatusPill status={s.status}>{s.status}</StatusPill>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="rounded border border-slate-800 bg-slate-800/40 p-1.5">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400">Active</div>
                        <div className="font-mono-data text-sm font-semibold text-slate-100">{stats.active}</div>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-800/40 p-1.5">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Done</div>
                        <div className="font-mono-data text-sm font-semibold text-slate-300">{stats.completed}</div>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-800/40 p-1.5">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-rose-400">Failed</div>
                        <div className="font-mono-data text-sm font-semibold text-slate-300">{stats.failed}</div>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-800/40 p-1.5">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Cancel</div>
                        <div className="font-mono-data text-sm font-semibold text-slate-300">{stats.cancelled}</div>
                      </div>
                    </div>
                    {dueLabel && (
                      <p className="mt-2 text-[10px] font-mono-data text-slate-500">{dueLabel}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {previewHtml && (
        <Dialog open={!!previewHtml} onOpenChange={() => setPreviewHtml(null)}>
          <DialogContent className="border-slate-700 bg-white max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center justify-between">Email Preview <button onClick={() => setPreviewHtml(null)}><X className="h-4 w-4" /></button></DialogTitle></DialogHeader>
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  )
}
