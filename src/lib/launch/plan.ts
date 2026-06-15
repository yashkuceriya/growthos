// Launch planner — pure, no I/O. Given a project + memory bundle, returns
// the recommended channel mix, KPI, content mix, angles, and defaults the
// `/launch` UI presents before the operator commits AI budget. Keeping this
// pure means it's easy to unit-test and the same logic powers both the GET
// preview endpoint and the POST run validator.
import { getPlaybook, type Channel as PlaybookChannel } from '@/lib/ai/playbooks/registry'
import type { MarketingMemory } from '@/lib/marketing/memory'
import type { MarketingPersona } from '@/lib/marketing/personas'
import type { PersonaLearningDigest } from '@/lib/marketing/persona-learning'

// The 8 channels the orchestrator actually implements today. The playbook
// registry knows about many more (google_search, product_hunt, etc.) but
// the launch route can only generate assets for these. We map and intersect.
export const LAUNCH_CHANNELS = ['meta', 'linkedin', 'tiktok', 'twitter', 'reddit', 'email', 'blog', 'landing'] as const
export type LaunchChannel = typeof LAUNCH_CHANNELS[number]

export function isLaunchChannel(value: unknown): value is LaunchChannel {
  return typeof value === 'string' && (LAUNCH_CHANNELS as readonly string[]).includes(value)
}

export interface LaunchChannelRecommendation {
  channel: LaunchChannel
  tier: 'primary' | 'secondary' | 'off'
  // Short human rationale for the operator: why is this channel in/out for
  // this product? Shown directly in the launch preview card.
  reason: string
  // Default-selected. Primary always on; secondary on; off off.
  defaultOn: boolean
}

export interface LaunchStrategyBrief {
  summary: string
  goalRationale: string
  channelRationale: string
  risk: string
  learningObjective: string
  confidence: 'low' | 'medium' | 'high'
}

export interface LaunchExperiment {
  name: string
  hypothesis: string
  channels: LaunchChannel[]
  successMetric: string
}

export interface LaunchExecutionTask {
  id: string
  owner: 'Strategy' | 'Channel' | 'Measurement' | 'Answer Engine'
  title: string
  detail: string
  metric: string
  channel?: LaunchChannel
}

export interface AnswerEnginePlan {
  recommended: boolean
  reason: string
  assets: string[]
  queries: string[]
}

export interface LaunchPlan {
  vertical: string
  icp: string | null
  primaryGoal: string | null
  primaryKpi: string
  secondaryKpis: string[]
  channels: LaunchChannelRecommendation[]
  defaultChannels: LaunchChannel[]
  contentMix: Array<{ label: string; pct: number }>
  launchTactics: string[]
  croFocus: string[]
  lifecycleEmails: string[]
  readiness: Array<{ label: string; ready: boolean; hint: string }>
  // 3-4 angle starters. Pulled from launch insights if available, otherwise
  // generated from the product's value prop + tactics. Operator can replace.
  suggestedAngles: string[]
  defaultGoal: string
  defaultAngle: string | null
  strategy: LaunchStrategyBrief
  experiments: LaunchExperiment[]
  answerEngine: AnswerEnginePlan
  // Whether the plan came from a real classification or fell back to the
  // generic playbook. UI uses this to nudge the operator to sync the site.
  source: 'classification' | 'fallback'
}

export interface BuildLaunchPlanArgs {
  memory: MarketingMemory
  persona?: MarketingPersona | null
  personaLearning?: PersonaLearningDigest | null
}

export interface LaunchExecutionLearning {
  bestChannel?: { channel: string; reason: string } | null
  worstChannel?: { channel: string; reason: string } | null
  strongestHook?: string | null
  recommendedNext?: string[]
  decisionLoop?: {
    doNow?: string[]
    stopDoing?: string[]
    testNext?: string[]
  }
}

