# GrowthOS Marketing Operating Loop Plan

Goal: make GrowthOS the system that can take any app and answer, then execute: **who should we market to, what should we say, where should we say it, what assets do we need, what worked, and what should we do next?**

This plan optimizes for a self-use founder/operator workflow first. It should feel like a marketing strategist plus execution cockpit, not a collection of disconnected modules.

## Product North Star

For each app/project, GrowthOS should run this loop:

1. **Understand the app**
   - Ingest website, classify product, extract positioning, ICP, features, design tokens, competitors, market context.
2. **Create a marketing blueprint**
   - Recommend channels, KPI, content mix, lifecycle emails, CRO focus, launch tactics, and readiness gaps.
3. **Plan a campaign**
   - Pick goal, campaign angle, channels, timeline, budget, assets needed, and success metrics.
4. **Generate assets**
   - Ads, social, email, blog, landing pages, video/image prompts, and tracking plan from one shared strategy.
5. **Operate the campaign**
   - Review, approve, publish/export, schedule, and track assets from a single campaign command center.
6. **Measure results**
   - Log or import metrics by campaign/channel/asset.
7. **Learn and improve**
   - Promote winners into style memory, extract insights, recommend next best action, and improve the next launch.

## Phase 1 — Unified Marketing Memory

### Problem

Generation paths currently pull different slices of context. Launch insights, ad insights, founder voice, style references, classification, and playbook data are not consistently available to every generator.

### Build

Create `src/lib/marketing/memory.ts`.

It should gather:

- Project core fields: name, website, description.
- `brand_voice`: tagline, value proposition, audience, features, differentiators, tone, design tokens.
- Classification: vertical, ICP, business model, stage, primary goal, compliance flags.
- Blueprint/playbook: channels, KPI, content mix, launch tactics, CRO focus, lifecycle emails.
- Launch insights: `brand_voice.insights.current` and recent history.
- Ad insights: latest rows from `ad_insights`.
- Founder voice: user-scoped voice samples.
- Style refs: winning social/email/ad/content examples by asset kind.

### API

```ts
getMarketingMemory({
  supabase,
  userId,
  projectId,
  assetKind?: string,
  channel?: string,
}): Promise<MarketingMemory>
```

Also provide:

```ts
marketingMemoryPrompt(memory, surface)
```

Surfaces:

- `launch_strategy`
- `ad_copy`
- `social_post`
- `email`
- `blog`
- `landing_page`
- `video`
- `image`

### Acceptance Criteria

- All major generators can consume one shared prompt block.
- Ad Studio includes launch insights.
- Launch generators include founder voice/style refs where relevant.
- Tests cover fallback behavior when optional memory pieces are absent.

## Phase 2 — Blueprint-Driven Launch

### Problem

The dashboard now shows a Marketing Blueprint, but Launch still feels like a one-click black box. The operator should see what GrowthOS recommends before spending AI budget.

### Build

Update `/launch` UI to show a **Recommended Launch Plan** before launching:

- Detected vertical and ICP.
- Primary KPI.
- Recommended channels from blueprint.
- Why each channel is selected.
- Suggested campaign angle.
- Suggested content mix.
- Readiness checks.
- Toggles to include/exclude channels.

Update `/api/launch` to accept:

```ts
{
  projectId: string
  campaignId?: string
  channels?: Channel[]
  goal?: string
  angle?: string
}
```

Server must still validate channels against the playbook unless manually overridden.

### Acceptance Criteria

- Launch page explains why it is choosing each channel.
- User can disable channels before running.
- Launch request uses selected channels.
- Launch response/campaign metadata stores the selected blueprint snapshot.

## Phase 3 — Campaign Command Center

### Problem

Campaigns exist, but the operating workflow is fragmented across Ad Studio, Social, Email, Content, Leads, Analytics, and Launch.

### Build

Make `/campaigns/[id]` the central operating page.

Sections:

- Strategy:
  - campaign goal
  - ICP
  - core narrative
  - primary KPI
  - channel plan
- Assets:
  - ads
  - social posts
  - emails/sequences
  - blog/content
  - landing pages
  - videos/images
- Execution:
  - publish/schedule/export actions
  - “needs review” queue
  - “ready to deploy” queue
- Metrics:
  - spend
  - clicks
  - conversions
  - leads
  - conversion rate
  - cost per lead
- Learnings:
  - launch insights
  - winning assets
  - recommended next test

### Data Flow

Every generation route should accept optional `campaignId` and persist it wherever the table supports it.

Immediate targets:

