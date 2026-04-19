'use client'

import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { SectionPanel } from '@/components/ui/section-panel'
import { Mail, Book, MessageSquare, Bug } from 'lucide-react'

const LINKS = [
  { icon: Book, title: 'Documentation', desc: 'Module guides, integration setup, API reference', href: '#' },
  { icon: MessageSquare, title: 'Community Chat', desc: 'Ask questions, share playbooks with other operators', href: '#' },
  { icon: Bug, title: 'Report an Issue', desc: 'File bugs or request features on GitHub', href: '#' },
  { icon: Mail, title: 'Email Support', desc: 'Direct line for account/billing issues', href: 'mailto:support@growthos.local' },
]

export default function SupportPage() {
  return (
    <PageShell>
      <PageHeader title="Support" subtitle="Get help running your marketing command center" />
      <div className="grid grid-cols-2 gap-3">
        {LINKS.map(({ icon: Icon, title, desc, href }) => (
          <a key={title} href={href} className="group rounded-md border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/40 hover:bg-slate-900/80">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
                <p className="mt-1 text-xs text-slate-400">{desc}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
      <SectionPanel className="mt-4" title="System Status">
        <ul className="space-y-2 text-xs">
          <li className="flex items-center justify-between">
            <span className="text-slate-300">Ad Generation Pipeline</span>
            <span className="flex items-center gap-1.5 font-mono-data text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />OPERATIONAL</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-300">Email Delivery (Resend)</span>
            <span className="flex items-center gap-1.5 font-mono-data text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />OPERATIONAL</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-slate-300">Supabase Realtime</span>
            <span className="flex items-center gap-1.5 font-mono-data text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />OPERATIONAL</span>
          </li>
        </ul>
      </SectionPanel>
    </PageShell>
  )
}
