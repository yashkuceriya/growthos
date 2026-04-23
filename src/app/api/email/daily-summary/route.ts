// Daily summary email. Fired by Vercel Cron (see vercel.json).
//
// For each user that has at least one project, sends a single email summarizing
// yesterday's activity across all their products: new leads captured, emails
// sent, ads generated, campaigns launched, and MTD AI spend vs cap.
//
// Auth via CRON_SECRET. Send via Resend using RESEND_FROM_EMAIL. If Resend
// isn't configured (missing RESEND_API_KEY), the route still runs but only
// returns the computed summaries in the JSON response (useful for debugging).

export const runtime = 'nodejs'
export const maxDuration = 120

import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend'
import { wrapHandler } from '@/lib/api-error'

interface ProjectDigest {
  project_id: string
  project_name: string
  leads: number
  ads: number
  emails_sent: number
  launches: number
  mtd_spend: number
  budget: number | null
}

interface UserDigest {
  user_id: string
  email: string
  projects: ProjectDigest[]
}

async function buildDigests(supabase: ReturnType<typeof createServiceClient>): Promise<UserDigest[]> {
  const yesterdayStart = new Date(); yesterdayStart.setDate(yesterdayStart.getDate() - 1); yesterdayStart.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date(yesterdayStart); yesterdayEnd.setHours(23, 59, 59, 999)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  // Get every project with its owning user
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, user_id, monthly_ai_budget_usd')
    .order('name', { ascending: true })

  if (!projects || projects.length === 0) return []

  const projectIds = projects.map((p) => p.id)

  const [leadsRes, adsRes, emailSendsRes, campaignsRes, spendRes] = await Promise.all([
    supabase.from('leads').select('project_id, created_at').in('project_id', projectIds)
      .gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString()),
    supabase.from('ad_copies').select('brief_id, ad_briefs!inner(project_id, created_at)').in('ad_briefs.project_id', projectIds)
      .gte('ad_briefs.created_at', yesterdayStart.toISOString()).lte('ad_briefs.created_at', yesterdayEnd.toISOString()),
    supabase.from('email_sends').select('user_id, created_at, status').gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString()).in('status', ['sent', 'delivered', 'opened', 'clicked']),
    supabase.from('campaigns').select('project_id, created_at, metadata').in('project_id', projectIds)
      .gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString()),
    supabase.from('ai_cost_ledger').select('project_id, cost_usd').in('project_id', projectIds)
      .gte('created_at', monthStart.toISOString()),
  ])

  const leadsBy: Record<string, number> = {}
  for (const r of leadsRes.data ?? []) {
    const row = r as { project_id: string }
    leadsBy[row.project_id] = (leadsBy[row.project_id] ?? 0) + 1
  }

  const adsBy: Record<string, number> = {}
  for (const r of adsRes.data ?? []) {
    // supabase-js returns joined !inner as array; grab first match
    const row = r as unknown as { ad_briefs: { project_id: string } | Array<{ project_id: string }> }
    const joined = Array.isArray(row.ad_briefs) ? row.ad_briefs[0] : row.ad_briefs
    if (!joined) continue
    adsBy[joined.project_id] = (adsBy[joined.project_id] ?? 0) + 1
  }

  const campaignsBy: Record<string, number> = {}
  for (const r of campaignsRes.data ?? []) {
    const row = r as { project_id: string; metadata: Record<string, unknown> | null }
    if (row.metadata?.launch_run) campaignsBy[row.project_id] = (campaignsBy[row.project_id] ?? 0) + 1
  }

  const spendBy: Record<string, number> = {}
  for (const r of spendRes.data ?? []) {
    const row = r as { project_id: string; cost_usd: number | null }
    spendBy[row.project_id] = (spendBy[row.project_id] ?? 0) + (row.cost_usd ?? 0)
  }

  // Emails_sent is user-scoped (not per project), so we aggregate per user
  const emailsByUser: Record<string, number> = {}
  for (const r of emailSendsRes.data ?? []) {
    const row = r as { user_id: string }
    emailsByUser[row.user_id] = (emailsByUser[row.user_id] ?? 0) + 1
  }

  // Group projects by user
  const byUser = new Map<string, ProjectDigest[]>()
  for (const p of projects as Array<{ id: string; name: string; user_id: string; monthly_ai_budget_usd: number | null }>) {
    const digest: ProjectDigest = {
      project_id: p.id,
      project_name: p.name,
      leads: leadsBy[p.id] ?? 0,
      ads: adsBy[p.id] ?? 0,
      emails_sent: 0, // filled per-user below
      launches: campaignsBy[p.id] ?? 0,
      mtd_spend: +(spendBy[p.id] ?? 0).toFixed(2),
      budget: p.monthly_ai_budget_usd ?? null,
    }
    const list = byUser.get(p.user_id) ?? []
    list.push(digest)
    byUser.set(p.user_id, list)
  }

  // Resolve user emails via auth.users via service client
  // supabase-js has auth.admin.getUserById — use listUsers once then filter
  // For small user counts this is fine; swap for paginated listing if scaling.
  const { data: { users } = { users: [] } } = await supabase.auth.admin.listUsers()
  const userEmailById = new Map(users.map((u: { id: string; email?: string }) => [u.id, u.email ?? ''] as const))

  const digests: UserDigest[] = []
  for (const [userId, projectDigests] of byUser.entries()) {
    const email = userEmailById.get(userId)
    if (!email) continue
    // Stamp the per-user emails_sent on the first project row for visibility
    // (alternative: keep as a separate field; keeping simple for MVP)
    const emailsSent = emailsByUser[userId] ?? 0
    if (projectDigests[0]) projectDigests[0].emails_sent = emailsSent
    digests.push({ user_id: userId, email, projects: projectDigests })
  }

  return digests
}