- `ad_briefs.campaign_id`
- `social_posts.campaign_id` if column exists or add migration if needed
- `content_pieces.campaign_id`
- `landing_pages.campaign_id`
- `leads.campaign_id`
- email sequence/template metadata or schema extension

### Acceptance Criteria

- Launch can create a new campaign or use an existing campaign.
- Ad Studio generation can attach to a campaign.
- Campaign detail shows all related assets without relying only on metadata.
- Campaign page is the best place to operate the campaign.

## Phase 4 — Manual Metrics Logger

### Problem

Analytics reads `campaign_metrics`, but the app does not have a simple self-use way to populate it. Without metrics, the feedback loop is weak.

### Build

Add a metrics entry UI:

Location options:

- First: `/campaigns/[id]` Metrics tab/section.
- Later: `/analytics` import/manager.

Fields:

- date
- channel
- impressions
- clicks
- conversions
- spend
- revenue
- notes/source

Support:

- quick daily entry
- CSV paste/import later
- edit/delete rows

Derived metrics:

- CTR
- conversion rate
- CPC
- CPL
- ROAS

### Acceptance Criteria

- A campaign can have manually entered daily metrics.
- Analytics page immediately reflects entered metrics.
- Campaign command center shows channel performance.
- Empty analytics states explain how to add metrics.

## Phase 5 — Next Best Action Engine

### Problem

The app shows many modules. It should tell the operator what to do next.

### Build

Create `src/lib/marketing/next-action.ts`.

Inputs:

- project readiness
- blueprint readiness
- campaign state
- asset review status
- publish status
- lead/metric availability
- winner availability
- budget/cost status

Output:

```ts
{
  priority: 'high' | 'medium' | 'low'
  title: string
  reason: string
  ctaLabel: string
  href: string
}
```

Examples:

- “Sync this project website.”
- “Run your first launch.”
- “Review 5 generated assets.”
- “Publish your LinkedIn post.”
- “Log campaign metrics.”
- “Promote the winning email style.”
- “Try a new angle based on the top performer.”

### Acceptance Criteria

- Dashboard shows one primary next action.
- Campaign page shows campaign-specific next action.
- Next action is deterministic and test-covered.

## Phase 6 — Feedback And Learning Loop

### Problem

Winner detection exists, but learnings are not consistently transformed into new experiments.

### Build

Add a **Learning Summary** per campaign:

- best channel
- best asset
- strongest hook
- weakest channel
- recommended next experiment
- reusable style notes

Sources:

- manual metrics
- social/email winners
- ad scores
- launch/director insights
- style references

Store in campaign metadata or `brand_voice.insights.history`.

### Acceptance Criteria

- Campaign page can summarize what worked.
- Next Launch uses prior learnings via Marketing Memory.
- Style refs influence all relevant generators.

## Phase 7 — Better Publishing For Self-Use

### Problem

Paid publishing APIs are expensive to build and not needed immediately, but exporting/publishing should be smoother.

### Build

Low-friction self-use publishing:

- Copy-ready asset cards.
- UTM builder for each channel.
- Export campaign pack as markdown/CSV.
- “Open platform composer” links with copied text.
- Calendar view of launch tasks.

Later:

- Meta/Google paid ads API only if the manual flow proves useful.

### Acceptance Criteria

- User can run a campaign without copy/pasting from many places manually.
- Every asset has tracking URL / UTM metadata.
- Exported campaign pack is useful as a launch checklist.

## Recommended Build Order

1. **Marketing Memory**
   - Highest leverage because it improves every generator.
2. **Blueprint-Driven Launch**
   - Makes recommendations visible and controllable.
3. **Campaign Command Center**
   - Turns campaigns into the operating spine.
4. **Manual Metrics Logger**
   - Makes analytics and learning real without external integrations.
5. **Next Best Action**
   - Makes the app guide the operator.
6. **Feedback Learning Summary**
   - Makes every campaign improve the next.
7. **Export/Publish Workflow**
   - Makes execution easier without overbuilding APIs.

## Success Definition

GrowthOS is working when, for any new app, the operator can:

1. Create project and sync URL.
2. See a credible marketing blueprint.
3. Launch a recommended campaign with editable channels/angle.
4. Review and publish/export assets from one campaign page.
5. Log simple results.
6. See what worked.
7. Generate the next campaign with those learnings automatically included.

## Not Prioritized Yet

- Multi-user orgs/RBAC.
- Stripe/billing.
- Full paid ads API publishing.
- Enterprise observability.
- Complex external data warehouse integration.

These become relevant only if GrowthOS becomes customer-facing SaaS.
