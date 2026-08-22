#!/usr/bin/env bash
# Deploy a new image tag with a readiness gate. Auto-rollback on failure.
# Usage: ./scripts/deploy.sh <image-tag>
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
STATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.deploy_state"
STATE_FILE="$STATE_DIR/last_good_tag"
mkdir -p "$STATE_DIR"

RETRIES="${DEPLOY_HEALTH_RETRIES:-15}"
SLEEP_SECS="${DEPLOY_HEALTH_INTERVAL:-2}"
APP_PORT="${APP_PORT:-3000}"

echo "==> Deploying tag: $TAG"
export APP_IMAGE_TAG="$TAG"

docker compose build app
docker compose up -d app

echo "==> Waiting for /readyz to report healthy (max $((RETRIES * SLEEP_SECS))s)"
ready=false
for i in $(seq 1 "$RETRIES"); do
  if curl -fsS "http://localhost:${APP_PORT}/readyz" >/dev/null 2>&1; then
    ready=true
    break
  fi
  echo "  attempt $i/$RETRIES not ready yet..."
  sleep "$SLEEP_SECS"
done

if [ "$ready" = true ]; then
  echo "==> Deployment healthy. Recording $TAG as last-good."
  echo "$TAG" > "$STATE_FILE"
  echo "==> Deploy succeeded: $TAG"
  exit 0
fi

echo "!! Deployment failed readiness gate. Fetching diagnostics:"
docker compose ps app || true
docker compose logs --tail=50 app || true

if [ -f "$STATE_FILE" ]; then
  PREV_TAG="$(cat "$STATE_FILE")"
  echo "!! Auto-rolling back to last known good tag: $PREV_TAG"
  "$(dirname "${BASH_SOURCE[0]}")/rollback.sh" "$PREV_TAG"
else
  echo "!! No previous good tag recorded. Manual intervention required."
fi

exit 1
