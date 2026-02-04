# Verity Backend — Australia-First Deployment

Verity is a real-time matching + video platform. This guide is optimized for **Australia-only** hosting with a **Canberra-first** posture and a **Sydney fallback** so you never get blocked by region approvals.

**Recommendation**
Sydney (Australia East) is the most reliable default today. Australia Central (Canberra) is excellent when approved, but is a restricted region. The infra is identical in both; you only swap the region parameter file.

## Deployment Options (Australia)

| Component | Canberra (Azure Australia Central) | Sydney Fallback (Azure Australia East) |
| --- | --- | --- |
| API + Worker | Azure Container Apps | Azure Container Apps |
| Postgres | Azure Database for PostgreSQL (Flexible Server) | Azure Database for PostgreSQL (Flexible Server) |
| Redis | Azure Cache for Redis | Azure Cache for Redis |
| Secrets | Azure Key Vault (optional) | Azure Key Vault (optional) |
| CI/CD | GitHub Actions (manual) | GitHub Actions (manual) |

If Australia Central is unavailable, use `infra/azure/params.sydney-fallback.json` and continue with the exact same deployment.

## Architecture Summary

- **API**: NestJS container listening on port 3000.
- **Worker**: Background container running `node dist/queue/matching.worker.js`.
- **Postgres**: Prisma-backed primary DB.
- **Redis**: Queue state + locks + session coordination.
- **Key Vault**: Stores secrets, accessed via managed identity.

## Environment Variables

All env vars are documented in `.env.production.example`.

Key variables used by the backend:
- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `APP_ORIGINS`, `REFRESH_COOKIE_SAMESITE`, `REFRESH_COOKIE_DOMAIN`
- `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_TOKEN_TTL_SECONDS`
- `HIVE_STREAM_URL`, `HIVE_SCREENSHOT_URL`, `HIVE_API_KEY`, `HIVE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`
- `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`

## Docker (Backend)

Build and run locally:

```bash
npm ci
npm run build

docker build -t verity-api:local .
docker run --rm -p 3000:3000 --env-file .env.production.example verity-api:local
```

## Web Client (Vite)

Web app lives in `verity-web/`.

```bash
cd verity-web
npm install
npm run dev
```

Web environment variables:
- `VITE_API_URL` (e.g. `http://localhost:3000`)
- `VITE_WS_URL` (e.g. `http://localhost:3000`)
- `VITE_AGORA_APP_ID` (required for video)

## Azure Deployment (Canberra or Sydney)

Infra is defined in Bicep under `infra/azure`.

### 1) Prerequisites

- Azure CLI installed and logged in.
- Access to Australia Central if deploying Canberra.
- A resource group created in your target region.

```bash
az group create -n verity-au -l australiaCentral
# or
az group create -n verity-au -l australiaEast
```

### 2) Deploy Infrastructure

Use the Canberra or Sydney parameter file, then override secrets at deploy time.

```bash
az deployment group create \
  --resource-group verity-au \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/params.canberra.json \
  --parameters postgresAdminPassword=REPLACE_ME jwtSecret=REPLACE_ME jwtAccessSecret=REPLACE_ME jwtRefreshSecret=REPLACE_ME \
  --parameters stripeSecretKey=REPLACE_ME stripeWebhookSecret=REPLACE_ME stripePriceStarter=REPLACE_ME stripePricePlus=REPLACE_ME stripePricePro=REPLACE_ME \
  --parameters agoraAppId=REPLACE_ME agoraAppCertificate=REPLACE_ME hiveApiKey=REPLACE_ME hiveWebhookSecret=REPLACE_ME
```

Note: `acrName`, `postgresServerName`, `redisName`, and `keyVaultName` must be globally unique.

Swap to Sydney by using `infra/azure/params.sydney-fallback.json`.

### 3) Build and Push Image

```bash
az acr build --registry <acrName> --image verity-api:latest --file Dockerfile .
```

### 4) Update Container Apps

```bash
az containerapp update --name <apiName> --resource-group verity-au --image <acrName>.azurecr.io/verity-api:latest
az containerapp update --name <workerName> --resource-group verity-au --image <acrName>.azurecr.io/verity-api:latest
```

### 5) Run Migrations

