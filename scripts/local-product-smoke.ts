#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { LOCAL_DEV_EMAIL, LOCAL_DEV_PASSWORD } from '../src/lib/local-dev-auth'

config({ path: '.env.local' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

let pass = 0
let fail = 0
const failures: string[] = []

function ok(message: string) {
  pass += 1
  console.log(`  ✓ ${message}`)
}

function bad(message: string) {
  fail += 1
  failures.push(message)
  console.log(`  ✗ ${message}`)
}

async function expectHttp(path: string, expectedStatus: number, label: string) {
  try {
    const res = await fetch(`${APP_URL}${path}`, { redirect: 'manual' })
    if (res.status === expectedStatus) ok(`${label} (${res.status})`)
    else bad(`${label}: expected ${expectedStatus}, got ${res.status}`)
  } catch (error) {
    bad(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main() {
  console.log(`\nGrowthOS local product smoke against ${APP_URL}\n`)

  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    bad('missing Supabase env in .env.local')
    finish()
    return
  }

  await expectHttp('/login', 200, 'login page reachable')
  await expectHttp('/dashboard', 307, 'dashboard redirects when signed out')
  await expectHttp('/api/dashboard/health', 401, 'dashboard health rejects anonymous')

  const supabase = createClient(SB_URL, SB_ANON)
  const service = createClient(SB_URL, SB_SERVICE)

  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email: LOCAL_DEV_EMAIL,
    password: LOCAL_DEV_PASSWORD,
  })

  if (signInError || !session.user) {
    bad(`local admin Supabase login: ${signInError?.message ?? 'no user returned'}`)
    finish()
    return
  }
  ok(`local admin Supabase login (${session.user.email})`)

  const { data: project, error: projectError } = await service
    .from('projects')
    .select('id, name, slug, website, brand_voice')
    .eq('user_id', session.user.id)
    .eq('name', 'Local GrowthOS Workspace')
    .maybeSingle()

  if (projectError || !project) {
    bad(`seeded project: ${projectError?.message ?? 'missing Local GrowthOS Workspace'}`)
    finish()
    return
  }
  ok(`seeded project (${project.name})`)

  const { data: campaign, error: campaignError } = await service
    .from('campaigns')
    .select('id, name, status')
    .eq('project_id', project.id)
    .eq('name', 'Local Launch Sprint')
    .maybeSingle()

  if (campaignError || !campaign) {
    bad(`seeded campaign: ${campaignError?.message ?? 'missing Local Launch Sprint'}`)
    finish()
    return
  }
  ok(`seeded campaign (${campaign.status})`)

  const [{ count: ads }, { count: landingPages }, { count: leads }, { count: metrics }] = await Promise.all([
    service
      .from('ad_copies')
      .select('id, ad_briefs!inner(project_id)', { count: 'exact', head: true })
      .eq('ad_briefs.project_id', project.id),
    service
      .from('landing_pages')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id),
    service
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id),
    service
      .from('campaign_metrics')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id),
  ])

  if ((ads ?? 0) >= 1) ok(`seeded ad copies (${ads})`)
  else bad('seeded ad copies missing')

  if ((landingPages ?? 0) >= 1) ok(`seeded landing pages (${landingPages})`)
  else bad('seeded landing pages missing')

  if ((leads ?? 0) >= 5) ok(`seeded leads (${leads})`)
  else bad(`seeded leads too low (${leads ?? 0})`)

  if ((metrics ?? 0) >= 4) ok(`seeded campaign metrics (${metrics})`)
  else bad(`seeded campaign metrics too low (${metrics ?? 0})`)

  const { error: spendError } = await service.rpc('project_month_ai_spend', { p_project_id: project.id })
  if (spendError) bad(`project_month_ai_spend RPC: ${spendError.message}`)
  else ok('project_month_ai_spend RPC')

  finish()
}

function finish() {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.error('\nFailures:')
    failures.forEach((failure) => console.error(`  - ${failure}`))
    process.exit(1)
  }
}

main().catch((error) => {
  bad(error instanceof Error ? error.message : String(error))
  finish()
})
