'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LOCAL_DEV_PROJECT_ID, hasLocalDevSessionCookie } from '@/lib/local-dev-auth'

interface Project {
  id: string
  user_id: string
  name: string
  slug: string
  description: string | null
  website: string | null
  logo_url: string | null
  brand_voice: unknown
  target_audiences: unknown
  competitors: unknown
  settings: unknown
  created_at: string
  updated_at: string
}

interface ProjectContextValue {
  projects: Project[]
  activeProject: Project | null
  setActiveProjectId: (id: string) => void
  loading: boolean
  refetch: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  activeProject: null,
  setActiveProjectId: () => {},
  loading: true,
  refetch: async () => {},
})

const localProject: Project = {
  id: LOCAL_DEV_PROJECT_ID,
  user_id: 'local-dev-user',
  name: 'Local GrowthOS Workspace',
  slug: 'local-growthos',
  description: 'Local admin workspace with full UI access.',
  website: 'https://growthos.local',
  logo_url: null,
  brand_voice: {
    tagline: 'Local marketing command center',
    value_proposition: 'Plan, create, launch, and inspect growth work from one local cockpit.',
    tone: ['clear', 'direct', 'operator-friendly'],
    guidelines: true,
  },
  target_audiences: ['founders', 'operators', 'growth teams'],
  competitors: [],
  settings: { local_seeded: true },
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
}

function hasLocalDevSession() {
  if (typeof document === 'undefined') return false
  return hasLocalDevSessionCookie(document.cookie)
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function fetchProjects() {
    if (hasLocalDevSession()) {
      setProjects([localProject])
      setActiveProjectId(LOCAL_DEV_PROJECT_ID)
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      setProjects(data)
      if (!activeProjectId && data.length > 0) {
        const stored = localStorage.getItem('growthos-active-project')
        const valid = stored && data.find((p) => p.id === stored)
        setActiveProjectId(valid ? stored : data[0].id)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem('growthos-active-project', activeProjectId)
    }
  }, [activeProjectId])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProjectId,
        loading,
        refetch: fetchProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  return useContext(ProjectContext)
}