Run from a trusted machine or CI where Prisma is available:

```bash
DATABASE_URL=... npx prisma migrate deploy
```

### 6) Verify

```bash
curl https://api.yourveritydomain.com/health
```

## CI (Manual, 0 Risk)

Manual workflow lives at `.github/workflows/deploy-azure.yml`.
It builds, deploys, and updates the container apps.
The workflow is `workflow_dispatch` only and does not auto‑deploy.

Secrets are stored in Azure Key Vault and accessed by the Container Apps via a user-assigned managed identity.

## Key Vault RBAC & Rotation

- Optional RBAC mode is available via `keyVaultUseRbac` in the Azure params file.
- If enabled, the app identity is granted the **Key Vault Secrets User** role.
- Your deployment principal must have permission to write secrets (e.g., **Key Vault Secrets Officer**).

Rotation (recommended):
1. Update secret values in your params file.
2. Redeploy Bicep to create new secret versions.
3. Restart Container Apps to pick up the new versions.

## Front Door (Optional)

Front Door can provide a managed TLS endpoint and WAF, but it is a **global service** and may route outside Australia. If strict in-country routing is required, leave it disabled and use direct Container Apps FQDN or regional load balancer.

Enable WAF + rate limits by setting:
- `enableFrontDoorWaf: true`
- `frontDoorRateLimit` (requests/min)
- `frontDoorRateLimitExemptPaths` (default includes `/webhooks/stripe` and `/webhooks/hive`)

## Deployment Checklist (Australia)

Use this to avoid surprises on first launch.

### Prerequisites

- Azure subscription with access to Australia Central or Australia East.
- Azure CLI installed and logged in.
- Domain ready (DNS managed in Cloudflare or Azure DNS).
- Stripe, Agora, and Hive credentials available.

### Secrets Inventory

Required secrets (store in Key Vault via Bicep params):
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AGORA_APP_CERTIFICATE`
- `HIVE_API_KEY`
- `HIVE_WEBHOOK_SECRET`

Non-secret values (safe as plain env vars):
- `API_URL`
- `WS_URL`
- `APP_URL`
- `AGORA_APP_ID`
- `AGORA_TOKEN_TTL_SECONDS`
- `HIVE_STREAM_URL`
- `HIVE_SCREENSHOT_URL`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PLUS`
- `STRIPE_PRICE_PRO`

### First Deployment Steps

1. Create resource group in `australiaCentral` (or `australiaEast` fallback).
2. Fill in `infra/azure/params.canberra.json` (or `params.sydney-fallback.json`) with unique names.
3. Run Bicep deployment with secrets override.
4. Build and push container image to ACR.
5. Update Container Apps to use the new image.
6. Run `npx prisma migrate deploy`.
7. Verify `/health` endpoint.

Staging helpers:
- `scripts/generate-staging-params.sh`
- `scripts/preflight-env.sh`
- `scripts/deploy-staging.sh`

### Post-Deploy Checks

- `/health` returns `status: ok`.
- WebSocket connects to `WS_URL`.
- Stripe webhook endpoint reachable from Stripe.
- Redis and Postgres connectivity from Container Apps.

## E2E Checklist (Manual)

### E2E Quick Commands

```bash
# Single test, keep containers
scripts/e2e-local-run.sh

# Full suite, then clean containers
scripts/e2e-local-run.sh all clean
```

### Legal Drafts (Australia-First Beta)

Draft policies live in `docs/legal/`:
- `privacy-policy.md`
- `terms-of-service.md`
- `community-guidelines.md`
- `cookie-notice.md`

### E2E FAQ (Non-Technical)

- **What is Docker?**  
  A tool that runs apps (like Postgres and Redis) in isolated containers, so you don't have to install them directly.
- **What is E2E?**  
  End-to-end tests that simulate a real user flow from signup → queue → match.
- **What if it fails?**  
  Re-run the status check: `scripts/e2e-local-status.sh`.  
  If containers look unhealthy, run the clean script and try again: `scripts/e2e-local-clean.sh`.

### Local E2E Setup (Quick)

For a fresh local database, Prisma migrations currently assume baseline tables
already exist. For local/E2E runs, use `db push` to sync schema:

