#!/usr/bin/env bash
# Roll back the app service to a specific (or last known good) image tag.
# Usage: ./scripts/rollback.sh [image-tag]
set -euo pipefail

STATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.deploy_state"
STATE_FILE="$STATE_DIR/last_good_tag"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  [ -f "$STATE_FILE" ] || { echo "No tag given and no recorded last-good tag."; exit 1; }
  TAG="$(cat "$STATE_FILE")"
fi

APP_PORT="${APP_PORT:-3000}"
echo "==> Rolling back app to tag: $TAG"
export APP_IMAGE_TAG="$TAG"

docker compose up -d app

for i in $(seq 1 10); do
  if curl -fsS "http://localhost:${APP_PORT}/readyz" >/dev/null 2>&1; then
    echo "==> Rollback verified healthy on tag $TAG"
    mkdir -p "$STATE_DIR"
    echo "$TAG" > "$STATE_FILE"
    exit 0
  fi
  sleep 2
done

echo "!! Rollback target also unhealthy. Escalate to on-call."
docker compose logs --tail=50 app || true
exit 1
