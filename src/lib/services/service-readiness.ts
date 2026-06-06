export type ServiceStatus = 'ok' | 'warn' | 'error' | 'optional'
export type ServiceCategory = 'foundation' | 'ai' | 'content' | 'delivery' | 'automation'

export interface IntegrationHealth {
  name: string
  configured: boolean
  status: ServiceStatus
  detail: string
  category: ServiceCategory
  envVars: string[]
  localFallback: string
  unlocks: string
}

export interface ServiceDefinition {
  name: string
  category: ServiceCategory
  envVars: string[]
  requiredForLocal: boolean
  unlocks: string
  localFallback: string
  configured: (env: EnvLike) => boolean
  detail: (configured: boolean, env: EnvLike) => string
}

export type EnvLike = Record<string, string | undefined>

function has(env: EnvLike, key: string): boolean {
  return !!env[key]
}

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    name: 'Supabase',
    category: 'foundation',
    envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    requiredForLocal: true,
    unlocks: 'Database, auth, projects, campaigns, learnings, storage-backed app state',
    localFallback: 'None. This is the local app foundation.',
    configured: (env) => has(env, 'NEXT_PUBLIC_SUPABASE_URL') && has(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    detail: (configured) => configured ? 'Database + auth + storage ready' : 'Set Supabase URL, anon key, and service role key',
  },
  {
    name: 'OpenRouter',
    category: 'ai',
    envVars: ['OPENROUTER_API_KEY'],
    requiredForLocal: false,
    unlocks: 'Live AI generation for launch agents, ad copy, emails, SEO, social, and brand intelligence',
    localFallback: 'Use deterministic planning, saved brand voice, personas, campaign learning, and manual review loops.',
    configured: (env) => has(env, 'OPENROUTER_API_KEY'),
    detail: (configured) => configured ? 'Key set' : 'Local planning flow works now; add OPENROUTER_API_KEY when ready for live generation',
  },
  {
    name: 'Anthropic (Claude)',
    category: 'ai',
    envVars: ['ANTHROPIC_API_KEY'],
    requiredForLocal: false,
    unlocks: 'Higher-quality strategic agents and vision-heavy brand analysis',
    localFallback: 'Strategic paths fall back to the OpenRouter production model when available.',
    configured: (env) => has(env, 'ANTHROPIC_API_KEY'),
    detail: (configured) => configured ? 'Strategic agents can use Claude' : 'Optional strategy upgrade',
  },
  {
    name: 'Resend',
    category: 'delivery',
    envVars: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_WEBHOOK_SECRET'],
    requiredForLocal: false,
    unlocks: 'Outbound email sends, sequence ticks, delivery events, and reply/bounce webhooks',
    localFallback: 'Email copy, sequences, winners, and daily summaries can be planned without sending.',
    configured: (env) => has(env, 'RESEND_API_KEY') && has(env, 'RESEND_FROM_EMAIL'),
    detail: (configured) => configured ? 'Email send + webhooks live' : 'Optional; email planning still works without sending',
  },
  {
    name: 'ScreenshotOne',
    category: 'content',
    envVars: ['SCREENSHOTONE_ACCESS_KEY', 'SCREENSHOT_STORAGE_BUCKET'],
    requiredForLocal: false,
    unlocks: 'Fresh rendered product screenshots during ingest',
    localFallback: 'Brand sync and campaign planning continue without fresh UI captures.',
    configured: (env) => has(env, 'SCREENSHOTONE_ACCESS_KEY'),
    detail: (configured, env) => configured
      ? has(env, 'SCREENSHOT_STORAGE_BUCKET') ? 'Capturing + mirroring to Storage' : 'Capturing; set SCREENSHOT_STORAGE_BUCKET to mirror'
      : 'Optional; ingest continues without fresh screenshots',
  },
  {
    name: 'Video providers',
    category: 'content',
    envVars: ['FAL_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'],
    requiredForLocal: false,
    unlocks: 'Video generation and render polling',
    localFallback: 'Video scripts, briefs, and creative direction can be prepared before provider keys exist.',
    configured: (env) => has(env, 'FAL_KEY') || has(env, 'OPENAI_API_KEY') || has(env, 'XAI_API_KEY'),
    detail: (configured, env) => {
      if (!configured) return 'Optional; set FAL_KEY / OPENAI_API_KEY / XAI_API_KEY for video generation'
      return [
        has(env, 'FAL_KEY') && 'fal',
        has(env, 'OPENAI_API_KEY') && 'openai',
        has(env, 'XAI_API_KEY') && 'xai',
      ].filter(Boolean).join(', ')
    },
  },
  {
    name: 'Social tokens',
    category: 'delivery',
    envVars: ['SOCIAL_TOKEN_ENC_KEY'],
    requiredForLocal: false,
    unlocks: 'Encrypted X / LinkedIn token storage and scheduled publishing',
    localFallback: 'Social posts can be generated, scored, queued conceptually, and exported for manual publishing.',
    configured: (env) => has(env, 'SOCIAL_TOKEN_ENC_KEY'),
    detail: (configured) => configured ? 'Encryption key set; tokens stored AES-256-GCM' : 'Optional until live social publishing is needed',
  },
  {
    name: 'Webhook outbox',
    category: 'automation',
    envVars: ['CRON_SECRET'],
    requiredForLocal: false,
    unlocks: 'Authenticated cron drainers for webhook delivery, social publishing, email ticks, and job retries',
    localFallback: 'Manual tests and local route calls still work; background automation waits for CRON_SECRET.',
    configured: (env) => has(env, 'CRON_SECRET'),
    detail: (configured) => configured ? 'Cron drainer authenticated' : 'Optional until scheduled automation is needed',
  },
]

export function computeServiceIntegrations(env: EnvLike, hasRecentAiCalls = false): IntegrationHealth[] {
  return SERVICE_DEFINITIONS.map((service) => {
    const configured = service.configured(env)
    let status: ServiceStatus = configured ? 'ok' : service.requiredForLocal ? 'error' : 'optional'
    let detail = service.detail(configured, env)

    if (service.name === 'OpenRouter' && configured && !hasRecentAiCalls) {
      status = 'warn'
      detail = 'Configured, no recent calls'
    }

    return {
      name: service.name,
      configured,
      status,
      detail,
      category: service.category,
      envVars: service.envVars,
      localFallback: service.localFallback,
      unlocks: service.unlocks,
    }
  })
}

export function countLocalBlockers(integrations: IntegrationHealth[]): number {
  return integrations.filter((i) => i.status === 'error' && i.category === 'foundation').length
}

export function countConfiguredProviderServices(integrations: IntegrationHealth[]): number {
  return integrations.filter((i) => i.configured && i.category !== 'foundation').length
}
