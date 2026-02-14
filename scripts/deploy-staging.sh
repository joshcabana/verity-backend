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

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in. Run: az login" >&2
  exit 1
fi

if [[ ! -f "$PARAMS_FILE" ]]; then
  echo "Params file not found: $PARAMS_FILE" >&2
  exit 1
fi

if rg -n "STG_SUFFIX" "$PARAMS_FILE" >/dev/null 2>&1; then
  echo "Params file still contains unresolved STG_SUFFIX placeholders: $PARAMS_FILE" >&2
  exit 1
fi

"$ROOT/scripts/preflight-env.sh"

az extension add --name containerapp --upgrade >/dev/null

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

DEPLOY_ARGS=(
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters @"$PARAMS_FILE" \
  --parameters apiImage="$API_IMAGE" workerImage="$API_IMAGE" \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
  --parameters jwtSecret="$JWT_SECRET" jwtAccessSecret="$JWT_ACCESS_SECRET" jwtRefreshSecret="$JWT_REFRESH_SECRET" \
  --parameters stripeSecretKey="$STRIPE_SECRET_KEY" stripeWebhookSecret="$STRIPE_WEBHOOK_SECRET" \
  --parameters stripePriceStarter="$STRIPE_PRICE_STARTER" stripePricePlus="$STRIPE_PRICE_PLUS" stripePricePro="$STRIPE_PRICE_PRO" \
  --parameters agoraAppId="$AGORA_APP_ID" agoraAppCertificate="$AGORA_APP_CERTIFICATE" \
  --parameters hiveApiKey="$HIVE_API_KEY" hiveWebhookSecret="$HIVE_WEBHOOK_SECRET" \
  --parameters moderationAdminKey="$MODERATION_ADMIN_KEY" \
)

add_param_if_set() {
  local param_name="$1"
  local env_value="$2"
  if [[ -n "$env_value" ]]; then
    DEPLOY_ARGS+=(--parameters "${param_name}=${env_value}")
  fi
}

add_param_if_set twilioAccountSid "${TWILIO_ACCOUNT_SID:-}"
add_param_if_set twilioAuthToken "${TWILIO_AUTH_TOKEN:-}"
add_param_if_set twilioVerifyServiceSid "${TWILIO_VERIFY_SERVICE_SID:-}"
add_param_if_set appOrigins "${APP_ORIGINS:-}"
add_param_if_set refreshCookieSameSite "${REFRESH_COOKIE_SAMESITE:-}"
add_param_if_set refreshCookieDomain "${REFRESH_COOKIE_DOMAIN:-}"
add_param_if_set pushDispatchWebhookUrl "${PUSH_DISPATCH_WEBHOOK_URL:-}"
add_param_if_set moderationAdminKeyFallback "${MODERATION_ADMIN_KEY_FALLBACK:-}"
add_param_if_set stripeSuccessUrl "${STRIPE_SUCCESS_URL:-}"
add_param_if_set stripeCancelUrl "${STRIPE_CANCEL_URL:-}"
add_param_if_set hiveStreamUrl "${HIVE_STREAM_URL:-}"
add_param_if_set hiveScreenshotUrl "${HIVE_SCREENSHOT_URL:-}"

az deployment group create "${DEPLOY_ARGS[@]}"

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
