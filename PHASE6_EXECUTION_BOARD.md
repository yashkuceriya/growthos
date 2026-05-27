# Phase 6 Execution Board

Goal: make GrowthOS a dependable self-use marketing command center: fast locally, hard to accidentally break, easy to operate solo, and focused on features that help one founder run campaigns end-to-end. This is not optimized for multi-customer SaaS production yet.

Primary product roadmap: see `MARKETING_OPERATING_LOOP_PLAN.md`.

## Working Rules

- Owner defaults: `Core` for app/system work, `Growth` for workflow features.
- Definition of done for each item: app still builds, tests pass, and the workflow is simpler or more useful for day-to-day use.
- Priority labels: `P0` (blocks self-use), `P1` (high leverage), `P2` (quality of life), `P3` (later).

## Phase 6A — Safety Rails For Self-Use (active)

| ID | Priority | Owner | Item | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| 6A-1 | P0 | Core | Guard outbound ingest fetches (URL validation, redirect validation, timeout, payload-size cap). | In Progress | Bad URLs fail clearly; a bad sync cannot hang the app or fetch internal resources by accident. |
| 6A-2 | P0 | Core | Apply same URL guard to screenshot capture inputs. | In Progress | Screenshot capture skips blocked URLs and logs reason without crashing ingest. |
| 6A-3 | P0 | Core | Tighten budget guard behavior when spend calculation is unavailable. | In Progress | AI-heavy actions pause when spend cannot be computed instead of accidentally running up cost. |
| 6A-4 | P1 | Core | Harden lead ingestion input validation + metadata sanitation (`/api/leads/capture`, `/api/v1/leads`). | In Progress | Junk payloads do not pollute the personal CRM data. |
| 6A-5 | P3 | Core | Optional shared limiter (Upstash/Redis) for public capture if landing pages are exposed publicly. | In Progress | Optional only; local/self-hosted use can run with in-memory fallback. |
| 6A-6 | P2 | Core | Optional signed form token for public lead capture. | Completed | Useful if landing pages are public; can be disabled for private/local-only workflows. |

## Phase 6B — Campaign Spine And Data Truth

| ID | Priority | Owner | Item | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| 6B-1 | P1 | Growth | Make `campaign_id` first-class through ad/social/content generation flows. | Completed | Command Center “Create & attach” links pass `?campaignId=`; `POST /api/ai/generate-ad` validates and sets `ad_briefs.campaign_id`; social/content saves set `campaign_id` when the URL campaign matches the project. Email templates remain project-scoped (no `campaign_id` column). |
| 6B-2 | P1 | Growth | Ensure analytics inputs are truly populated (`campaign_metrics` ingest path). | In Progress | Analytics page reads `campaign_metrics` for all project campaigns in the selected window; charts populate when operators log metrics on campaign detail. |
| 6B-3 | P2 | Growth | Add honest empty/loading states for analytics when metrics are missing. | In Progress | Banner + CTA when no metric rows; removed fabricated KPI deltas, fake AI “efficiency”, and misleading “live stream” subtitle. |
| 6B-4 | P1 | Growth | Add per-project Marketing Blueprint from classifier + playbook. | In Progress | Dashboard explains ICP, best channels, KPI, content mix, launch tactics, and readiness for the active app. |

## Phase 6C — Local Confidence Gates

| ID | Priority | Owner | Item | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| 6C-1 | P0 | Core | Add `next build` to CI. | Completed | Build problems are caught before they break the local app. |
| 6C-2 | P1 | Core | Add route integration tests for critical API surfaces (`v1`, launch, leads capture, webhooks). | In Progress | Risky edits are safer because key route contracts are tested. |
| 6C-3 | P2 | Core | Add one lightweight smoke path (project → sync → generate) when ready. | Planned | A single command validates the personal workflow still works. |
| 6C-4 | P1 | Core | Standardize local/CI verification commands and wire smoke diagnostic into package scripts. | Completed | One local command checks typecheck, lint, tests, and build. |

