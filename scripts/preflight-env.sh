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
  MODERATION_ADMIN_KEY
)

missing=()
placeholder=()
for var in "${required[@]}"; do
  value="${!var:-}"
  if [[ -z "$value" ]]; then
    missing+=("$var")
    continue
  fi

  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized" == "replace_me" || "$normalized" == "change_me" ]]; then
    placeholder+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing required env vars:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

if [[ ${#placeholder[@]} -gt 0 ]]; then
  echo "Required env vars still use placeholder values:" >&2
  printf '  - %s\n' "${placeholder[@]}" >&2
  exit 1
fi

recommended=(
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_VERIFY_SERVICE_SID
)

warn_missing=()
for var in "${recommended[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    warn_missing+=("$var")
  fi
done

if [[ ${#warn_missing[@]} -gt 0 ]]; then
  echo "Warning: optional env vars not set (required for production phone/email verification):" >&2
  printf '  - %s\n' "${warn_missing[@]}" >&2
fi

echo "Preflight OK: required env vars are set and non-placeholder."
