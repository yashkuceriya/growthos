@AGENTS.md

# GrowthOS — Marketing Command Center

## What This Is
Internal marketing & customer acquisition platform for managing campaigns, AI-generated ads, email, social media, content/SEO, leads, analytics, and budgets across multiple projects. Built to market SubTracker, Bookmarker, and any future product.

## Tech Stack
- **Framework**: Next.js 16.2.3 + React 19 + TypeScript (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **UI**: shadcn/ui (base-nova style, uses `@base-ui/react` — NO `asChild` prop, use children instead) + Tailwind CSS 4 + Lucide icons
- **AI**: Vercel AI SDK v6 (`ai` + `@ai-sdk/openai`) via OpenRouter. Token usage fields: `usage.inputTokens` / `usage.outputTokens` (NOT promptTokens/completionTokens)
- **State**: React Context (ProjectProvider) + TanStack React Query
- **Charts**: Recharts
- **Email**: Resend (Phase 2)

## Critical Build Notes
- Supabase clients are **untyped** (`createServerClient()` / `createBrowserClient()` without `<Database>` generic). This avoids `never` type errors. Will add proper types via `supabase gen types typescript` once DB is live.
- shadcn base-nova uses `@base-ui/react` — `DialogTrigger`, `DropdownMenuTrigger` etc do NOT support `asChild`. Just wrap children directly.
- `Select` `onValueChange` can return `null` — always guard: `onValueChange={(v) => v && setState(v)}`
- Vercel AI SDK v6 `generateObject` returns `{ object, usage }` where `usage.inputTokens` / `usage.outputTokens`

## Architecture
- Route groups: `(auth)` for login/signup, `(app)` for protected routes
- Auth guard in `(app)/layout.tsx` — redirects to `/login` if no user
- Everything is scoped to **projects** — each project = a product being marketed
- `ProjectProvider` context (`hooks/use-project.tsx`) wraps all `(app)` routes, persists active project to localStorage key `growthos-active-project`
- `ProjectSwitcher` in sidebar for switching between projects
- Supabase RLS: all tables have `auth.uid() = user_id` policy
- Server client: `lib/supabase/server.ts`, Browser client: `lib/supabase/client.ts`
- AI calls use `lib/ai/openrouter.ts` shared OpenRouter client config
- Cost tracking via `lib/cost-tracker.ts` → `ai_cost_ledger` table
- Emerald green accent color (bg-emerald-600), dark theme (bg-slate-900)

## Key Patterns
- **Client components**: Direct Supabase client calls for CRUD (no server actions for client-side mutations)
- **AI structured output**: `generateObject({ model: openrouter('model-id'), schema: ZodSchema, system, messages })`
- **SSE streaming**: API routes return `ReadableStream` with `data: JSON\n\n` format for progress updates
- **Page structure**: Each page is `'use client'` with `useProject()` hook, fetches data in `useEffect` on `activeProject.id` change

## Directory Layout
```
src/
  app/(auth)/              — login, signup, callback (Supabase auth)
  app/(app)/               — ALL protected routes:
    dashboard/page.tsx     — Module grid + quick stats
    projects/page.tsx      — CRUD with Dialog form
    campaigns/page.tsx     — Campaign list + create Dialog
    ad-studio/page.tsx     — Ad library + review queue (tabs: Review/Approved/All)
    ad-studio/generate/page.tsx — Brief form → SSE pipeline → redirect
    email/page.tsx         — Placeholder
    social/page.tsx        — Placeholder
    content/page.tsx       — Placeholder
    leads/page.tsx         — Placeholder
    analytics/page.tsx     — Placeholder
    budget/page.tsx        — Placeholder
    settings/page.tsx      — Placeholder
  app/api/ai/
    generate-ad/route.ts   — POST: creates brief, runs iterator pipeline, streams SSE, saves to DB
  lib/supabase/
    server.ts              — createClient() (cookies), createServiceClient() (service role)
    client.ts              — createClient() (browser)
    types.ts               — Database interface (kept for reference, NOT used in clients)
  lib/ai/
    openrouter.ts          — Shared OpenRouter client config
    ad-studio/
      schemas.ts           — Zod: AdCopySchema, DimensionScoreSchema, BatchedEvaluationSchema + TS interfaces
      rubrics.ts           — DIMENSION_WEIGHTS, thresholds, HOOK_FRAMEWORKS, buildSystemPrompt, buildEvaluationPrompt, buildRefinementPrompt
      generator.ts         — generateAdCopy(), refineAdCopy() using generateObject
      evaluator.ts         — evaluateAdCopy() — batched 5-dimension scoring in 1 LLM call
      compliance.ts        — checkCompliance() — rule-based, zero LLM cost, Meta/Google/LinkedIn limits
      iterator.ts          — runAdPipeline() — full generate→evaluate→refine loop with early stopping
  lib/cost-tracker.ts      — trackAICost(), estimateCost() with model cost table
  components/
    layout/AppSidebar.tsx  — Nav links for all 8 modules + settings + sign out
    layout/ProjectSwitcher.tsx — Dropdown to switch active project
    providers/QueryProvider.tsx — TanStack React Query wrapper
    ui/                    — 18 shadcn components (button, card, dialog, input, etc.)
  hooks/use-project.tsx    — ProjectProvider context + useProject() hook
supabase/migrations/
  001_core_schema.sql      — profiles, projects, campaigns, campaign_metrics, ad_briefs, ad_copies, ad_insights, ai_cost_ledger (all with RLS)
```

## Ad Studio Pipeline (ported from Nerdy Ad Engine Python→TypeScript)
- 6 hook frameworks: stat shock, micro-story, direct callout, contrarian, before/after, question+agitate
- 5 evaluation dimensions: clarity (20%), value_proposition (25%), cta_strength (20%), brand_voice (15%), emotional_resonance (20%)
- Quality threshold: 7.0, early stop: 9.0+, max iterations: 5
- Compliance checker: character limits per platform, valid CTA buttons, prohibited content, warning patterns, caps/emoji checks
- Model: `google/gemini-2.0-flash-001` for all steps (draft, refine, evaluate)
- Brand voice stored per-project in `projects.brand_voice` JSONB column

## Database Tables (Phase 1 — all in 001_core_schema.sql)
- `profiles` — auto-created on signup via trigger
- `projects` — name, slug, brand_voice, target_audiences, competitors, settings (all JSONB)
- `campaigns` — project_id, status, channels[], budget, dates, kpis
- `campaign_metrics` — daily per-channel: impressions, clicks, conversions, spend, revenue
- `ad_briefs` — platform, audience, offer, goal, tone
- `ad_copies` — iteration_number, primary_text, headline, description, cta_button, status, evaluation_scores, weighted_average, compliance
- `ad_insights` — insight_type, insight_text, evidence, sample_count
- `ai_cost_ledger` — module, model, tokens, cost_usd, latency

### Phase 2 Tables (002_email_engine.sql + 003_social_scheduler.sql)
- `email_templates` — name, subject, body_html, body_json, category
- `email_lists` — name, description, subscriber_count (auto-updated via trigger)
- `email_subscribers` — list_id, email, name, metadata, status. Unique on (list_id, email)
- `email_sequences` — trigger_type (signup/tag_added/manual/event), status (draft/active/paused)
- `email_sequence_steps` — sequence_id, template_id, step_order, delay_hours, condition
- `email_sends` — template_id, subscriber_id, sequence_id, status tracking (queued→sent→delivered→opened→clicked)
- `social_accounts` — platform, account_name, encrypted tokens
- `social_posts` — platform, content, media_urls[], status (draft/scheduled/published), scheduled_at, engagement jsonb, ai_generated

## Phase 2 Features Built
- **Email Engine** (`app/(app)/email/page.tsx`): 3-tab UI (Templates / Lists / Sequences)
  - Template CRUD with HTML editor + preview modal
  - AI email generation via `/api/ai/generate-email` → populates template form
  - Subscriber list management
  - Drip sequence creation with trigger types
  - AI generator: `lib/ai/email/generator.ts` — Zod schema for subject+preview_text+body_html
- **Social Scheduler** (`app/(app)/social/page.tsx`): 2-tab UI (Calendar / All Posts)
  - Weekly calendar view with date-fns (navigable, shows posts per day)
  - Post composer with platform selector + character count + optional scheduling
  - AI post generation via `/api/ai/generate-social` → populates composer
  - AI generator: `lib/ai/social/generator.ts` — platform-aware (Twitter 280 chars, LinkedIn 3000, Instagram 2200)
  - Platform icons: MessageCircle (twitter), Briefcase (linkedin), Camera (instagram) — lucide has no brand icons
- **API Routes**: `api/ai/generate-email/route.ts`, `api/ai/generate-social/route.ts` — both track costs via ai_cost_ledger

## Phase 3 Features Built
- **Content Workshop** (`app/(app)/content/page.tsx`): Content list + inline markdown editor
  - AI blog generation via `/api/ai/generate-content` (topic + keyword → full markdown post)
  - SEO score checker (rule-based: keyword in title, density, headings, word count, intro placement)
  - Content CRUD with type (blog_post, case_study, landing_page, whitepaper) and status workflow
  - Editor view: markdown textarea + SEO score panel with pass/fail checklist
  - AI generator: `lib/ai/content/generator.ts` + `calculateSeoScore()` utility
- **Lead Pipeline** (`app/(app)/leads/page.tsx`): List + kanban views
  - Lead CRUD with score, status columns (new→contacted→qualified→nurturing→converted→lost)
  - Kanban board view with columns per status
  - Status dropdown to move leads through pipeline
  - Public capture endpoint: `POST /api/leads/capture` (no auth, uses service client)
  - Lead scoring: base 10 on capture, events tracked in `lead_events`
- **Analytics Dashboard** (`app/(app)/analytics/page.tsx`): Recharts visualizations
  - 4 stat cards (impressions, clicks, conversions, spend)
  - BarChart: spend by channel
  - LineChart: daily impressions + clicks
  - AI cost breakdown by module from `ai_cost_ledger`
  - Date range filter
- **Budget Tracker** (`app/(app)/budget/page.tsx`): Allocations + expenses
  - Summary cards: allocated, spent, remaining + PieChart by channel
  - Allocation CRUD with campaign link, channel, planned amount, period
  - Expense logging against allocations
  - Progress bars showing spend vs planned, over-budget badges

### Phase 3 Tables (004-006 migrations)
- `content_pieces` — title, slug, body_markdown, content_type, status, seo_score, target_keywords[], word_count
- `landing_pages` — name, slug (unique), template jsonb, published, visits, conversions
- `leads` — email, name, source, score, status (new→converted→lost)
- `lead_events` — lead_id, event_type, metadata
- `budget_allocations` — campaign_id, channel, planned_amount, period dates
- `budget_expenses` — allocation_id, amount, description, expense_date

## ALL PHASES + INTEGRATIONS COMPLETE (27 routes)

## Phase 4: Integrations & Polish
- **Resend email sending** (`lib/email/resend.ts`): `sendEmail()`, `sendTemplateToSubscriber()` with placeholder replacement ({{name}}, {{email}})
- **Email send API** (`api/email/send/route.ts`): POST with templateId + listId or subscriberIds, sends to all active subscribers
- **Email webhook** (`api/webhooks/email/route.ts`): Handles Resend events (delivered, opened, clicked, bounced, complained), updates email_sends status, marks bounced subscribers
- **Ad insight extraction** (`lib/ai/ad-studio/insight-extractor.ts`): `extractInsights()` analyzes completed ad runs via LLM, `saveInsights()` stores to DB. Auto-runs after ad pipeline completes (in generate-ad route). Insights injected into future generation prompts.
- **Landing page builder** (`app/(app)/leads/pages/page.tsx`): Create pages with headline/subheadline/body/CTA, publish/unpublish, copy URL
- **Public landing pages** (`app/p/[slug]/page.tsx`): Server-rendered, dark themed, lead capture form that POSTs to /api/leads/capture. Tracks visits, conversions. Client-side JS for form submission without page reload.
- **Dashboard live stats**: Fetches real counts from campaigns, ad_copies, leads, ai_cost_ledger

## Recharts type gotcha
- Tooltip `formatter` must NOT type the value param as `number` — use `(value) => [\`$\${Number(value).toFixed(2)}\`, 'label']`

## What's NOT Done Yet
- Social platform OAuth (publishing to Twitter/LinkedIn/Instagram)
- Supabase not connected (placeholder .env.local)
- No `supabase gen types` — untyped clients
- Image generation for ads
- Email sequence step executor (auto-send on schedule/trigger)
- CSV subscriber import UI

## To Run
1. Create Supabase project → copy URL + anon key + service role key to `.env.local`
2. Run all 6 migrations in order: `001_core_schema.sql` through `006_budget_tracker.sql`
3. Add OpenRouter API key to `.env.local`
4. Optionally add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email sending
5. `npm run dev`

## Related Projects
- Interview Journey: `/Users/yash/Downloads/interview-journey/` — same stack, patterns copied from here
- Nerdy Ad Engine: `/Users/yash/Downloads/Nerdy/nerdy-ad-engine/` — original Python ad pipeline, ported to TS here