function renderEmail(digest: UserDigest): { subject: string; html: string } {
  const totals = digest.projects.reduce(
    (acc, p) => ({
      leads: acc.leads + p.leads,
      ads: acc.ads + p.ads,
      launches: acc.launches + p.launches,
      emails: acc.emails + p.emails_sent,
    }),
    { leads: 0, ads: 0, launches: 0, emails: 0 },
  )

  const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const projectRows = digest.projects
    .map((p) => {
      const hasActivity = p.leads + p.ads + p.launches + p.emails_sent > 0
      const budgetBar = p.budget
        ? `<div style="font-size:11px;color:#475569;margin-top:4px">AI spend MTD: $${p.mtd_spend.toFixed(2)} / $${p.budget.toFixed(2)}${p.mtd_spend >= p.budget ? ' ⚠️ cap hit' : ''}</div>`
        : `<div style="font-size:11px;color:#475569;margin-top:4px">AI spend MTD: $${p.mtd_spend.toFixed(2)}</div>`
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
            <div style="font-weight:600;color:#0f172a">${p.project_name}</div>
            <div style="margin-top:4px;font-size:13px;color:#475569">
              ${hasActivity
                ? [
                    p.leads ? `<strong>${p.leads}</strong> new lead${p.leads === 1 ? '' : 's'}` : '',
                    p.ads ? `<strong>${p.ads}</strong> ad${p.ads === 1 ? '' : 's'} generated` : '',
                    p.launches ? `<strong>${p.launches}</strong> launch${p.launches === 1 ? '' : 'es'}` : '',
                    p.emails_sent ? `<strong>${p.emails_sent}</strong> emails sent` : '',
                  ].filter(Boolean).join(' · ')
                : '<span style="color:#94a3b8">No activity yesterday</span>'}
            </div>
            ${budgetBar}
          </td>
        </tr>`
    })
    .join('')

  const subject =
    totals.leads + totals.ads + totals.launches + totals.emails > 0
      ? `GrowthOS · ${totals.leads} lead${totals.leads === 1 ? '' : 's'}, ${totals.launches} launch${totals.launches === 1 ? '' : 'es'} yesterday`
      : `GrowthOS · Quiet day across ${digest.projects.length} product${digest.projects.length === 1 ? '' : 's'}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://growthos.app'

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#0f172a">
    <h1 style="margin:0 0 8px;font-size:22px">Daily brief · ${date}</h1>
    <p style="margin:0 0 24px;color:#475569;font-size:14px">
      <strong>${totals.leads}</strong> new lead${totals.leads === 1 ? '' : 's'},
      <strong>${totals.ads}</strong> ad${totals.ads === 1 ? '' : 's'},
      <strong>${totals.launches}</strong> launch${totals.launches === 1 ? '' : 'es'},
      <strong>${totals.emails}</strong> email${totals.emails === 1 ? '' : 's'} sent
      across ${digest.projects.length} product${digest.projects.length === 1 ? '' : 's'}.
    </p>
    <table style="width:100%;border-collapse:collapse">
      ${projectRows}
    </table>
    <div style="margin-top:24px">
      <a href="${appUrl}/dashboard" style="display:inline-block;padding:10px 16px;background:#10b981;color:#0f172a;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px">Open Dashboard →</a>
    </div>
    <p style="margin-top:32px;font-size:11px;color:#94a3b8">
      You're receiving this because you have at least one GrowthOS project.
      <a href="${appUrl}/settings" style="color:#64748b">Manage preferences</a>
    </p>
  </div>`

  return { subject, html }
}

async function handleRequest(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const digests = await buildDigests(supabase)

  const resendConfigured = !!process.env.RESEND_API_KEY
  let sent = 0
  let failed = 0

  if (resendConfigured) {
    for (const digest of digests) {
      try {
        const { subject, html } = renderEmail(digest)
        await sendEmail({
          to: digest.email,
          subject,
          html,
          tags: [{ name: 'type', value: 'daily_summary' }],
        })
        sent += 1
      } catch (err) {
        console.error('[daily-summary][send]', digest.email, err)
        failed += 1
      }
    }
  }

  return Response.json({
    tick_at: new Date().toISOString(),
    resend_configured: resendConfigured,
    users_with_digest: digests.length,
    sent,
    failed,
    // Include digest bodies when Resend isn't configured so the route is
    // useful for local testing via curl -H 'Authorization: Bearer ...'
    digests: resendConfigured ? undefined : digests,
  })
}

export const GET = wrapHandler(handleRequest, 'email/daily-summary')
export const POST = wrapHandler(handleRequest, 'email/daily-summary')
