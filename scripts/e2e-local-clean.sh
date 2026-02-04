#!/usr/bin/env bash
set -euo pipefail

NETWORK_NAME="verity-net"
PG_CONTAINER="verity-pg"
REDIS_CONTAINER="verity-redis"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not found in PATH."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  docker rm -f "$PG_CONTAINER" >/dev/null
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
  docker rm -f "$REDIS_CONTAINER" >/dev/null
fi

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  docker network rm "$NETWORK_NAME" >/dev/null
fi

echo "Cleaned containers (${PG_CONTAINER}, ${REDIS_CONTAINER}) and network (${NETWORK_NAME})."
