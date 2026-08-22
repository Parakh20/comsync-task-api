#!/usr/bin/env bash
# Demo: break the service with a bad DATABASE_URL env var, observe detection, then fix.
# Usage: ./scripts/inject-failure.sh break | fix
set -euo pipefail
ACTION="${1:?usage: inject-failure.sh break|fix}"
ENV_FILE=".env"

case "$ACTION" in
  break)
    echo "==> Injecting bad DB password into $ENV_FILE (simulates expired/rotated secret)"
    cp "$ENV_FILE" "$ENV_FILE.bak"
    sed -i.bak2 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=WRONG_PASSWORD/' "$ENV_FILE"
    docker compose up -d app
    echo "==> Watch: docker compose ps app   (expect 'unhealthy')"
    echo "==> Watch: docker compose logs -f app   (expect auth failure / ECONNREFUSED)"
    ;;
  fix)
    echo "==> Restoring known-good $ENV_FILE"
    mv "$ENV_FILE.bak" "$ENV_FILE"
    rm -f "$ENV_FILE.bak2"
    docker compose up -d app
    echo "==> Waiting for recovery..."
    for i in $(seq 1 15); do
      if curl -fsS "http://localhost:${APP_PORT:-3000}/readyz" >/dev/null 2>&1; then
        echo "==> Recovered."
        exit 0
      fi
      sleep 2
    done
    echo "!! Still not healthy after fix, inspect logs."
    exit 1
    ;;
  *)
    echo "unknown action: $ACTION"; exit 1 ;;
esac
