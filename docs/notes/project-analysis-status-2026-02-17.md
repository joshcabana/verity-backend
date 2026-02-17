# Verity Project Analysis — Objectives, Plans, and Current Status

Date: 2026-02-17

## Summary
Verity is a three-surface product (backend + web + mobile) focused on anonymous, real-time connection: users onboard anonymously, join a live queue, do a short video session, make private match/pass decisions, and unlock chat only on mutual match.

Current state is strong on product completeness and test coverage. The highest remaining risk is operational: deployment readiness, load-test execution readiness, and planned cleanup of temporary compatibility shims.

## Objectives and Product Vision
1. Deliver a privacy-forward, high-intent dating flow with "no profiles, just chemistry," anchored on short real-time video.
2. Enforce trust/safety with real-time moderation, report/block tooling, and controlled identity reveal.
3. Monetize queue participation through token purchases and accurate refund behavior.
4. Operate with Australia-first infra posture (Canberra primary, Sydney fallback) and manual-risk-controlled releases.
5. Maintain premium brand differentiation via the "Midnight Mirror" design system across web and mobile.

Primary evidence:
- `/Users/joshcabana/verity/docs/design/verity-design-spec.md`
- `/Users/joshcabana/verity/README.md`
- `/Users/joshcabana/verity/docs/notebooklm-executive-brief.md`

## Execution Plan and Workstreams
1. Core product flow and contracts:
- Queue/match/session/chat/token flows implemented across backend, web, and mobile.
- Mobile/backend contract remediation executed in phased plan (P0/P1 complete; P2 partial/deferred).

2. Operational readiness:
- Release and incident runbooks are in place.
- CI quality gates exist for backend/web/mobile and migration safety.

3. UX and conversion:
- Queue timeout UX + funnel analytics instrumentation implemented.
- Design system overhaul ("Midnight Mirror") completed.

4. Scale/reliability:
- k6 load-test suite prepared.
- Full staging execution remains blocked on environment/endpoint readiness.

Primary evidence:
- `/Users/joshcabana/verity/docs/notes/mobile-backend-gap-fix-checklist.md`
- `/Users/joshcabana/verity/docs/notes/release-runbook.md`
- `/Users/joshcabana/verity/docs/notes/incident-runbook.md`
- `/Users/joshcabana/verity/docs/notes/queue-operational-polish.md`
- `/Users/joshcabana/verity/docs/notes/load-test-plan.md`
- `/Users/joshcabana/verity/docs/release-notes/v1.0-midnight-mirror.md`

## Current Progress by Surface

### Backend
1. Domain coverage exists in `/Users/joshcabana/verity/src`:
- `auth`, `queue`, `session`, `video`, `chat`, `matches`, `payments`, `moderation`, `notifications`, `analytics`, `monitoring`.
2. Contract work from the mobile/backend gap stream is largely complete, including profile update path and queue/session reliability fixes.
3. Local validation passed:
- `npm test && npm run build`
- 14/14 suites, 161/161 tests passing.

### Web
1. End-to-end product routes are implemented in `/Users/joshcabana/verity/verity-web/src/pages`.
2. "Midnight Mirror" design direction is active in onboarding/home/waiting flows.
3. Local validation passed:
- `npm test && npm run build && npm run check:budgets`
- 9/9 test files, 24/24 tests passing.
4. Recent test drift from UI copy changes has been reconciled in tests.

### Mobile
1. Flow coverage is implemented across onboarding, home, waiting, video, decision, matches, chat, settings, report/block.
2. Contract/race-condition stream is largely complete; deferred cleanup items remain.
3. Local validation passed:
- `npm test && npm run typecheck`
- 15/15 suites, 56/56 tests passing.

## Current Operational Status
1. Local branch status:
- `/Users/joshcabana/verity` is on `main`, ahead of `origin/main` by 5 commits.

2. Recent local commits include:
- test realignment for current copy
- merge-runbook script add/remove artifact
- backend analytics/service hardening
- local terminal AI agent command support

3. External visibility status:
- `joshcabana/verity-backend` shows no open PRs and recent telemetry merges including PR #29.

4. Repo mapping and remote status:
- Current local remote is `https://github.com/joshcabana/verity.git` and currently returns "Repository not found."
- `gh repo view joshcabana/verity` is unresolved for the current account.
- Operational checks are therefore more reliable against `joshcabana/verity-backend` than local origin.

## Important Changes to Public APIs/Interfaces/Types
1. Mobile/backend contract stabilization:
- `PATCH /users/me` profile update contract.
- `POST /queue/join` expects `{ region, preferences? }`.
- Canonical queue/session event contracts (`/queue` `match`, `/video` session/match events).
- Queue leave refund behavior uses backend `refunded`.

2. Mobile trust/safety and engagement capabilities:
- Notification registration/deep-link routing.
- Report and block-list management screens.

3. Test interface updates:
- Web/mobile test suites updated to current queue/onboarding/waiting copy.

Primary evidence:
- `/Users/joshcabana/verity/docs/notes/mobile-backend-gap-report.md`
- `/Users/joshcabana/verity/docs/notes/mobile-backend-gap-fix-checklist.md`
- `/Users/joshcabana/verity/verity-mobile/tests/__tests__/waiting.screen.test.tsx`
- `/Users/joshcabana/verity/verity-web/src/pages/HomeWaiting.test.tsx`

## Test Cases and Scenarios (Current Evidence)
1. Core local gates passing:
- Backend: `npm test && npm run build`
- Web: `npm test && npm run build && npm run check:budgets`
- Mobile: `npm test && npm run typecheck`

2. Covered scenario families:
- onboarding consent + signup
- queue join/leave/refund
- timeout prompt continue/leave instrumentation
- session/decision/match resolution
- chat, report/block, settings, deep-link/push

3. Historical coverage baseline:
- `/Users/joshcabana/verity/docs/test-summary.md`

## Risks, Gaps, and Blockers
1. Deployment/readiness blockers:
- Staging deploy remains dependent on Azure auth/env readiness.

2. Scale confidence blocker:
- k6 scripts are ready and k6 is installed locally (`k6 v1.5.0`), but load execution is blocked by missing `BASE_URL` and `STRIPE_WEBHOOK_SECRET` in current environment.

3. Technical debt still open:
- Remove temporary fallback listeners after one stable release cycle.
- Complete optional/no-op cleanup for queue estimate compatibility.

4. Documentation drift:
- Queue-polish spec text had drifted from current UI copy and has been reconciled in `/Users/joshcabana/verity/docs/notes/queue-operational-polish.md`.

## Assumptions and Defaults Applied
1. Analysis scope is repository truth from `/Users/joshcabana/verity` plus live GitHub checks on `joshcabana/verity-backend`.
2. Current status reflects command outputs collected on 2026-02-17.
3. Where docs conflict with current code copy, runtime behavior/tests are treated as source of truth.

## Recommended Next Priorities (Execution Tracker)
1. Push/sync local commits to a canonical remote branch and open PR:
- Status: blocked by current `origin` repository resolution failure.
- Required unblock: set/repair canonical GitHub remote for this workspace.

2. Close deferred P2 cleanup (fallback listener removal):
- Status: pending by design (deferred until one stable release cycle completes).

3. Unblock staging load-test execution:
- Status: blocked.
- Required unblock: set `BASE_URL` and `STRIPE_WEBHOOK_SECRET`, then run the staged k6 sequence in `/Users/joshcabana/verity/docs/notes/load-test-plan.md`.

4. Reconcile docs vs queue UI copy:
- Status: completed for queue-polish stream in this update.
