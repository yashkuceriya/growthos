'use client'

// Week strip of scheduled social posts for one campaign (Phase 7 calendar).
import { useMemo } from 'react'
import { addDays, eachDayOfInterval, format, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { SectionPanel } from '@/components/ui/section-panel'
import { Calendar } from 'lucide-react'
import Link from 'next/link'

interface UnifiedAssetLike {
  id: string
  kind: string
  title: string
  channel: string
  status: string
  metadata: Record<string, unknown>
}

interface Props {
  assets: UnifiedAssetLike[]
}

export function LaunchScheduleStrip({ assets }: Props) {
  const entries = useMemo(() => {
    const list: Array<{ at: Date; id: string; label: string; platform: string; status: string }> = []
    for (const a of assets) {
      if (a.kind !== 'social_post') continue
      const raw = a.metadata?.scheduled_at
      if (typeof raw !== 'string' || !raw) continue
      const at = parseISO(raw)
      if (Number.isNaN(at.getTime())) continue
      list.push({
        at,
        id: a.id,
        label: a.title,
        platform: a.channel,
        status: a.status,
      })
    }
    return list.sort((x, y) => x.at.getTime() - y.at.getTime())
  }, [assets])

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })

  if (entries.length === 0) {
    return (
      <SectionPanel
        title={
          <span className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Launch schedule (this week)
          </span>
        }
      >
        <p className="text-xs text-slate-500">
          No posts with a scheduled time yet. On <Link href="/social" className="text-emerald-400 hover:text-emerald-300">Social</Link>, pick a date for drafts to see them here.
        </p>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel
      title={
        <span className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-emerald-300" />
          Launch schedule (this week)
        </span>
      }
      contentClassName="p-0"
    >
      <div className="grid grid-cols-7 gap-px border-b border-slate-800 bg-slate-800">
        {days.map((day) => {
          const dayPosts = entries.filter((e) => isSameDay(e.at, day))
          return (
            <div key={day.toISOString()} className="min-h-[72px] bg-slate-900/90 p-2">
              <div className="font-mono-data text-[10px] text-slate-500">
                {format(day, 'EEE')}
              </div>
              <div className="text-[11px] font-semibold text-slate-200">{format(day, 'd')}</div>
              <ul className="mt-1 space-y-0.5">
                {dayPosts.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <Link
                      href="/social"
                      className="block truncate rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200 hover:bg-emerald-500/20"
                      title={`${p.platform} · ${p.label}`}
                    >
                      {p.platform}
                    </Link>
                  </li>
                ))}
                {dayPosts.length > 3 && (
                  <li className="text-[9px] text-slate-500">+{dayPosts.length - 3} more</li>
                )}
              </ul>
            </div>
          )
        })}
      </div>
      <div className="px-3 py-2 text-[10px] text-slate-500">
        {entries.length} scheduled post{entries.length === 1 ? '' : 's'} with a date. Opens Social for publishing.
      </div>
    </SectionPanel>
  )
}