### 6C-2 Coverage Added

- `/api/leads/capture`: rate-limit denial, new lead creation, existing lead dedupe.
- `/api/projects/ingest`: unauthenticated, ownership denial, successful ingest.
- `/api/v1/leads`: auth denial, rate-limit denial, ownership denial, new lead creation, idempotency wrapper contract, rate-limit headers.
- `/api/v1/projects/:id/ingest`: queued default flow, sync flow, ownership denial, budget denial, missing URL denial.
- `/api/webhook-endpoints`: auth denial, list, unsafe URL rejection, event validation, create with one-time secret.
- `/api/webhook-endpoints/:id`: patch validation, re-enable failure-streak reset, unsupported event rejection, delete success/not-found.
- `/api/webhook-endpoints/:id/test`: auth/ownership checks, test delivery insert, synchronous dispatch.
- `/api/webhook-endpoints/:id/deliveries/:deliveryId/redrive`: auth check, success/in-flight rejection, failed delivery reset + dispatch.

### 6C-4 Progress

- Added standard package scripts: `typecheck`, `test:coverage`, `smoke`, and `verify`.
- Declared smoke runtime dependencies (`tsx`, `dotenv`) instead of relying on transient `npx` installs.
- Hardened CI with read-only permissions, concurrency cancellation, Next.js cache, and the same `typecheck` script developers run locally.

## Phase 6D — Performance And Fetch Architecture

| ID | Priority | Owner | Item | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| 6D-1 | P1 | Growth | Replace hot-path `select('*')` with explicit column lists and lazy heavy-field fetches. | In Progress | Core list pages reduce response payload and memory footprint measurably. |
| 6D-2 | P2 | Growth | Standardize data fetching on React Query (or server fetch model) for top-traffic pages. | Planned | Duplicate fetches reduced; stale/invalidation behavior is predictable. |
| 6D-3 | P2 | Growth | Remove avoidable `exhaustive-deps` suppressions by stabilizing data hooks. | Planned | Hook dependencies are explicit and lints stay enabled on critical pages. |

## Phase 6E — Solo Operator Visibility

| ID | Priority | Owner | Item | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| 6E-1 | P2 | Core | Improve the existing in-app observability page before adding external tools. | Planned | You can see failed jobs, stale integrations, and recent errors inside the app. |
| 6E-2 | P2 | Core | Keep smoke probes as a manual/local diagnostic, not mandatory staging automation. | Planned | `npm run smoke` helps debug your own instance when something feels off. |
| 6E-3 | P2 | Core | Add simple cron/webhook/job health cards. | Planned | You can quickly tell what is stuck without reading raw logs. |

## Marketing Operating Loop — Live Progress

