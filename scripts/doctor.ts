#!/usr/bin/env tsx

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local' })

type Check = {
  name: string
  ok: boolean
  detail: string
  required?: boolean
}

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
]

const optionalEnv = [
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'SCREENSHOTONE_ACCESS_KEY',
  'SOCIAL_TOKEN_ENC_KEY',
  'LEAD_CAPTURE_SIGNING_SECRET',
  'FAL_KEY',
  'OPENAI_API_KEY',
  'XAI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

const checks: Check[] = [
  {
    name: 'Next.js version',
    ok: pkg.dependencies?.next === '16.2.3',
    detail: `package.json uses next ${pkg.dependencies?.next ?? 'missing'}`,
    required: true,
  },
  {
    name: 'Next 16 local docs',
    ok: existsSync(join(root, 'node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md')),
    detail: 'node_modules/next/dist/docs is available for version-specific guidance',
    required: true,
  },
  {
    name: 'Supabase session proxy',
    ok: existsSync(join(root, 'src/proxy.ts')),
    detail: 'src/proxy.ts refreshes auth cookies before App Router requests',
    required: true,
  },
  {
    name: 'App error boundary',
    ok: existsSync(join(root, 'src/app/error.tsx')),
    detail: 'src/app/error.tsx catches uncaught UI errors',
  },
  {
    name: 'App 404 boundary',
    ok: existsSync(join(root, 'src/app/not-found.tsx')),
    detail: 'src/app/not-found.tsx handles unknown routes',
  },
]

for (const name of requiredEnv) {
  checks.push({
    name: `env:${name}`,
    ok: hasEnv(name),
    detail: hasEnv(name) ? 'set' : 'missing from .env.local',
    required: true,
  })
}

for (const name of optionalEnv) {
  checks.push({
    name: `env:${name}`,
    ok: hasEnv(name),
    detail: hasEnv(name) ? 'set' : 'not configured',
  })
}

const migrationsDir = join(root, 'supabase/migrations')
const migrations = existsSync(migrationsDir)
  ? readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  : []

checks.push({
  name: 'Supabase migrations',
  ok: migrations.length >= 26 && (migrations.at(-1)?.startsWith('026_') ?? false),
  detail: `${migrations.length} migration files found${migrations.at(-1) ? `, latest ${migrations.at(-1)}` : ''}`,
  required: true,
})

console.log('\nGrowthOS local doctor\n')

for (const check of checks) {
  const mark = check.ok ? 'OK' : check.required ? 'FAIL' : 'WARN'
  console.log(`${mark.padEnd(4)} ${check.name.padEnd(34)} ${check.detail}`)
}

const failed = checks.filter((check) => check.required && !check.ok)

if (failed.length > 0) {
  console.error(`\n${failed.length} required check${failed.length === 1 ? '' : 's'} failed.`)
  process.exit(1)
}

console.log('\nRequired local checks passed.')
