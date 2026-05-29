'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Globe, Eye, Trash2, Copy, ExternalLink } from 'lucide-react'

interface LandingPage {
  id: string; name: string; slug: string
  template: { headline?: string; subheadline?: string; ctaText?: string; ctaColor?: string; bodyText?: string; imageUrl?: string }
  published: boolean; visits: number; conversions: number
}

export default function LandingPagesPage() {
  const { activeProject } = useProject()
  const supabase = useMemo(() => createClient(), [])
  const [pages, setPages] = useState<LandingPage[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [headline, setHeadline] = useState('')
  const [subheadline, setSubheadline] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaText, setCtaText] = useState('Get Started Free')
  const [creating, setCreating] = useState(false)

  const fetchPages = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const { data } = await supabase
      .from('landing_pages')
      .select('id, name, slug, template, published, visits, conversions')
      .eq('project_id', activeProject.id)
      .order('created_at', { ascending: false })
    setPages((data as LandingPage[]) ?? [])
    setLoading(false)
  }, [activeProject, supabase])

  useEffect(() => {
    if (!activeProject) return
    const timeout = window.setTimeout(() => { void fetchPages() }, 0)
    return () => window.clearTimeout(timeout)
  }, [activeProject, fetchPages])

  async function createPage(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }
    const pageSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { error } = await supabase.from('landing_pages').insert({
      user_id: user.id, project_id: activeProject.id, name, slug: pageSlug,
      template: { headline, subheadline, bodyText, ctaText, ctaColor: '#10b981' },
      published: false,
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Landing page created')
      setOpen(false); setName(''); setSlug(''); setHeadline(''); setSubheadline(''); setBodyText(''); setCtaText('Get Started Free')
      fetchPages()
    }
    setCreating(false)
  }

  async function togglePublish(id: string, published: boolean) {
    const { error } = await supabase.from('landing_pages').update({ published: !published }).eq('id', id)
    if (error) toast.error(error.message); else { toast.success(published ? 'Unpublished' : 'Published'); fetchPages() }
  }

  async function deletePage(id: string) {
    const { error } = await supabase.from('landing_pages').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchPages() }
  }

  function copyUrl(s: string) {
    navigator.clipboard.writeText(`${window.location.origin}/p/${s}`)
    toast.success('URL copied')
  }

  if (!activeProject) return <PageShell><p className="text-slate-400">Select a project</p></PageShell>

  return (
    <PageShell>
      <PageHeader
        title="Landing Pages"
        subtitle="Create lead capture pages for your campaigns"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger><div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"><Plus className="h-3.5 w-3.5" />New Page</div></DialogTrigger>
            <DialogContent className="border-slate-700 bg-slate-900 max-w-lg">
              <DialogHeader><DialogTitle className="text-slate-100">Create landing page</DialogTitle></DialogHeader>
              <form onSubmit={createPage} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder="Page name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                  <input placeholder="url-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono-data text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                </div>
                <input required placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <input placeholder="Subheadline" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <textarea rows={3} placeholder="Body text" value={bodyText} onChange={(e) => setBodyText(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                <input placeholder="CTA button text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <button type="submit" disabled={creating} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Page'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? <SectionPanel>Loading…</SectionPanel> : pages.length === 0 ? (
        <SectionPanel><div className="flex flex-col items-center py-12"><Globe className="h-10 w-10 text-slate-600 mb-3" /><p className="text-sm text-slate-400">No landing pages yet.</p></div></SectionPanel>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {pages.map((p) => (
            <div key={p.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">{p.name}</h3>
                    <StatusPill tone={p.published ? 'success' : 'neutral'}>{p.published ? 'Live' : 'Draft'}</StatusPill>
                  </div>
                  <p className="font-mono-data text-[10px] text-slate-500">/p/{p.slug}</p>
                </div>
                <div className="flex gap-0.5">
                  <button onClick={() => copyUrl(p.slug)} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><Copy className="h-3.5 w-3.5" /></button>
                  {p.published && <button onClick={() => window.open(`/p/${p.slug}`, '_blank')} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><ExternalLink className="h-3.5 w-3.5" /></button>}
                  <button onClick={() => deletePage(p.id)} className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="flex items-center gap-4 font-mono-data text-[11px] text-slate-400 mb-3">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{p.visits} visits</span>
                <span>{p.conversions} conversions</span>
                {p.visits > 0 && <span className="text-emerald-400">{((p.conversions / p.visits) * 100).toFixed(1)}% rate</span>}
              </div>
              <button onClick={() => togglePublish(p.id, p.published)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800/60">
                {p.published ? 'Unpublish' : 'Publish'}
              </button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
