# Verity NotebookLM Context Pack

Last updated: 2026-02-11
Repo path: `/Users/joshcabana/verity`
Baseline commit: `2358dddbee6fd8ef9605f15bc730dea6a47b3d25`

## 1) Recommended source strategy for NotebookLM

Use a hybrid source set for best results:

1. **Primary code truth**: the GitHub repo at the baseline commit/branch.
2. **High-signal narrative context**: this file (`docs/notebooklm-context-pack.md`).
3. **Executive narrative context**: `docs/notebooklm-executive-brief.md` for stakeholder-level Q&A.
4. **Operational and product docs**: selected files listed in the upload manifest below.

Why this is best:
- GitHub gives canonical tracked code.
- Local generated/dependency files (`node_modules`, `dist`, caches, venv) are noise and should not be uploaded.
- The selected docs add architecture, constraints, deployment, and gap/risk context that raw code alone does not explain quickly.

## 2) Monorepo map

Verity is a monorepo with three app surfaces:

- **Backend API + worker** (NestJS, Prisma, Redis, Socket.IO): `/Users/joshcabana/verity/src`
- **Web app** (React + Vite): `/Users/joshcabana/verity/verity-web`
- **Mobile app** (React Native + Expo): `/Users/joshcabana/verity/verity-mobile`

Key infra and ops folders:
- `/Users/joshcabana/verity/infra/azure` (Bicep templates + region params)
- `/Users/joshcabana/verity/prisma` (DB schema + migrations)
- `/Users/joshcabana/verity/docs` (legal, runbooks, test summaries, implementation notes)
- `/Users/joshcabana/verity/load-test` (k6 scripts)

## 3) Product/system summary

Verity is a real-time matching and short-session video platform with:
- anonymous onboarding
- queue-based pairing
- 45-second video sessions
- double opt-in decision (`MATCH` / `PASS`)
- match reveal and chat on mutual matches
- token balance and Stripe-backed purchases
- moderation reporting and user blocking

Primary runtime components:
- NestJS API (`/health`, auth, queue, sessions, matches/messages, tokens, moderation, notifications, analytics, flags)
- Redis for queue state, locks, and time-sensitive coordination
- PostgreSQL (Prisma) for durable user/session/match/message/payment/moderation records
- Socket.IO gateways for real-time queue/video/chat events

## 4) Backend architecture and module boundaries

Main module wiring (from `src/app.module.ts`):
- `AuthModule`
- `QueueModule`
- `VideoModule`
- `SessionModule`
- `ChatModule`
- `PaymentsModule`
- `ModerationModule`
- `NotificationsModule`
- `MonitoringModule`
- `AnalyticsModule`
- `FlagsModule`

Cross-cutting defaults:
- Global validation pipe with whitelist + transform + forbid non-whitelisted fields (`src/main.ts`)
- Global throttling (`@nestjs/throttler`) at app level (120 req / 60s default)
- CORS via env-driven origin resolver (`src/common/security-config.ts`)
- Access/refresh token secret resolution from env with guarded dev fallback

## 5) Canonical API surface (high-value endpoints)

### Auth & user profile
- `POST /auth/signup-anonymous`
- `POST /auth/verify-phone`
- `POST /auth/verify-email`
- `POST /auth/refresh`
- `POST /auth/logout-all`
- `GET /users/me`
- `GET /users/me/export`
- `PATCH /users/me`
- `DELETE /users/me`

### Queue/session/match/chat
- `POST /queue/join`
- `DELETE /queue/leave`
- `POST /sessions/:id/choice`
- `GET /matches`
- `GET /matches/:id/reveal`
- `POST /matches/:id/reveal-ack`
- `GET /matches/:id/messages`
- `POST /matches/:id/messages`

### Tokens/payments
- `GET /tokens/balance`
- `POST /tokens/purchase`
- `POST /webhooks/stripe`

