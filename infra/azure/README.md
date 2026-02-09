# Azure Australia Deployment (Canberra-first)

This folder provisions Azure infrastructure for the Verity backend using Bicep.

## Region Strategy

- **Primary**: Australia Central (Canberra)
- **Fallback**: Australia East (Sydney)

Australia Central is a restricted region. If access is blocked, use the Sydney fallback parameter file and proceed with the exact same deployment steps.

## What This Creates

- Azure Container Registry (ACR)
- Azure Container Apps environment
- API container app (port 3000)
- Worker container app (matching worker)
- Azure Database for PostgreSQL (Flexible Server)
- Azure Cache for Redis
- Azure Key Vault (secrets)
- Log Analytics workspace

## Quick Start

1) Create a resource group

```bash
az group create -n verity-au -l australiaCentral
```

2) Deploy infrastructure

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

3) Build and push the API image

```bash
az acr build --registry <acrName> --image verity-api:latest --file Dockerfile .
```

4) Update container apps to the latest image

```bash
az containerapp update --name <apiName> --resource-group verity-au --image <acrName>.azurecr.io/verity-api:latest
az containerapp update --name <workerName> --resource-group verity-au --image <acrName>.azurecr.io/verity-api:latest
```

5) Run migrations

```bash
DATABASE_URL=... npx prisma migrate deploy
```

## Staging Helpers

- Template: `infra/azure/params.staging.template.json`
- Generator: `scripts/generate-staging-params.sh`
- Deploy helper: `scripts/deploy-staging.sh`
- Preflight: `scripts/preflight-env.sh`

Example:

```bash
scripts/generate-staging-params.sh
AZURE_RG=verity-staging scripts/deploy-staging.sh
```

## Managed Identity + Key Vault

- Container Apps use a user-assigned managed identity.
- Secrets are stored in Key Vault and referenced by the apps.
- ACR pulls are handled via the same identity (no registry passwords stored in app config).
- Worker runtime uses `node dist/main.js` with `ENABLE_MATCHING_WORKER=true` so only the worker app runs queue matching loops.

## Low-Risk PostgreSQL Hardening

These settings are optional and default to the current behavior for compatibility:

- `postgresPublicNetworkAccess`: `Enabled` (default) or `Disabled`
- `postgresAllowAzureServices`: `true` (default) keeps the `AllowAzureServices` rule
- `postgresFirewallRules`: additional named IP ranges when public access is enabled

Example hardened public config:

```json
"postgresPublicNetworkAccess": { "value": "Enabled" },
"postgresAllowAzureServices": { "value": false },
"postgresFirewallRules": {
  "value": [
    { "name": "office", "startIpAddress": "203.0.113.10", "endIpAddress": "203.0.113.10" }
  ]
}
```

For full private networking, set `postgresPublicNetworkAccess` to `Disabled` only after adding private connectivity for your Container Apps environment.

## Front Door + Custom Domain (Optional)

Front Door provides a global anycast entrypoint, TLS, and WAF options.
Enable it by setting `enableFrontDoor` to `true` in your params file.

Recommended flow:
1. Set `enableFrontDoor` to `true` and configure `frontDoorProfileName` and `frontDoorEndpointName`.
2. Redeploy the Bicep template.
3. Note the `frontDoorEndpointHost` output and create a CNAME to it.
4. Set `frontDoorCustomDomain` to your API domain and redeploy for managed TLS.

For a pure Australia routing path, keep Front Door disabled and use a regional load balancer or direct Container Apps FQDN.

### WAF + Rate Limits

Enable WAF with:
- `enableFrontDoorWaf: true`
- `frontDoorWafPolicyName` set to a unique name
- `frontDoorRateLimit` set to your desired requests/min threshold
- `frontDoorRateLimitExemptPaths` set to an array of webhook paths to bypass rate limiting

This creates a standard managed ruleset and a global rate‑limit rule that blocks abusive traffic.
Webhook endpoints such as Stripe and Hive are exempt from the rate‑limit rule by default.

## Key Vault RBAC Mode (Optional)

Set `keyVaultUseRbac` to `true` in your params file to enable RBAC mode.
When RBAC is enabled:
- Access policies are disabled.
- A role assignment is created for the app identity (`Key Vault Secrets User`).
- Your deployment principal must have permission to **write secrets** in Key Vault (e.g., `Key Vault Secrets Officer`).

## Secret Rotation (Minimal Guidance)

Recommended rotation flow:
1. Update secret values in the params file.
2. Redeploy the Bicep template to create new versions.
3. Restart the Container Apps (or re-apply the image) to pick up new secret versions.

Manual flow (not preferred):
- Update the Key Vault secret value to a new version.
- Update the Container App secret reference to the new version (redeploy or update).

## Sydney Fallback

Use the Sydney parameter file instead:

```bash
az deployment group create \
  --resource-group verity-au \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/params.sydney-fallback.json
```

Everything else stays the same.