export interface BuildLaunchExecutionBriefArgs {
  plan: LaunchPlan
  selectedChannels?: LaunchChannel[]
  projectName?: string | null
  personaName?: string | null
  goal?: string | null
  angle?: string | null
  priorLearning?: LaunchExecutionLearning | null
}

export interface BuildLaunchExecutionChecklistArgs {
  plan: LaunchPlan
  selectedChannels?: LaunchChannel[]
  goal?: string | null
  angle?: string | null
}

export function buildLaunchPlan({ memory, persona, personaLearning }: BuildLaunchPlanArgs): LaunchPlan {
  const vertical = memory.blueprint.vertical
  const playbook = getPlaybook(vertical)

  const primarySet = new Set<PlaybookChannel>(playbook.primary_channels)
  const secondarySet = new Set<PlaybookChannel>(playbook.secondary_channels)
  const personaFit = persona ? personaChannelFit(persona) : null

  const channels: LaunchChannelRecommendation[] = LAUNCH_CHANNELS.map((ch) => {
    const pbCh = ch as PlaybookChannel
    const playbookTier = primarySet.has(pbCh) ? 'primary' : secondarySet.has(pbCh) ? 'secondary' : 'off'
    const fit = personaFit?.get(ch) ?? null
    const learningFit = personaLearningChannelFit(ch, personaLearning)
    const tier = adjustedTier(playbookTier, fit, learningFit)

    if (tier === 'primary') {
      return {
        channel: ch,
        tier: 'primary',
        reason: channelReason(ch, 'primary', vertical, fit, learningFit),
        defaultOn: true,
      }
    }
    if (tier === 'secondary') {
      return {
        channel: ch,
        tier: 'secondary',
        reason: channelReason(ch, 'secondary', vertical, fit, learningFit),
        defaultOn: true,
      }
    }
    return {
      channel: ch,
      tier: 'off',
      reason: channelReason(ch, 'off', vertical, fit, learningFit),
      defaultOn: false,
    }
  })

  const defaultChannels = channels.filter((c) => c.defaultOn).map((c) => c.channel)

  const suggestedAngles = angleSuggestions(memory, personaLearning)
  const goalPlan = personaGoalPlan(memory, persona)
  const defaultGoal = goalPlan.goal
  const defaultAngle = suggestedAngles[0] ?? null
  const answerEngine = answerEnginePlan(memory, persona, defaultChannels)
  const experiments = experimentDesign(memory, persona, channels, defaultGoal, personaLearning)
  const strategy = strategyBrief(memory, persona, channels, defaultGoal, goalPlan.rationale, answerEngine, personaLearning)

  return {
    vertical,
    icp: memory.classification.icp,
    primaryGoal: memory.classification.primaryGoal,
    primaryKpi: playbook.kpis.primary,
    secondaryKpis: playbook.kpis.secondary,
    channels,
    defaultChannels,
    contentMix: memory.blueprint.contentMix,
    launchTactics: memory.blueprint.launchTactics,
    croFocus: memory.blueprint.croFocus,
    lifecycleEmails: memory.blueprint.lifecycleEmails,
    readiness: memory.blueprint.readiness,
    suggestedAngles,
    defaultGoal,
    defaultAngle,
    strategy,
    experiments,
    answerEngine,
    source: vertical === 'other' ? 'fallback' : 'classification',
  }
}

