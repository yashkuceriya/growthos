'use client'

import { useState } from 'react'
import { useProject } from '@/hooks/use-project'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { StatusPill } from '@/components/ui/status-pill'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Folder, Globe, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ProjectsPage() {
  const { projects, activeProject, refetch, setActiveProjectId } = useProject()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated'); setCreating(false); return }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { data, error } = await supabase.from('projects').insert({
      user_id: user.id, name, slug,
      description: description || null, website: website || null,
    }).select().single()
    if (error) toast.error(error.message)
    else {
      toast.success('Project created')
      setActiveProjectId(data.id)
      await refetch()
      setOpen(false); setName(''); setDescription(''); setWebsite('')
    }
    setCreating(false)
  }

  async function handleDelete(id: string, n: string) {
    if (!confirm(`Delete "${n}"? This will delete all campaigns, ads, and data.`)) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Project deleted'); await refetch() }
  }

  return (
    <PageShell>
      <PageHeader
        title="Projects"
        subtitle="Each project represents a product you're marketing"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400">
                <Plus className="h-3.5 w-3.5" /> New Project
              </div>
            </DialogTrigger>
            <DialogContent className="border-slate-700 bg-slate-900">
              <DialogHeader><DialogTitle className="text-slate-100">Create a new project</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <input required placeholder="Project name (e.g. Interview Journey)" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none resize-none" />
                <input placeholder="https://yourproduct.com" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
                <button type="submit" disabled={creating} className="w-full rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create project'}
                </button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {projects.length === 0 ? (
        <SectionPanel>
          <div className="flex flex-col items-center justify-center py-12">
            <Folder className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No projects yet. Create one to get started.</p>
          </div>
        </SectionPanel>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((p) => {
            const active = activeProject?.id === p.id
            return (
              <div key={p.id} className={cn('relative rounded-md border p-4', active ? 'border-emerald-500/40 bg-emerald-500/[0.03]' : 'border-slate-800 bg-slate-900/60')}>
                {active && <span className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r bg-emerald-400" />}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                      <div className="font-mono-data text-[10px] text-slate-500">{p.slug}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(p.id, p.name)} className="text-slate-500 hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {p.description && <p className="mb-3 text-xs text-slate-400 line-clamp-2">{p.description}</p>}
                {p.website && (
                  <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono-data text-emerald-400 hover:text-emerald-300">
                    <Globe className="h-3 w-3" /> {p.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <div className="mt-3 flex items-center justify-between">
                  {active ? <StatusPill tone="success">Active</StatusPill> : (
                    <button onClick={() => setActiveProjectId(p.id)} className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-emerald-300">
                      Set Active
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