### Moderation/notifications/ops
- `POST /moderation/reports`
- `GET /moderation/reports`
- `POST /moderation/reports/:id/resolve`
- `POST /moderation/blocks`
- `DELETE /moderation/blocks/:blockedUserId`
- `GET /moderation/blocks`
- `POST /webhooks/hive`
- `POST /notifications/tokens`
- `DELETE /notifications/tokens`
- `POST /monitoring/web-vitals`
- `POST /monitoring/frontend-errors`
- `POST /analytics/events`
- `GET /config/flags`
- `PATCH /config/flags/:key`
- `GET /health`

## 6) Real-time contract (Socket.IO)

Namespaces and key events:

- **`/queue`**
  - `match` (server -> user room)
  - payload includes `sessionId`, `partnerId`, `queueKey`, `matchedAt`

- **`/video`**
  - `session:start`
  - `session:end`
  - `match:mutual`
  - `match:non_mutual`

- **`/chat`**
  - `message:new`

Auth model:
- JWT bearer token in socket handshake (`authorization: Bearer ...` or `auth.token`)
- clients are joined to user-scoped rooms (`user:<id>`)

## 7) Data model (Prisma)

Core entities (from `prisma/schema.prisma`):
- `User` (+ role, profile fields, token balance, verification fields)
- `Session` (paired users and queue metadata)
- `Match` (mutual outcomes + reveal acknowledgements)
- `Message` (chat by match)
- `TokenTransaction` (credit/debit ledger)
- `RefreshToken` (session security model)
- `ModerationReport`, `ModerationEvent`, `Block`
- `PushToken`
- `FeatureFlag`

Notable enums:
- `UserRole`: `USER`, `ADMIN`
- `TokenTransactionType`: `CREDIT`, `DEBIT`
- `PushPlatform`: `WEB`, `IOS`, `ANDROID`

## 8) Frontend app notes

### Web (`verity-web`)
- React 19 + Vite
- Uses API + socket endpoints via environment config
- Includes unit tests (Vitest + Testing Library) and smoke tests (Playwright)
- Builds legal content from docs (`scripts/generate-legal-content.mjs`)

### Mobile (`verity-mobile`)
- Expo + React Native + React Navigation
- Auth persistence via AsyncStorage
- Queue, decision, matches, chat, and token purchase flows wired to backend APIs
- Agora RTC client integration for calls
- Includes component and flow-style tests with Jest

## 9) Deployment and runtime topology

Primary deployment target documented in repo:
- **Azure, Australia-first**
  - Canberra primary (`australiaCentral`, restricted access)
  - Sydney fallback (`australiaEast`)

Infra includes:
- Container Apps (API + worker)
- PostgreSQL Flexible Server
- Redis
- Key Vault + managed identity
- optional Front Door / WAF

Key deployment files:
- `/Users/joshcabana/verity/infra/azure/main.bicep`
- `/Users/joshcabana/verity/infra/azure/params.canberra.json`
- `/Users/joshcabana/verity/infra/azure/params.sydney-fallback.json`
- `/Users/joshcabana/verity/.github/workflows/deploy-azure.yml` (manual dispatch)

## 10) CI and test posture

CI workflow (`.github/workflows/tests.yml`) runs:
- backend unit tests
- moderation accuracy suite
- backend build
- analytics contract tests
- backend e2e with postgres + redis services
- web unit/build/budget checks
- web smoke tests (Playwright)
- mobile typecheck + tests

Documented coverage snapshot (`docs/test-summary.md`):
- Lines: 94.75%
- Branches: 83.25%

## 11) Security/privacy-relevant behavior

- Refresh token rotation model with hashed refresh tokens in DB
- Cookie-based refresh flow + JWT access tokens
- Origin allowlist from `APP_ORIGINS` / `APP_URL`
- Global throttling and endpoint-level throttles on sensitive auth endpoints
- Push notification privacy guard in CI forbids leaking message preview payload
- Account export and deletion endpoints present (`/users/me/export`, `/users/me` DELETE)

## 12) Known risk and implementation context

`docs/notes/mobile-backend-gap-report.md` and companion checklist document prior integration gaps between mobile and backend contracts (event namespaces, payload shapes, onboarding/profile contracts, reliability behavior).

