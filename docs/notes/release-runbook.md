# Release Operations Runbook

> Companion to [`incident-runbook.md`](file:///Users/joshcabana/verity/docs/notes/incident-runbook.md) and [`deploy-staging.sh`](file:///Users/joshcabana/verity/scripts/deploy-staging.sh).

---

## Pre-Release Gates

| Gate | Command | Pass criteria |
|------|---------|---------------|
| Backend tests | `cd verity && npm test` | 163+ tests, 0 failures |
| Web tests | `cd verity-web && npm test` | All pass |
| Mobile tests | `cd verity-mobile && npm test` | All pass |
| Migrations dry-run | `npx prisma migrate diff --from-migrations-directory prisma/migrations --to-schema-datamodel prisma/schema.prisma` | No unexpected changes |
| Env check | `./scripts/preflight-env.sh` | All secrets present |

---

## Migration Policy

Migrations run **deterministically and automatically** during deploy:

1. The deploy script calls `prisma migrate deploy` as part of the container start command.
2. This applies all pending migrations in order, then exits.
3. If any migration fails, the container **does not start** — the previous revision stays active.

### Hotfix Override

Set `SKIP_MIGRATION=true` in the container environment to deploy a code-only hotfix without running migrations. Use this only when the hotfix is unrelated to schema changes.

---

## Deploy Steps (Staging)

```bash
# 1. Set required env vars
export AZURE_RG="verity-staging-rg"
export POSTGRES_ADMIN_PASSWORD="..."
export JWT_SECRET="..." JWT_ACCESS_SECRET="..." JWT_REFRESH_SECRET="..."
export STRIPE_SECRET_KEY="..." STRIPE_WEBHOOK_SECRET="..."
export STRIPE_PRICE_STARTER="..." STRIPE_PRICE_PLUS="..." STRIPE_PRICE_PRO="..."
export AGORA_APP_ID="..." AGORA_APP_CERTIFICATE="..."
export HIVE_API_KEY="..." HIVE_WEBHOOK_SECRET="..."

# 2. Run deploy
./scripts/deploy-staging.sh
```

The script handles: Bicep infra deployment → ACR image build → Container App update (API + Worker).

---

## Rollback Procedure

### Code rollback (no migration involved)

```bash
# Revert to previous image tag
az containerapp update \
  --name verity-api-staging \
  --resource-group "$AZURE_RG" \
  --image "verityacr.azurecr.io/verity-api:previous-tag"
```

### Migration rollback

```bash
# 1. Mark the failed migration as rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# 2. Apply a corrective down-migration manually if needed
psql "$DATABASE_URL" -f prisma/rollback/<migration_name>.sql

# 3. Redeploy the previous code version
```

> [!CAUTION]
> Prisma does not auto-generate down migrations. Any migration that alters or drops columns **must** have a manually written rollback SQL saved in `prisma/rollback/`.

---

## Post-Deploy Smoke Checks

| Check | How | Expected |
|-------|-----|----------|
| Health | `curl https://api-staging.verity.app/health` | `{ "status": "ok" }` |
| Auth | Sign up / sign in via mobile or web | JWT issued, profile returned |
| Queue | Join queue → leave queue | Token refunded if `refunded: true` |
| Chat | Send message in existing match | Message delivered via WebSocket |
| Push | Send message to backgrounded device | Notification appears, tap routes correctly |
