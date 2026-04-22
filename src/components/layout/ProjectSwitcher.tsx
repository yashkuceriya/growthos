'use client'

import { useProject } from '@/hooks/use-project'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Folder, Check } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectId, loading } = useProject()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (loading) {
    return <div className="h-10 animate-pulse rounded-md bg-slate-800" />
  }

  if (projects.length === 0) {
    return (
      <button
        onClick={() => router.push('/projects')}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-700 bg-slate-800/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300"
      >
        <Plus className="h-3.5 w-3.5" />
        Create First Project
      </button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-2 hover:border-slate-600">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-emerald-400">
          <Folder className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Active Project</div>
          <div className="text-xs font-semibold text-slate-100 truncate">{activeProject?.name ?? 'Select project'}</div>
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 border-slate-700 bg-slate-900">
        {projects.map((project) => {
          const active = activeProject?.id === project.id
          return (
            <DropdownMenuItem
              key={project.id}
              onClick={() => { setActiveProjectId(project.id); setOpen(false) }}
              className={cn('cursor-pointer text-slate-300 focus:bg-slate-800', active && 'text-emerald-300')}
            >
              <Folder className={cn('mr-2 h-3.5 w-3.5', active ? 'text-emerald-400' : 'text-slate-500')} />
              <span className="truncate flex-1">{project.name}</span>
              {active && <Check className="h-3.5 w-3.5 text-emerald-400" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuItem onClick={() => router.push('/projects')} className="cursor-pointer text-slate-300 focus:bg-slate-800">
          <Plus className="mr-2 h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">New Project</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
