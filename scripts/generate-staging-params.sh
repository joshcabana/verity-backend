#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${1:-$ROOT/infra/azure/params.staging.template.json}"
OUTPUT="${2:-$ROOT/infra/azure/params.staging.json}"
SUFFIX="${3:-}"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 1
fi

if [[ -z "$SUFFIX" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    SUFFIX=$(python3 - <<'PY'
import secrets
alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
print(''.join(secrets.choice(alphabet) for _ in range(6)))
PY
)
  else
    SUFFIX=$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)
  fi
fi

sed "s/STG_SUFFIX/${SUFFIX}/g" "$TEMPLATE" > "$OUTPUT"

echo "Generated: $OUTPUT"
