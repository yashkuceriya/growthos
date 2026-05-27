'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, FileText, Sparkles, Loader2, Trash2, Search, Check, X, ArrowLeft } from 'lucide-react'

interface ContentPiece {
  id: string; title: string; body_markdown: string | null; content_type: string
  status: string; seo_score: number | null; target_keywords: string[]
  word_count: number; created_at: string
}

export default function ContentPage() {
  const { activeProject } = useProject()
  const searchParams = useSearchParams()
  const queryCampaignId = searchParams.get('campaignId')
  const supabase = createClient()
  const [linkedCampaign, setLinkedCampaign] = useState<{ id: string; name: string } | null>(null)
  const [campaignLinkState, setCampaignLinkState] = useState<'idle' | 'pending' | 'ok' | 'bad'>('idle')
  const [pieces, setPieces] = useState<ContentPiece[]>([])
  const [loading, setLoading] = useState(true)

  const [cOpen, setCOpen] = useState(false)
  const [cTitle, setCTitle] = useState('')
  const [cType, setCType] = useState('blog_post')
  const [cKeywords, setCKeywords] = useState('')
  const [cBody, setCBody] = useState('')
  const [creating, setCreating] = useState(false)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiKeyword, setAiKeyword] = useState('')
  const [aiAudience, setAiAudience] = useState('')
  const [aiGen, setAiGen] = useState(false)

  const [seoResult, setSeoResult] = useState<{ score: number; checks: { name: string; passed: boolean; tip: string }[] } | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editKeyword, setEditKeyword] = useState('')

  useEffect(() => {
    if (!activeProject?.id || !queryCampaignId) {
      setLinkedCampaign(null)
      setCampaignLinkState('idle')
      return
    }
    let cancelled = false
    setCampaignLinkState('pending')
    void supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', queryCampaignId)
      .eq('project_id', activeProject.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data?.id) {
          setLinkedCampaign({ id: data.id, name: String(data.name ?? 'Campaign') })
          setCampaignLinkState('ok')
        } else {
          setLinkedCampaign(null)
          setCampaignLinkState('bad')
        }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, queryCampaignId])

  useEffect(() => {
    if (activeProject) fetchContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload list when project changes
  }, [activeProject?.id])

  async function fetchContent() {
    if (!activeProject) return
    setLoading(true)
    const { data } = await supabase
      .from('content_pieces')
      .select('id, title, body_markdown, content_type, status, seo_score, target_keywords, word_count, created_at')
      .eq('project_id', activeProject.id)
      .order('created_at', { ascending: false })
    setPieces((data as ContentPiece[]) ?? [])
    setLoading(false)
  }

  async function createContent(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated'); setCreating(false); return }
    const slug = cTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const wordCount = cBody ? cBody.split(/\s+/).filter(Boolean).length : 0
    const { error } = await supabase.from('content_pieces').insert({
      user_id: user.id, project_id: activeProject.id, title: cTitle, slug, content_type: cType,
      body_markdown: cBody || null,
      target_keywords: cKeywords ? cKeywords.split(',').map((k) => k.trim()) : [],
      word_count: wordCount, status: cBody ? 'drafting' : 'idea',
      ...(linkedCampaign ? { campaign_id: linkedCampaign.id } : {}),
    })
    if (error) toast.error(error.message)
    else { toast.success('Content created'); setCOpen(false); setCTitle(''); setCType('blog_post'); setCKeywords(''); setCBody(''); fetchContent() }
    setCreating(false)
  }

  async function generateAI(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setAiGen(true)
    try {
      const res = await fetch('/api/ai/generate-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, topic: aiTopic, targetKeyword: aiKeyword, audience: aiAudience }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const post = await res.json()
      setCTitle(post.title); setCKeywords(post.target_keywords.join(', ')); setCBody(post.body_markdown)
      setAiOpen(false); setCOpen(true); toast.success('Blog post generated')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    setAiGen(false)
  }

  async function deleteContent(id: string) {
    const { error } = await supabase.from('content_pieces').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchContent() }
  }

  function openEditor(p: ContentPiece) {
    setEditId(p.id); setEditTitle(p.title); setEditBody(p.body_markdown || '')
    setEditKeyword(p.target_keywords?.[0] || ''); setSeoResult(null)
  }

  async function saveEditor() {
    if (!editId) return
    const wc = editBody.split(/\s+/).filter(Boolean).length
    const { error } = await supabase.from('content_pieces').update({
      title: editTitle, body_markdown: editBody, word_count: wc,
      seo_score: seoResult?.score ?? null,
    }).eq('id', editId)
    if (error) toast.error(error.message)
    else { toast.success('Saved'); setEditId(null); setSeoResult(null); fetchContent() }
  }

  function runSeoCheck() {
    if (!editBody || !editTitle) return
    const kw = editKeyword.toLowerCase()
    const bodyLower = editBody.toLowerCase()
    const checks: { name: string; passed: boolean; tip: string }[] = []
    checks.push({ name: 'Keyword in title', passed: !!kw && editTitle.toLowerCase().includes(kw), tip: 'Include keyword in title' })
    checks.push({ name: 'Title length (40-65)', passed: editTitle.length >= 40 && editTitle.length <= 65, tip: `${editTitle.length} chars` })
    const wc = editBody.split(/\s+/).filter(Boolean).length
    checks.push({ name: 'Word count 500+', passed: wc >= 500, tip: `${wc} words` })
    checks.push({ name: 'Has H2 headings', passed: /^## /m.test(editBody), tip: 'Add ## headings' })
    checks.push({ name: 'Keyword in intro', passed: !!kw && bodyLower.slice(0, 600).includes(kw), tip: 'Use keyword in first 100 words' })
    if (kw && wc > 0) {
      const cnt = (bodyLower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      const d = (cnt / wc) * 100
      checks.push({ name: 'Keyword density 1-3%', passed: d >= 1 && d <= 3, tip: `${d.toFixed(1)}%` })
    }
    const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100)
    setSeoResult({ score, checks })
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  if (editId) {
    return (
      <PageShell>
        <PageHeader
          title="Content Editor"
          actions={
            <>
              <button onClick={() => { setEditId(null); setSeoResult(null) }} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button onClick={runSeoCheck} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800">
                <Search className="h-3.5 w-3.5" /> SEO Check
              </button>
              <button onClick={saveEditor} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                Save
              </button>
            </>
          }
        />
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-3">
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-xl font-semibold text-slate-100 focus:border-emerald-500 focus:outline-none" />
            <input value={editKeyword} onChange={(e) => setEditKeyword(e.target.value)} placeholder="Target keyword" className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={25} placeholder="Write in markdown…" className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
            <p className="font-mono-data text-[10px] text-slate-500">{editBody.split(/\s+/).filter(Boolean).length} words</p>
          </div>
          {seoResult && (
            <SectionPanel title="SEO Score">
              <div className="font-mono-data text-3xl font-semibold text-slate-100 mb-2">{seoResult.score}<span className="text-slate-500 text-lg">/100</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800 mb-4">
                <div className={seoResult.score >= 70 ? 'h-full bg-emerald-400' : 'h-full bg-amber-400'} style={{ width: `${seoResult.score}%` }} />
              </div>
              <ul className="space-y-2">
                {seoResult.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-2 text-xs">
                    {c.passed ? <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" /> : <X className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />}
                    <div>
                      <div className={c.passed ? 'text-emerald-300' : 'text-rose-300'}>{c.name}</div>
                      {!c.passed && <div className="text-slate-500">{c.tip}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </SectionPanel>
          )}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Content Workshop"
        subtitle="Blog posts, SEO content & AI generation"
        actions={
          <>
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
              <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20"><Sparkles className="h-3.5 w-3.5" />AI Generate</div></DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900">
                <DialogHeader><DialogTitle className="text-slate-100">Generate blog post</DialogTitle></DialogHeader>
                <form onSubmit={generateAI} className="space-y-3">
                  <input required placeholder="Target keyword" value={aiKeyword} onChange={(e) => setAiKeyword(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <textarea required rows={3} placeholder="Topic" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <input placeholder="Audience (optional)" value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <button type="submit" disabled={aiGen} className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {aiGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiGen ? 'Generating…' : 'Generate'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={cOpen} onOpenChange={setCOpen}>
              <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"><Plus className="h-3.5 w-3.5" />New Content</div></DialogTrigger>
              <DialogContent className="border-slate-700 bg-slate-900 max-w-2xl">
                <DialogHeader><DialogTitle className="text-slate-100">Create content</DialogTitle></DialogHeader>
                <form onSubmit={createContent} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input required placeholder="Title" value={cTitle} onChange={(e) => setCTitle(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                    <select value={cType} onChange={(e) => setCType(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                      <option value="blog_post">Blog Post</option>
                      <option value="case_study">Case Study</option>
                      <option value="landing_page">Landing Page</option>
                      <option value="whitepaper">Whitepaper</option>
                    </select>
                  </div>
                  <input placeholder="Keywords (comma separated)" value={cKeywords} onChange={(e) => setCKeywords(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <textarea rows={8} placeholder="Markdown body" value={cBody} onChange={(e) => setCBody(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                  <button type="submit" disabled={creating} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {linkedCampaign && (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
          New pieces attach to{' '}
          <Link href={`/campaigns/${linkedCampaign.id}`} className="font-semibold text-emerald-300 underline hover:text-emerald-200">
            {linkedCampaign.name}
          </Link>
          .
        </div>
      )}
      {campaignLinkState === 'bad' && (
        <div className="mb-4 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <code className="text-amber-100/90">campaignId</code> in the URL doesn&apos;t match this project — content won&apos;t attach to a campaign until you use a valid link.
        </div>
      )}

      {loading ? <SectionPanel>Loading…</SectionPanel> : pieces.length === 0 ? (
        <SectionPanel><div className="flex flex-col items-center py-12"><FileText className="h-10 w-10 text-slate-600 mb-3" /><p className="text-sm text-slate-400">No content yet.</p></div></SectionPanel>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {pieces.map((p) => (
            <div key={p.id} onClick={() => openEditor(p)} className="cursor-pointer rounded-md border border-slate-800 bg-slate-900/60 hover:bg-slate-900/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <StatusPill status={p.status}>{p.status}</StatusPill>
                    <StatusPill tone="neutral">{p.content_type.replace('_', ' ')}</StatusPill>
                    {p.seo_score != null && <StatusPill tone={p.seo_score >= 70 ? 'success' : 'warn'}>SEO: {p.seo_score}</StatusPill>}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100 truncate">{p.title}</h3>
                  <p className="font-mono-data text-[10px] text-slate-500 mt-1">
                    {p.word_count} words{p.target_keywords.length > 0 ? ` · ${p.target_keywords.slice(0, 2).join(', ')}` : ''}
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteContent(p.id) }} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