| Phase | Item | Status | Notes |
|---|---|---|---|
| 1 | Unified Marketing Memory (`lib/marketing/memory.ts`) | Completed | One bundle: brand, classification, blueprint, launch insights, ad insights, founder voice, style refs. |
| 1 | Wire memory into `generate-ad` | Completed | Replaces ad-hoc brand_voice + ad_insights fetches. |
| 1 | Wire memory into `generate-social` | Completed | Carries platform-specific style refs + founder voice. |
| 1 | Wire memory into `generate-email` | Completed | Carries promoted-winner email templates + founder voice. |
| 1 | Wire memory into `generate-content` | Completed | Generator gains a `styleContext` slot for memory injection. |
| 2 | Pure launch planner (`lib/launch/plan.ts`) | Completed | Maps blueprint + insights to channel recommendations, KPI, angles, defaults. |
| 2 | `GET /api/launch/plan` returns recommended channels + rationale | Completed | RLS-scoped, used by the launch UI. |
| 2 | `POST /api/launch` accepts `channels`, `goal`, `angle`, `campaignId` | Completed | Operator overrides validated up front and threaded into LaunchContext. |
| 2 | Launch page Plan Preview (channel toggles, goal, angle picker) | Completed | Operator sees recommended plan before spending AI budget. |
| 3 | `GET /api/campaigns/:id/assets` — unified asset board | Completed | Single endpoint normalizes ads, social, content, landing, leads. |
| 3 | Campaign detail page — tabbed Command Center + Re-launch button | Completed | One view to operate everything attached to a campaign. |
| 3 | Launch route attaches social posts to `campaign_id` | Completed | Re-launches stitch new assets to the same campaign. |
| 3 | `/launch?campaignId=…` re-launch flow | Completed | Campaign Command Center re-launches reuse the campaign id. |
| 4 | Manual Metrics Logger | Completed | API `GET/POST/DELETE /api/campaigns/[id]/metrics` + UI on campaign detail; `aggregateRows` / rollups in `lib/metrics/derive`. |
| 5 | Next Best Action | Completed | `lib/marketing/next-action.ts`, `GET /api/next-action` (+ optional `campaignId`), dashboard + campaign-scoped panels. |
| 6 | Learning summary + re-launch memory | Completed | `lib/campaigns/learning.ts`, `GET /api/campaigns/[id]/learnings`, UI panel; re-launch injects `learning_summary` into `LaunchContext` + strategic agents; final campaign metadata merge preserves `learning_summary`. |
| 7 | Export / UTM / composer / week strip | Completed | `lib/publishing/links.ts`, markdown export, per-asset copy+tracked URL+composer links, `LaunchScheduleStrip`. |

## Review checkpoint (2026-05-16)

**Shipped (Marketing Operating Loop)**  
Phases 1–7 from `MARKETING_OPERATING_LOOP_PLAN.md` are implemented: unified memory, blueprint launch, campaign command center, manual metrics, next action, learning summary + launch injection, export/UTM/composer/week calendar.

**Credibility / data truth**  
Analytics no longer shows fake week-over-week deltas, decorative KPI bars tied to nothing, invented AI efficiency scores, or a “live data stream” subtitle. AI table uses real `input_tokens` + `output_tokens` and timestamps.

**Tests**  
Route coverage extended: `campaigns/[id]/learnings`, `next-action` (see `src/app/api/**/route.test.ts`).

**Next highest-value slices (pick in order)**  
1. **6C-2**: Integration tests for `POST /api/launch` contract (auth, channel validation) and `GET /api/campaigns/[id]/export`.  
2. **6A-1 / 6A-2 / 6A-3**: URL guard for ingest + screenshot; budget guard when RPC/spend unavailable (pause AI, don’t fail-open silently).  
3. **7.x**: Optional CSV export alongside markdown pack; tiny UTM preview widget on campaign asset rows.  
4. **6B-1 follow-up** (optional): add `campaign_id` to `email_templates` + wire email UI/API if campaign-scoped templates are needed.

## Immediate Next Sprint (recommended)

1. Keep **Marketing Memory** the single source of truth for generators; add campaign-scoped learning blob there only if product needs cross-surface prompts without opening launch.
2. **Campaign id everywhere**: done for ad generate, social, and content (6B-1); email remains project-scoped until schema/UI catch up.
3. **Safety rails**: ingest/screenshot URL allowlists + budget fail-closed when guard can’t compute spend (6A).
4. Keep **`npm run verify`** green after each meaningful change.

### 6B-4 Progress

- Added a pure marketing blueprint builder backed by product classification and vertical playbooks.
- Added a dashboard Marketing Blueprint panel showing ICP, best channels, primary KPI, content mix, launch tactics, and readiness.

### 6D-1 Progress

- Replaced broad `select('*')` on Ad Studio, Social Scheduler, and Email Engine hot-list reads with explicit column selections.
- Replaced remaining broad `select('*')` reads in the protected app route group and public landing page with explicit column selections.

### 6A-6 Progress

- Added optional HMAC-signed lead capture tokens. Public landing pages issue a hidden `captureToken` when `LEAD_CAPTURE_SIGNING_SECRET` is set.
- `/api/leads/capture` verifies tokens when present and can require them globally with `LEAD_CAPTURE_REQUIRE_TOKEN=true`.