Status implications for NotebookLM reasoning:
- NotebookLM should prefer **current source code** as truth for contracts.
- Gap docs are still valuable as historical context for why certain code exists and what was considered risky.

## 13) Upload manifest for NotebookLM (recommended)

Upload these files first (high signal):

- `/Users/joshcabana/verity/docs/notebooklm-context-pack.md`
- `/Users/joshcabana/verity/docs/notebooklm-executive-brief.md`
- `/Users/joshcabana/verity/README.md`
- `/Users/joshcabana/verity/package.json`
- `/Users/joshcabana/verity/prisma/schema.prisma`
- `/Users/joshcabana/verity/src/app.module.ts`
- `/Users/joshcabana/verity/src/main.ts`
- `/Users/joshcabana/verity/src/common/security-config.ts`
- `/Users/joshcabana/verity/src/auth/auth.controller.ts`
- `/Users/joshcabana/verity/src/queue/queue.controller.ts`
- `/Users/joshcabana/verity/src/session/session.controller.ts`
- `/Users/joshcabana/verity/src/matches/matches.controller.ts`
- `/Users/joshcabana/verity/src/payments/payments.controller.ts`
- `/Users/joshcabana/verity/src/moderation/moderation.controller.ts`
- `/Users/joshcabana/verity/src/notifications/notifications.controller.ts`
- `/Users/joshcabana/verity/src/queue/queue.gateway.ts`
- `/Users/joshcabana/verity/src/video/video.gateway.ts`
- `/Users/joshcabana/verity/src/chat/chat.gateway.ts`
- `/Users/joshcabana/verity/infra/azure/README.md`
- `/Users/joshcabana/verity/infra/azure/main.bicep`
- `/Users/joshcabana/verity/.env.production.example`
- `/Users/joshcabana/verity/.github/workflows/tests.yml`
- `/Users/joshcabana/verity/.github/workflows/deploy-azure.yml`
- `/Users/joshcabana/verity/docs/test-summary.md`
- `/Users/joshcabana/verity/docs/notes/go-live-checklist.md`
- `/Users/joshcabana/verity/docs/notes/incident-runbook.md`
- `/Users/joshcabana/verity/docs/notes/mobile-backend-gap-report.md`
- `/Users/joshcabana/verity/docs/notes/mobile-backend-gap-fix-checklist.md`
- `/Users/joshcabana/verity/verity-web/README.md`
- `/Users/joshcabana/verity/verity-web/package.json`
- `/Users/joshcabana/verity/verity-mobile/README.md`
- `/Users/joshcabana/verity/verity-mobile/package.json`
- `/Users/joshcabana/verity/load-test/README.md`

Optional (when doing deeper feature reasoning):
- all files under `/Users/joshcabana/verity/src/**`
- all files under `/Users/joshcabana/verity/verity-web/src/**`
- selected files under `/Users/joshcabana/verity/verity-mobile/src/**`

## 14) Do not upload (low signal / noise)

- `/Users/joshcabana/verity/node_modules/**`
- `/Users/joshcabana/verity/verity-web/node_modules/**`
- `/Users/joshcabana/verity/verity-mobile/node_modules/**`
- `/Users/joshcabana/verity/dist/**`
- `/Users/joshcabana/verity/verity-web/dist/**`
- `/Users/joshcabana/verity/coverage/**`
- `/Users/joshcabana/verity/.venv-pdf/**`
- any `.env` files with real secrets

## 15) Prompt seed you can paste into NotebookLM

Use this starter prompt after uploading sources:

"You are assisting with the Verity monorepo. Treat source code as canonical truth and docs as supporting context. Before giving implementation advice, cite the exact file paths that support your answer. For API/event behavior, prioritize controllers/gateways/services in `src/`. For deployment behavior, prioritize `infra/azure/*` and GitHub workflows. Flag contract mismatches between mobile (`verity-mobile`) and backend (`src`) explicitly, and propose minimal, testable fixes." 
