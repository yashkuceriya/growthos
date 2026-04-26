'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  LayoutDashboard, Megaphone, Sparkles, Mail, Share2, FileText, Users,
  BarChart3, DollarSign, Settings, LogOut, Zap, HelpCircle, FolderKanban,
  Globe, Plus, Rocket, Briefcase, AlertTriangle, Film,
} from 'lucide-react'
import { ProjectSwitcher } from './ProjectSwitcher'

const primaryNav = [
  { href: '/agency', label: 'Agency', icon: Briefcase },
  { href: '/launch', label: 'Launch', icon: Rocket },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/ad-studio', label: 'Ad Studio', icon: Sparkles },
  { href: '/ad-studio/generate', label: 'Ad Generate', icon: Zap },
  { href: '/video', label: 'Video Studio', icon: Film },
  { href: '/email', label: 'Email', icon: Mail },
  { href: '/social', label: 'Social', icon: Share2 },
  { href: '/content', label: 'Content', icon: FileText },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/leads/pages', label: 'Landing Pages', icon: Globe },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/budget', label: 'Budget', icon: DollarSign },
  { href: '/observability', label: 'Observability', icon: AlertTriangle },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === '/ad-studio') return pathname === '/ad-studio'
    if (href === '/leads') return pathname === '/leads'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-800 bg-[#0b1220]">
      {/* Logo block */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 text-slate-950">
          <Zap className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-white">GrowthOS</span>
          <span className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
            Marketing Command
          </span>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-3 py-3 border-b border-slate-800">
        <ProjectSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2 py-3 overflow-y-auto">
        {primaryNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-emerald-400" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* New Campaign CTA */}
      <div className="px-3 py-3 border-t border-slate-800">
        <Link
          href="/campaigns"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-emerald-400 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New Campaign
        </Link>
      </div>

      {/* Footer links */}
      <div className="px-2 pb-3 space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <Link
          href="/support"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
          Support
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
