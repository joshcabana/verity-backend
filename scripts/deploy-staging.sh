#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARAMS_FILE="${1:-$ROOT/infra/azure/params.staging.json}"
IMAGE_TAG="${IMAGE_TAG:-staging}"
RESOURCE_GROUP="${AZURE_RG:?AZURE_RG is required}"
TEMPLATE_FILE="$ROOT/infra/azure/main.bicep"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI not found. Install from https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if [[ ! -f "$PARAMS_FILE" ]]; then
  echo "Params file not found: $PARAMS_FILE" >&2
  exit 1
fi

"$ROOT/scripts/preflight-env.sh"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to parse the params file." >&2
  exit 1
fi

read -r ACR_NAME API_NAME WORKER_NAME < <(python3 - <<PY
import json
import sys
path = "$PARAMS_FILE"
params = json.load(open(path))['parameters']
print(params['acrName']['value'], params['apiName']['value'], params['workerName']['value'])
PY
)

API_IMAGE="$ACR_NAME.azurecr.io/verity-api:$IMAGE_TAG"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters @"$PARAMS_FILE" \
  --parameters apiImage="$API_IMAGE" workerImage="$API_IMAGE" \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
  --parameters jwtSecret="$JWT_SECRET" jwtAccessSecret="$JWT_ACCESS_SECRET" jwtRefreshSecret="$JWT_REFRESH_SECRET" \
  --parameters stripeSecretKey="$STRIPE_SECRET_KEY" stripeWebhookSecret="$STRIPE_WEBHOOK_SECRET" \
  --parameters stripePriceStarter="$STRIPE_PRICE_STARTER" stripePricePlus="$STRIPE_PRICE_PLUS" stripePricePro="$STRIPE_PRICE_PRO" \
  --parameters agoraAppId="$AGORA_APP_ID" agoraAppCertificate="$AGORA_APP_CERTIFICATE" \
  --parameters hiveApiKey="$HIVE_API_KEY" hiveWebhookSecret="$HIVE_WEBHOOK_SECRET"

az acr build \
  --registry "$ACR_NAME" \
  --image "verity-api:$IMAGE_TAG" \
  --file "$ROOT/Dockerfile" \
  "$ROOT"

az containerapp update \
  --name "$API_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image "$API_IMAGE"

az containerapp update \
  --name "$WORKER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image "$API_IMAGE"

echo "Deploy complete."
