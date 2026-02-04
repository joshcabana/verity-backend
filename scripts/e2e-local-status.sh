#!/usr/bin/env bash
set -euo pipefail

NETWORK_NAME="verity-net"
PG_CONTAINER="verity-pg"
REDIS_CONTAINER="verity-redis"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not found in PATH."
  exit 1
fi

echo "Docker containers:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
  | grep -E "NAME|${PG_CONTAINER}|${REDIS_CONTAINER}" || true

echo
echo "Docker network:"
if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "Network ${NETWORK_NAME}: present"
else
  echo "Network ${NETWORK_NAME}: missing"
fi
