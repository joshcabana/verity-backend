#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"

RUN_MODE="${1:-single}"
KEEP="${2:-keep}"

run_status() {
  "${SCRIPTS_DIR}/e2e-local-status.sh"
}

run_tests() {
  case "$RUN_MODE" in
    all)
      "${SCRIPTS_DIR}/e2e-local-all.sh"
      ;;
    single)
      "${SCRIPTS_DIR}/e2e-local.sh"
      ;;
    *)
      echo "Usage: scripts/e2e-local-run.sh [single|all] [keep|clean]"
      exit 1
      ;;
  esac
}

run_cleanup() {
  "${SCRIPTS_DIR}/e2e-local-clean.sh"
}

run_status
run_tests

if [ "$KEEP" = "clean" ]; then
  run_cleanup
fi
