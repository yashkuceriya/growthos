'use client'

import { useEffect, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Share2, Calendar, PenLine, Sparkles, Loader2, Clock, MessageCircle, Briefcase, Camera, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SocialPost {
  id: string; platform: string; content: string; media_urls: string[]
  status: string; scheduled_at: string | null; published_at: string | null
  ai_generated: boolean; created_at: string
}

const ICON: Record<string, typeof MessageCircle> = { twitter: MessageCircle, linkedin: Briefcase, instagram: Camera }
const LIMIT: Record<string, number> = { twitter: 280, linkedin: 3000, instagram: 2200 }
type Tab = 'calendar' | 'posts'

export default function SocialPage() {
  const { activeProject } = useProject()
  const supabase = createClient()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('calendar')

  const [cOpen, setCOpen] = useState(false)
  const [cPlatform, setCPlatform] = useState('twitter')
  const [cContent, setCContent] = useState('')
  const [cSchedule, setCSchedule] = useState('')
  const [creating, setCreating] = useState(false)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiPlatform, setAiPlatform] = useState('twitter')
  const [aiTopic, setAiTopic] = useState('')
  const [aiType, setAiType] = useState('engaging')
  const [aiGen, setAiGen] = useState(false)

  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))

  useEffect(() => { if (activeProject) fetchPosts() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject?.id])

  async function fetchPosts() {
    if (!activeProject) return
    setLoading(true)
    const { data } = await supabase.from('social_posts').select('*').eq('project_id', activeProject.id).order('scheduled_at', { ascending: true, nullsFirst: false })
    setPosts((data as SocialPost[]) ?? [])
    setLoading(false)
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated'); setCreating(false); return }
    const { error } = await supabase.from('social_posts').insert({
      user_id: user.id, project_id: activeProject.id, platform: cPlatform, content: cContent,
      status: cSchedule ? 'scheduled' : 'draft',
      scheduled_at: cSchedule ? new Date(cSchedule).toISOString() : null,
    })
    if (error) toast.error(error.message)
    else { toast.success(cSchedule ? 'Scheduled' : 'Draft saved'); setCOpen(false); setCContent(''); setCSchedule(''); fetchPosts() }
    setCreating(false)
  }

  async function generateAI(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setAiGen(true)
    try {
      const res = await fetch('/api/ai/generate-social', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, platform: aiPlatform, topic: aiTopic, contentType: aiType }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const post = await res.json()
      const tags = post.hashtags?.length ? '\n\n' + post.hashtags.map((h: string) => `#${h}`).join(' ') : ''
      setCPlatform(aiPlatform); setCContent(post.content + tags); setAiOpen(false); setCOpen(true)
      toast.success('Post generated')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setAiGen(false)
  }

  async function deletePost(id: string) {
    const { error } = await supabase.from('social_posts').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchPosts() }
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const scheduled = posts.filter((p) => p.scheduled_at || p.published_at)

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Social Scheduler"
        subtitle="Content calendar & cross-platform posting"
        actions={
          <>
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
              <DialogTrigger>
                <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20">
                  <Sparkles className="h-3.5 w-3.5" /> AI Generate
                </div>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Generate social post</DialogTitle></DialogHeader>
                <form onSubmit={generateAI} className="space-y-3">
                  <select value={aiPlatform} onChange={(e) => setAiPlatform(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="twitter">Twitter / X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="instagram">Instagram</option>
                  </select>
                  <select value={aiType} onChange={(e) => setAiType(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="educational">Educational</option>
                    <option value="promotional">Promotional</option>
                    <option value="engaging">Engaging</option>
                    <option value="announcement">Announcement</option>
                    <option value="behind_the_scenes">Behind the scenes</option>
                  </select>
                  <textarea required placeholder="Topic" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} rows={3} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <button type="submit" disabled={aiGen} className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {aiGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiGen ? 'Generating…' : 'Generate'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={cOpen} onOpenChange={setCOpen}>
              <DialogTrigger>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                  <Plus className="h-3.5 w-3.5" /> Compose
                </div>
              </DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900 max-w-lg">
                <DialogHeader><DialogTitle className="text-slate-100">Compose post</DialogTitle></DialogHeader>
                <form onSubmit={createPost} className="space-y-3">
                  <select value={cPlatform} onChange={(e) => setCPlatform(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="twitter">Twitter / X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="instagram">Instagram</option>
                  </select>
                  <textarea required rows={6} placeholder="Write your post…" value={cContent} onChange={(e) => setCContent(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <div className="flex items-center justify-between text-[10px] font-mono-data text-slate-500">
                    <span>{cContent.length} / {LIMIT[cPlatform]} chars</span>
                    {cContent.length > LIMIT[cPlatform] && <StatusPill tone="error">OVER LIMIT</StatusPill>}
                  </div>
                  <input type="datetime-local" value={cSchedule} onChange={(e) => setCSchedule(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" disabled={creating} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {creating ? 'Saving…' : cSchedule ? 'Schedule Post' : 'Save Draft'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="mb-4 flex rounded-md border border-slate-700 bg-slate-800/60 p-0.5 w-fit">
        <button onClick={() => setTab('calendar')} className={cn('inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider', tab === 'calendar' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200')}>
          <Calendar className="h-3.5 w-3.5" /> Calendar
        </button>
        <button onClick={() => setTab('posts')} className={cn('inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider', tab === 'posts' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200')}>
          <PenLine className="h-3.5 w-3.5" /> All Posts ({posts.length})
        </button>
      </div>

      {tab === 'calendar' ? (
        <SectionPanel
          title={`Week of ${format(weekStart, 'MMM d')} — ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`}
          action={
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><ChevronRight className="h-4 w-4" /></button>
            </div>
          }
        >
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dayPosts = scheduled.filter((p) => { const d = p.scheduled_at || p.published_at; return d && isSameDay(new Date(d), day) })
              const isToday = isSameDay(day, new Date())
              return (
                <div key={day.toISOString()} className={cn('rounded-md border p-2 min-h-[140px]', isToday ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40')}>
                  <div className={cn('text-[10px] font-semibold uppercase tracking-wider mb-2', isToday ? 'text-emerald-300' : 'text-slate-500')}>
                    {format(day, 'EEE d')}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.map((p) => {
                      const Icon = ICON[p.platform] ?? Share2
                      return (
                        <div key={p.id} className="rounded bg-slate-800 p-1.5 text-[10px]">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Icon className="h-3 w-3 text-emerald-400" />
                            <StatusPill status={p.status}>{p.status}</StatusPill>
                          </div>
                          <p className="text-slate-300 line-clamp-2">{p.content.slice(0, 60)}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionPanel>
      ) : (
        loading ? <SectionPanel>Loading…</SectionPanel> : posts.length === 0 ? (
          <SectionPanel><div className="flex flex-col items-center py-12"><Share2 className="h-10 w-10 text-slate-600 mb-3" /><p className="text-sm text-slate-400">No posts yet.</p></div></SectionPanel>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => {
              const Icon = ICON[p.platform] ?? Share2
              return (
                <div key={p.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-emerald-400" />
                        <StatusPill status={p.status}>{p.status}</StatusPill>
                        {p.ai_generated && <StatusPill tone="accent"><Sparkles className="h-2.5 w-2.5" />AI</StatusPill>}
                        {p.scheduled_at && (
                          <span className="flex items-center gap-1 font-mono-data text-[10px] text-slate-500">
                            <Clock className="h-3 w-3" /> {format(new Date(p.scheduled_at), 'MMM d, HH:mm')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{p.content}</p>
                    </div>
                    <button onClick={() => deletePost(p.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </PageShell>
  )
}
