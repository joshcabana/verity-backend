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

Migrations are an explicit deploy gate and must run before container rollout:

1. In GitHub Actions (`.github/workflows/deploy-azure.yml`), set `runMigrations=true`.
2. In manual staging deploys (`scripts/deploy-staging.sh`), run `npx prisma migrate deploy` first.
3. If migration fails, stop the rollout and fix migration state before updating Container Apps.

### Hotfix Override

For code-only hotfixes with no schema changes, skip the migration step intentionally:

- GitHub Actions: run with `runMigrations=false`.
- Manual staging deploys: omit the `npx prisma migrate deploy` command.

---

## Deploy Steps (Staging)

```bash
# 1. Set required env vars
export AZURE_RG="verity-staging-rg"
export DATABASE_URL="postgresql://..."
export POSTGRES_ADMIN_PASSWORD="..."
export JWT_SECRET="..." JWT_ACCESS_SECRET="..." JWT_REFRESH_SECRET="..."
export STRIPE_SECRET_KEY="..." STRIPE_WEBHOOK_SECRET="..."
export STRIPE_PRICE_STARTER="..." STRIPE_PRICE_PLUS="..." STRIPE_PRICE_PRO="..."
export AGORA_APP_ID="..." AGORA_APP_CERTIFICATE="..."
export HIVE_API_KEY="..." HIVE_WEBHOOK_SECRET="..."

# 2. Run DB migrations
npx prisma migrate deploy

# 3. Run deploy
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