```bash
DATABASE_URL=... npx prisma db push --accept-data-loss
```

In production/CI, continue using `npx prisma migrate deploy`.

One-click local E2E (Docker + Postgres + Redis, single test):

```bash
scripts/e2e-local.sh
```

Run the full E2E suite:

```bash
scripts/e2e-local-all.sh
```

Clean up local E2E containers/network:

```bash
scripts/e2e-local-clean.sh
```

Check local E2E container/network status:

```bash
scripts/e2e-local-status.sh
```

Run status → tests → optional cleanup in one command:

```bash
# Single test, keep containers (default)
scripts/e2e-local-run.sh

# Full suite, then clean containers
scripts/e2e-local-run.sh all clean
```

1. `POST /auth/signup-anonymous` returns access token and sets refresh cookie.
2. `GET /tokens/balance` returns token balance (seed tokens if needed).
3. `POST /queue/join` succeeds and triggers a queue match event.
4. `/video` socket receives `session:start`, then `session:end`.
5. `POST /sessions/:id/choice` yields `match:mutual` on double MATCH.
6. `GET /matches` lists the mutual match and `/matches/:id/messages` loads chat.

## Platform Features (Backend)

## Token Rotation & Verification

- Access tokens are short-lived (15 minutes). Refresh tokens last 30 days.
- Refresh tokens are stored in an httpOnly cookie named `refresh_token` with `sameSite=strict`.
- In production, cookies are marked `secure` (HTTPS only).
- `POST /auth/refresh` rotates refresh tokens and invalidates a refresh family on reuse.
- `POST /auth/verify-phone` and `POST /auth/verify-email` link verified identifiers to the user.
- `POST /auth/logout-all` revokes all refresh tokens for the current user.

## Matching Queue System

- `POST /queue/join` deducts one token and places the user into a Redis sorted set keyed by `region` + preferences.
- `DELETE /queue/leave` removes the user and refunds the token if no match was made.
- A background worker pops FIFO pairs from Redis and creates a `Session`.
- Matches emit a `match` event over the `/queue` WebSocket namespace to each user room.

## Video Call Flow & Timer

- When a `Session` is created, the server generates short-lived Agora RTC + RTM tokens and a channel name.
- The server emits `session:start` over the `/video` WebSocket namespace to both users, including `startAt`/`endAt`.
- A hard 45-second server timer emits `session:end` (authoritative), triggering the choice screen.
- Clients should still run their own 45-second timer, but must respect the server `session:end`.
- Cloud recording is not enabled by the backend.

## Double Opt-In Logic

- Clients submit `POST /sessions/:id/choice` with `MATCH` or `PASS` after the call ends.
- Only session participants can submit; choices are idempotent.
- Mutual `MATCH` creates a `Match` row and emits `match:mutual` to both users.
- Any non-mutual result (including timeouts) emits `match:non_mutual`.
- If no choices are received within 60 seconds after `session:end`, the server auto-PASSes.

## Identity Reveal & Chat

- `GET /matches` returns mutual matches with full partner profiles.
- `GET /matches/:id/messages` and `POST /matches/:id/messages` provide persistent chat history and delivery.
- Chat messages are stored in PostgreSQL and delivered in real time via `/chat` WebSocket events.
- Access is limited to match participants; identity data is revealed only after mutual match.

## Token System & Stripe Integration

- `GET /tokens/balance` returns the current token balance for the authenticated user.
- `POST /tokens/purchase` creates a Stripe Checkout session for predefined packs (`starter`, `plus`, `pro`).
- `POST /webhooks/stripe` verifies Stripe signatures and credits tokens atomically on paid checkout completion.
- Webhooks are idempotent using the Stripe event ID to prevent double credits.
- Queue joins must have `tokenBalance >= 1` to proceed.

## AI Moderation Pipeline

- On session start, the backend forwards Agora stream details to Hive for real-time moderation.
- Hive violations are posted to `POST /webhooks/hive` and verified using HMAC signatures.
- Violations immediately terminate the session and log `ModerationEvent` rows.
- Repeat offenders (3+ violations in 24h) are banned via Redis TTL and receive `moderation:action` events.
- Optional screenshot fallback can be configured via `HIVE_SCREENSHOT_URL`.
