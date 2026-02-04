#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NETWORK_NAME="verity-net"
PG_CONTAINER="verity-pg"
REDIS_CONTAINER="verity-redis"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not found in PATH."
  exit 1
fi

ensure_network() {
  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    docker network create "$NETWORK_NAME" >/dev/null
  fi
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -q "^${1}$"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -q "^${1}$"
}

ensure_container() {
  local name="$1"
  shift

  if container_exists "$name"; then
    if ! container_running "$name"; then
      docker start "$name" >/dev/null
    fi
    return
  fi

  docker run -d --name "$name" "$@" >/dev/null
}

ensure_network

ensure_container "$PG_CONTAINER" \
  --network "$NETWORK_NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=verity \
  -p 5432:5432 \
  postgres:16

ensure_container "$REDIS_CONTAINER" \
  --network "$NETWORK_NAME" \
  -p 6379:6379 \
  redis:7

docker run --rm --network "$NETWORK_NAME" \
  -v "$ROOT_DIR":/repo:ro \
  -w /tmp/app \
  node:24 \
  bash -lc "mkdir -p /tmp/app \
    && tar --exclude=node_modules --exclude=.git -C /repo -cf - . | tar -C /tmp/app -xf - \
    && npm ci \
    && DATABASE_URL='postgres://postgres:postgres@${PG_CONTAINER}:5432/verity' npx prisma db push --accept-data-loss \
    && DATABASE_URL='postgres://postgres:postgres@${PG_CONTAINER}:5432/verity' REDIS_URL='redis://${REDIS_CONTAINER}:6379' npm run test:e2e -- queue-session-decision.e2e-spec.ts"