export function buildLaunchExecutionBrief({
  plan,
  selectedChannels,
  projectName,
  personaName,
  goal,
  angle,
  priorLearning,
}: BuildLaunchExecutionBriefArgs): string {
  const channels = selectedChannels?.length
    ? plan.channels.filter((c) => selectedChannels.includes(c.channel))
    : plan.channels.filter((c) => c.defaultOn)
  const channelNames = channels.map((c) => channelLabel(c.channel))
  const selectedGoal = goal?.trim() || plan.defaultGoal
  const selectedAngle = angle?.trim() || plan.defaultAngle || plan.suggestedAngles[0] || 'Pick the strongest problem/outcome angle before publishing.'
  const checklist = buildLaunchExecutionChecklist({ plan, selectedChannels, goal: selectedGoal, angle: selectedAngle })
  const doNow = priorLearning?.decisionLoop?.doNow ?? []
  const stopDoing = priorLearning?.decisionLoop?.stopDoing ?? []
  const testNext = priorLearning?.decisionLoop?.testNext ?? priorLearning?.recommendedNext ?? []

  const lines = [
    `# Launch brief: ${projectName?.trim() || 'Current project'}`,
    '',
    '## Operating choices',
    `- Goal: ${selectedGoal}`,
    `- Persona: ${personaName?.trim() || plan.icp || 'Primary buyer'}`,
    `- Primary KPI: ${plan.primaryKpi}`,
    `- Narrative angle: ${selectedAngle}`,
    `- Channels: ${channelNames.length ? channelNames.join(', ') : 'Pick one focused channel before publishing.'}`,
    '',
    '## Strategy',
    `- Summary: ${plan.strategy.summary}`,
    `- Goal logic: ${plan.strategy.goalRationale}`,
    `- Channel logic: ${plan.strategy.channelRationale}`,
    `- Learning objective: ${plan.strategy.learningObjective}`,
    `- Risk to watch: ${plan.strategy.risk}`,
    '',
    '## Channel actions',
    ...channels.map((c) => `- ${channelLabel(c.channel)} (${c.tier}): ${c.reason}`),
    '',
    '## Manual checklist',
    ...checklist.map((task) => `- [ ] ${task.title}: ${task.detail} Metric: ${task.metric}`),
    '',
    '## Experiments',
    ...plan.experiments.map((e) => `- ${e.name}: ${e.hypothesis} Success metric: ${e.successMetric}`),
    '',
    '## Answer-engine work',
    `- Recommendation: ${plan.answerEngine.recommended ? 'Do it in this launch' : 'Optional for this launch'}`,
    `- Why: ${plan.answerEngine.reason}`,
    ...plan.answerEngine.assets.map((asset) => `- Asset: ${asset}`),
    ...plan.answerEngine.queries.map((query) => `- Query: ${query}`),
    '',
    '## Next 48 hours',
    '- Tighten the narrative angle until it names the buyer, pain, outcome, and proof.',
    '- Ship the highest-fit selected channel first, then reuse the winning hook in the next channel.',
    '- Log manual metrics on the campaign page so the learning loop improves the next launch.',
  ]

  if (plan.readiness.some((item) => !item.ready)) {
    lines.push(
      '',
      '## Readiness gaps',
      ...plan.readiness.filter((item) => !item.ready).map((item) => `- ${item.label}: ${item.hint}`),
    )
  }

  if (doNow.length || stopDoing.length || testNext.length || priorLearning?.strongestHook || priorLearning?.bestChannel || priorLearning?.worstChannel) {
    lines.push('', '## Prior campaign learning')
    if (priorLearning?.bestChannel) lines.push(`- Keep: ${priorLearning.bestChannel.channel}: ${priorLearning.bestChannel.reason}`)
    if (priorLearning?.worstChannel) lines.push(`- Avoid: ${priorLearning.worstChannel.channel}: ${priorLearning.worstChannel.reason}`)
    if (priorLearning?.strongestHook) lines.push(`- Strongest hook: ${priorLearning.strongestHook}`)
    for (const item of doNow.slice(0, 3)) lines.push(`- Do now: ${item}`)
    for (const item of stopDoing.slice(0, 3)) lines.push(`- Stop doing: ${item}`)
    for (const item of testNext.slice(0, 3)) lines.push(`- Test next: ${item}`)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function buildLaunchExecutionChecklist({
  plan,
  selectedChannels,
  goal,
  angle,
}: BuildLaunchExecutionChecklistArgs): LaunchExecutionTask[] {
  const channels = selectedChannels?.length
    ? selectedChannels
    : plan.defaultChannels
  const selectedChannelRecs = plan.channels.filter((c) => channels.includes(c.channel))
  const selectedGoal = goal?.trim() || plan.defaultGoal
  const selectedAngle = angle?.trim() || plan.defaultAngle || plan.suggestedAngles[0] || 'the selected narrative angle'
  const tasks: LaunchExecutionTask[] = [
    {
      id: 'strategy-angle',
      owner: 'Strategy',
      title: 'Lock the launch angle',
      detail: `Rewrite the angle into one sentence naming the buyer, pain, outcome, and proof: ${selectedAngle}`,
      metric: 'Angle approved for clarity before publishing',
    },
  ]

  for (const rec of selectedChannelRecs) {
    const play = channelExecutionPlay(rec.channel, selectedGoal)
    tasks.push({
      id: `channel-${rec.channel}`,
      owner: 'Channel',
      channel: rec.channel,
      title: `Ship ${channelLabel(rec.channel)} asset`,
      detail: play.action,
      metric: play.metric,
    })
  }

  if (plan.answerEngine.recommended) {
    tasks.push({
      id: 'answer-engine',
      owner: 'Answer Engine',
      title: 'Publish answer-engine support',
      detail: `Create ${plan.answerEngine.assets.slice(0, 2).join(' and ')} from the launch angle.`,
      metric: 'At least one FAQ, comparison, or answer snippet is live',
    })
  }

  tasks.push({
    id: 'measurement-log',
    owner: 'Measurement',
    title: 'Log campaign metrics',
    detail: 'Record first signals on the campaign page after 24-48 hours so the learning loop can improve the next launch.',
    metric: plan.experiments[0]?.successMetric ?? plan.primaryKpi,
  })

  return tasks
}

// Pulls 3-4 narrative-angle starters out of memory. Prefers angles distilled
// by past launches (insights.current.winning_hooks). Falls back to value-prop
// derivatives so a brand-new project still gets options instead of an empty
// state.
function angleSuggestions(memory: MarketingMemory, personaLearning: PersonaLearningDigest | null | undefined): string[] {
  const current = memory.launchInsights.current
  const fromPersonaLearning = personaLearningAngles(personaLearning)
  const fromInsights = currentInsightAngles(current)
  if ([...fromPersonaLearning, ...fromInsights].length >= 3) return unique([...fromPersonaLearning, ...fromInsights]).slice(0, 4)

  const fromBlueprint = blueprintAngles(memory)
  const merged = unique([...fromPersonaLearning, ...fromInsights, ...fromBlueprint])
  return merged.slice(0, 4)
}

function personaLearningAngles(personaLearning: PersonaLearningDigest | null | undefined): string[] {
  if (!personaLearning) return []
  const persona = personaLearning.personaName ?? 'this persona'
  const bestChannel = personaLearning.bestChannel ? normalizeChannelAlias(personaLearning.bestChannel) : null
  const learned = [
    ...personaLearning.recommendedNext,
    personaLearning.insightSignal && !/^best channel:/i.test(personaLearning.insightSignal)
      ? personaLearning.insightSignal
      : null,
    bestChannel ? `Follow up on ${channelLabel(bestChannel)} for ${persona}` : null,
  ]
  return learned.filter((item): item is string => typeof item === 'string' && item.trim().length > 6).map((item) => item.trim())
}

function currentInsightAngles(current: unknown): string[] {
  if (!current || typeof current !== 'object') return []
  const c = current as Record<string, unknown>
  const winning: unknown[] = Array.isArray(c.winning_hooks) ? c.winning_hooks : []
  const themesRaw = c.recommended_themes ?? c.next_experiments
  const themes: unknown[] = Array.isArray(themesRaw) ? themesRaw : []
  return [...winning, ...themes]
    .filter((s): s is string => typeof s === 'string' && s.length > 6)
    .map((s) => s.trim())
}

function blueprintAngles(memory: MarketingMemory): string[] {
  const tactics = memory.blueprint.launchTactics
  const product = memory.project.name || 'this product'
  const audience = memory.brand.audience ?? memory.classification.icp ?? 'your audience'
  const angles: string[] = []
  if (memory.brand.valueProp) angles.push(`Lead with the core promise: ${memory.brand.valueProp}`)
  if (memory.brand.differentiators[0]) angles.push(`Contrast against the alternative: ${memory.brand.differentiators[0]}`)
  if (tactics[0]) angles.push(`Anchor the campaign on ${tactics[0]}`)
  angles.push(`Speak directly to ${audience} about why ${product} is built for them`)
  return angles
}

type PersonaFit = 'preferred' | 'adjacent' | 'mismatch'
type PersonaLearningChannelFit = 'best' | 'worst'

function adjustedTier(tier: 'primary' | 'secondary' | 'off', fit: PersonaFit | null, learningFit: PersonaLearningChannelFit | null = null): 'primary' | 'secondary' | 'off' {
  if (learningFit === 'best') return 'primary'
  if (learningFit === 'worst') return tier === 'primary' ? 'secondary' : 'off'
  if (fit === 'preferred') return tier === 'off' ? 'secondary' : 'primary'
  if (fit === 'adjacent') return tier === 'off' ? 'secondary' : tier
  if (fit === 'mismatch') return tier === 'primary' ? 'secondary' : 'off'
  return tier
}

function personaLearningChannelFit(channel: LaunchChannel, personaLearning: PersonaLearningDigest | null | undefined): PersonaLearningChannelFit | null {
  if (!personaLearning) return null
  if (personaLearning.bestChannel && normalizeChannelAlias(personaLearning.bestChannel) === channel) return 'best'
  if (personaLearning.worstChannel && normalizeChannelAlias(personaLearning.worstChannel) === channel) return 'worst'
  return null
}

function normalizeChannelAlias(channel: string): LaunchChannel | null {
  const normalized = channel.toLowerCase().replace(/[_\s]+/g, '-')
  if (normalized === 'x') return 'twitter'
  if (normalized === 'email-lifecycle') return 'email'
  if (normalized === 'seo' || normalized === 'content') return 'blog'
  if (normalized === 'facebook' || normalized === 'instagram') return 'meta'
  return isLaunchChannel(normalized) ? normalized : null
}

function personaChannelFit(persona: MarketingPersona): Map<LaunchChannel, PersonaFit> {
  const preferred = new Set(persona.preferredChannels.map((channel) => channel.toLowerCase()))
  const fits = new Map<LaunchChannel, PersonaFit>()

  for (const channel of LAUNCH_CHANNELS) {
    if (preferred.has(channel)) fits.set(channel, 'preferred')
  }

  if (preferred.has('social')) {
    for (const channel of ['twitter', 'linkedin', 'reddit', 'tiktok'] as const) {
      if (!fits.has(channel)) fits.set(channel, 'adjacent')
    }
  }
  if (preferred.has('ads')) {
    for (const channel of ['meta', 'linkedin', 'tiktok'] as const) {
      if (!fits.has(channel)) fits.set(channel, 'adjacent')
    }
  }
  if (preferred.has('seo') || preferred.has('content')) {
    for (const channel of ['blog', 'landing'] as const) {
      if (!fits.has(channel)) fits.set(channel, 'adjacent')
    }
  }

  for (const channel of LAUNCH_CHANNELS) {
    if (!fits.has(channel) && preferred.size > 0) fits.set(channel, 'mismatch')
  }

  return fits
}

function channelReason(channel: LaunchChannel, tier: 'primary' | 'secondary' | 'off', vertical: string, fit: PersonaFit | null, learningFit: PersonaLearningChannelFit | null = null): string {
  const verticalLabel = vertical === 'other' ? 'this product type' : vertical.replace(/_/g, ' ')
  if (learningFit === 'best') return `${channelLabel(channel)} has recent persona-specific evidence, so GrowthOS promotes it for this launch.`
  if (learningFit === 'worst' && tier === 'off') return `${channelLabel(channel)} underperformed for this persona, so it stays off until the angle changes.`
  if (learningFit === 'worst') return `${channelLabel(channel)} underperformed for this persona, so GrowthOS keeps it as a supporting test instead of the lead channel.`
  if (fit === 'preferred') return `${channelLabel(channel)} is a preferred persona channel, so GrowthOS prioritizes it for this buyer.`
  if (fit === 'adjacent') return `${channelLabel(channel)} is adjacent to this persona's preferred channels and useful as a supporting test.`
  if (fit === 'mismatch' && tier === 'off') return `${channelLabel(channel)} is not a strong fit for this persona's preferred channels. Enable only with a specific reason.`
  if (tier === 'primary') return `Recommended for ${verticalLabel}: the playbook puts ${channelLabel(channel)} in the top channel mix.`
  if (tier === 'secondary') return `Secondary fit for ${verticalLabel}: useful as a multiplier, lower expected ROI than primary channels.`
  return `Outside the recommended playbook for ${verticalLabel}. Enable manually if you have a specific reason.`
}

function channelLabel(channel: LaunchChannel): string {
  switch (channel) {
    case 'meta': return 'Meta (Facebook + Instagram)'
    case 'linkedin': return 'LinkedIn'
    case 'tiktok': return 'TikTok'
    case 'twitter': return 'Twitter / X'
    case 'reddit': return 'Reddit'
    case 'email': return 'email lifecycle'
    case 'blog': return 'long-form blog / SEO'
    case 'landing': return 'landing page'
  }
}

function channelExecutionPlay(channel: LaunchChannel, goal: string): { action: string; metric: string } {
  switch (channel) {
    case 'meta':
      return {
        action: 'Publish one paid or manual Meta creative using the strongest hook. Keep spend tiny until CTR and lead quality show signal.',
        metric: goal === 'awareness' ? 'CPM, thumb-stop rate, and CTR' : 'CTR, cost per lead, and landing-page conversion',
      }
    case 'linkedin':
      return {
        action: 'Post the practical founder/operator version first, then reuse the same hook as sponsored content only if organic comments or clicks appear.',
        metric: 'Comments, saves, profile clicks, and qualified leads',
      }
    case 'tiktok':
      return {
        action: 'Record the hook as a native short video. Test organically before considering paid boost.',
        metric: '3-second view rate, completion rate, comments, and clicks',
      }
    case 'twitter':
      return {
        action: 'Publish the hook as a standalone post, then expand into a thread if replies or saves show interest.',
        metric: 'Replies, saves, profile visits, and link clicks',
      }
    case 'reddit':
      return {
        action: 'Post as a useful question or field note in one relevant community. Reply to every serious comment before posting anywhere else.',
        metric: 'Upvotes, comments, referral clicks, and objection themes',
      }
    case 'email':
      return {
        action: 'Send the most direct version to the warmest list segment first. Watch replies before automating the whole sequence.',
        metric: 'Open rate, click rate, replies, and unsubscribes',
      }
    case 'blog':
      return {
        action: 'Publish the answer-first article with FAQ and comparison sections, then link it from the landing page.',
        metric: 'Search impressions, clicks, time on page, and assisted conversions',
      }
    case 'landing':
      return {
        action: 'Update the landing hero to match the chosen angle and route all manual traffic through tracked links.',
        metric: 'Visits, CTA clicks, lead captures, and conversion rate',
      }
  }
}

function personaGoalPlan(memory: MarketingMemory, persona: MarketingPersona | null | undefined): { goal: string; rationale: string } {
  const baseGoal = mapPrimaryGoalToGoalString(memory.classification.primaryGoal)
  if (!persona) {
    return {
      goal: baseGoal,
      rationale: memory.classification.primaryGoal
        ? `Mapped classifier goal "${memory.classification.primaryGoal}" into the campaign goal "${baseGoal}".`
        : 'No classifier goal is set yet, so GrowthOS defaults to conversion until launch data says otherwise.',
    }
  }

  const label = `${persona.name} ${persona.role ?? ''} ${persona.vocabulary.join(' ')}`.toLowerCase()
  if (/growth|marketer|experiment|performance|creative|variant/.test(label)) {
    return {
      goal: 'engagement',
      rationale: `${persona.name} needs creative learning and signal quality, so the plan defaults to engagement before scaling conversion spend.`,
    }
  }
  if (/founder|builder|operator|launch|ship|mvp/.test(label)) {
    return {
      goal: 'conversion',
      rationale: `${persona.name} values momentum and usable outcomes, so the plan defaults to conversion-oriented assets.`,
    }
  }
  if (persona.skepticismLevel === 'high') {
    return {
      goal: 'conversion',
      rationale: `${persona.name} is high-skepticism, so GrowthOS emphasizes practical proof, clear CTAs, and conversion evidence.`,
    }
  }

  return {
    goal: baseGoal,
    rationale: `${persona.name} does not require a goal override, so GrowthOS keeps the project classifier goal.`,
  }
}

function strategyBrief(
  memory: MarketingMemory,
  persona: MarketingPersona | null | undefined,
  channels: LaunchChannelRecommendation[],
  defaultGoal: string,
  goalRationale: string,
  answerEngine: AnswerEnginePlan,
  personaLearning: PersonaLearningDigest | null | undefined,
): LaunchStrategyBrief {
  const personaName = persona?.name ?? memory.classification.icp ?? memory.brand.audience ?? 'the current audience'
  const primary = channels.filter((c) => c.tier === 'primary').map((c) => channelLabel(c.channel))
  const off = channels.filter((c) => c.tier === 'off').map((c) => channelLabel(c.channel))
  const source = memory.blueprint.vertical === 'other' ? 'fallback playbook' : `${memory.blueprint.vertical.replace(/_/g, ' ')} playbook`
  const confidence = memory.blueprint.vertical === 'other' ? 'medium' : persona ? 'high' : 'medium'
  const learningEvidence = personaLearningEvidence(personaLearning)

  return {
    summary: `Launch for ${personaName} using the ${source}, with ${defaultGoal} as the operating goal.${learningEvidence ? ` ${learningEvidence}` : ''}`,
    goalRationale,
    channelRationale: primary.length
      ? `Primary channels: ${primary.slice(0, 4).join(', ')}. ${off.length ? `Lower-fit channels stay off unless you have a reason: ${off.slice(0, 3).join(', ')}.` : 'No major channel exclusions.'}${personaLearning?.bestChannel ? ` Persona evidence favors ${personaLearning.bestChannel}.` : ''}`
      : 'No primary channel emerged yet; keep the launch narrow and use the first run to learn.',
    risk: persona?.skepticismLevel === 'high'
      ? 'Biggest risk: copy that sounds generic or over-automated. Use proof, sober language, and specific workflow details.'
      : 'Biggest risk: spreading effort across too many channels before one message has evidence.',
    learningObjective: personaLearning?.recommendedNext[0]
      ? `Validate persona learning: ${personaLearning.recommendedNext[0]}`
      : answerEngine.recommended
        ? 'Learn which persona/channel pair produces reusable hooks, then turn strongest answers into SEO and answer-engine assets.'
        : 'Learn which hook, CTA, and channel combination earns the first measurable response.',
    confidence,
  }
}

function personaLearningEvidence(personaLearning: PersonaLearningDigest | null | undefined): string | null {
  if (!personaLearning) return null
  const parts = [
    personaLearning.insightSignal,
    personaLearning.bestChannel ? `best channel: ${personaLearning.bestChannel}` : null,
    personaLearning.worstChannel ? `avoid/rework: ${personaLearning.worstChannel}` : null,
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
  if (parts.length === 0) return null
  return `Recent persona evidence: ${parts.slice(0, 2).join('; ')}.`
}

function experimentDesign(
  memory: MarketingMemory,
  persona: MarketingPersona | null | undefined,
  channels: LaunchChannelRecommendation[],
  defaultGoal: string,
  personaLearning: PersonaLearningDigest | null | undefined,
): LaunchExperiment[] {
  const primary = channels.filter((c) => c.defaultOn).map((c) => c.channel)
  const personaName = persona?.name ?? memory.classification.icp ?? 'primary buyer'
  const first = primary[0] ? [primary[0]] : ['landing' as const]
  const social = primary.filter((c) => ['linkedin', 'twitter', 'reddit', 'tiktok', 'meta'].includes(c)).slice(0, 2)
  const owned = primary.filter((c) => ['email', 'blog', 'landing'].includes(c)).slice(0, 2)
  const learnedChannel = personaLearning?.bestChannel ? normalizeChannelAlias(personaLearning.bestChannel) : null
  const learnedChannelList = learnedChannel ? [learnedChannel] : first

  return [
    {
      name: 'Hook clarity test',
      hypothesis: `${personaName} will respond better to a concrete pain/outcome hook than to broad product positioning.`,
      channels: first,
      successMetric: defaultGoal === 'engagement' ? 'reply, click, save, or quality score lift' : 'lead capture or CTA click',
    },
    {
      name: 'Channel fit test',
      hypothesis: personaLearning?.bestChannel
        ? `${personaName} already showed signal on ${personaLearning.bestChannel}; test whether the same angle can repeat before widening.`
        : `${personaName} will reveal the strongest acquisition path through the persona-preferred channel set.`,
      channels: learnedChannel ? learnedChannelList : social.length ? social as LaunchChannel[] : first,
      successMetric: 'best channel by click-through, conversion, or manually logged signal',
    },
    {
      name: 'Answer-engine proof test',
      hypothesis: 'Specific question-answer content will create reusable search and AI-discovery assets after the launch.',
      channels: owned.length ? owned as LaunchChannel[] : first,
      successMetric: 'indexed/postable FAQ, comparison, or answer asset with strong quality score',
    },
  ]
}

function answerEnginePlan(memory: MarketingMemory, persona: MarketingPersona | null | undefined, defaultChannels: LaunchChannel[]): AnswerEnginePlan {
  const audience = persona?.name ?? memory.classification.icp ?? memory.brand.audience ?? 'target buyers'
  const product = memory.project.name || 'this product'
  const recommended = defaultChannels.includes('blog') || defaultChannels.includes('landing')
  return {
    recommended,
    reason: recommended
      ? `Blog or landing page is in the plan, so GrowthOS should package this launch for answer engines as well as humans.`
      : 'No owned content channel is selected by default, so answer-engine assets are optional for this run.',
    assets: [
      'FAQ block answering buyer objections',
      'comparison paragraph against the status quo',
      'concise answer snippet for AI search citations',
    ],
    queries: [
      `What is ${product}?`,
      `How does ${product} help ${audience}?`,
      `Best way for ${audience} to solve ${memory.brand.valueProp ?? 'this workflow'}`,
    ],
  }
}

// Maps the classifier's primary_goal (awareness | signups | revenue | etc.)
// to the `campaign_goal` string the generators expect (awareness | conversion
// | engagement). Mirrors normalizeGoal in /api/ai/generate-ad.
function mapPrimaryGoalToGoalString(primaryGoal: string | null): string {
  if (!primaryGoal) return 'conversion'
  const g = primaryGoal.toLowerCase()
  if (g.includes('aware')) return 'awareness'
  if (g.includes('engage')) return 'engagement'
  return 'conversion'
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
