# GrowthOS Internal Product Plan

GrowthOS is an internal marketing operating system for launching and growing the
owner's apps. It should optimize for decision quality, reusable evidence, and
fast operator workflows rather than SaaS packaging, billing, or team tenancy.

## Research Signals

- Google Ads recommends one-variable hypotheses, one or two success metrics
  selected before launch, stable controls, and a retained record of experiment
  results. Its Experiment Center centralizes tests and applies winners back to
  campaigns.
- HubSpot treats a campaign as a goal, dates, budget, assets, and reporting in
  one operating view. GrowthOS already has most of those pieces but needs a
  stronger cross-surface decision layer.
- OpenAI and Anthropic both recommend simple, explicit workflows before adding
  autonomous multi-agent complexity. They emphasize evals, tool boundaries,
  output validation, guardrails, and human intervention for consequential
  actions.
- LaunchDarkly separates an experiment's iterations so changing a hypothesis,
  metric, or variation preserves the previous run. It also distinguishes sample
  completion from the statistical evidence used to make a decision.
- Optimizely identifies sample size, effect size, and complete business cycles
  as separate inputs to trustworthy experiment decisions.

Primary sources:

- https://support.google.com/google-ads/answer/7281575
- https://support.google.com/google-ads/answer/16856494
- https://knowledge.hubspot.com/campaigns/create-campaigns
- https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://launchdarkly.com/docs/home/experimentation/manage
- https://launchdarkly.com/docs/home/experimentation/size
- https://www.optimizely.com/optimization-glossary/statistical-significance

## Product Gaps

1. Experiment contracts and results now share a durable ledger, but automatic
   metric ingestion and campaign-asset attribution remain manual.
2. Agent output quality is scored for assets, but workflow-level agent results
   do not yet have regression evals or explicit approval thresholds.
3. Campaign learning exists, but experiment conclusions do not yet update the
   next sprint or persona memory automatically.
4. Automation is broad, but the operator still needs one queue showing what is
   proposed, what can run automatically, and what requires approval.

## Delivery Plan

### Phase 1: Experiment Command Center

Status: complete.

- Create a real experiment workspace from the current weekly sprint.
- Require one changed variable, primary and guardrail metrics, target lift,
  duration, sample guidance, and a precommitted decision rule.
- Score design readiness deterministically and export an operator brief.
- Link execution to Launch, persona evidence, campaign learning, and the
  existing hypothesis generator.

### Phase 2: Durable Evidence Ledger

Status: core ledger complete; automatic evidence ingestion remains.

- Preserve immutable experiment designs with explicit lifecycle transitions.
- Record control/treatment exposure, metric snapshots, decision, conclusion,
  and linked campaign/persona without overwriting prior sprints.
- Report no-signal, directional, and sample-complete evidence without claiming
  statistical significance.
- Next: ingest campaign metrics into running experiments and propose, but never
  silently apply, resulting campaign or persona-memory changes.

### Phase 3: Agent Evaluation Harness

- Build fixed project fixtures and scored outputs for strategy, copy, creative,
  launch, and analyst agents.
- Track task completion, schema validity, brand/persona fit, unsupported claims,
  cost, latency, and human edits across model changes.
- Route failed outputs to revision workflows; never auto-publish failed assets.

### Phase 4: Approval-Aware Automation

- Create one operator queue for drafts, experiment launches, budget changes,
  outbound sends, and social publishing.
- Classify actions as automatic, review-required, or blocked based on
  reversibility, spend, audience size, and confidence.
- Keep publishing and budget changes human-approved until enough local evidence
  supports narrower automation.

### Phase 5: Daily Operating Loop

- Morning: rank the next three decisions by expected value and evidence gap.
- During the day: generate, evaluate, and execute approved work.
- Evening: ingest outcomes, flag anomalies, and update persona/channel memory.
- Weekly: close experiments, preserve learnings, and generate the next sprint
  from observed evidence rather than a blank prompt.
