#!/usr/bin/env bash
set -euo pipefail

required=(
  AZURE_RG
  POSTGRES_ADMIN_PASSWORD
  JWT_SECRET
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_STARTER
  STRIPE_PRICE_PLUS
  STRIPE_PRICE_PRO
  AGORA_APP_ID
  AGORA_APP_CERTIFICATE
  HIVE_API_KEY
  HIVE_WEBHOOK_SECRET
)

missing=()
for var in "${required[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing required env vars:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "Preflight OK: required env vars are set."
