# comsync-task-api

Small CRUD task API, productionized: containers, env-based config, secrets, automated deploy, health checks, logging, monitoring, graceful shutdown, restart survival, safe rollout/rollback.

## Architecture

```mermaid
flowchart LR
  client[Client] -->|HTTP| app[app: Node/Express\n/healthz /readyz /metrics /api/tasks]
  app -->|pg pool| db[(Postgres\nvolume: db_data)]
  ci[GitHub Actions CI/CD] -->|build+push image| ghcr[GHCR registry]
  ci -->|SSH deploy.sh, readiness-gated| host[Deploy host: docker compose]
  host --> app
  host --> db
  app -->|stdout JSON logs| logs[Log collector / docker logs]
  app -->|/metrics| prom[Prometheus scrape]
```

- **App**: stateless Express service. All state lives in Postgres.
- **Config**: 100% via environment variables (`src/config.js`), validated at startup — missing `DATABASE_URL` fails fast instead of booting broken.
- **Secrets**: `.env` (gitignored) locally; in CI, GitHub **Environment secrets** (`DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `POSTGRES_PASSWORD`) — never committed, never baked into the image.

## Run locally

```bash
cp .env.example .env   # set a real POSTGRES_PASSWORD
docker compose up -d --build
curl localhost:3000/healthz
curl localhost:3000/readyz
curl -X POST localhost:3000/api/tasks -H 'content-type: application/json' -d '{"title":"ship it"}'
curl localhost:3000/api/tasks
```

## Health checks

- `/healthz` — liveness only (process up). No dependency calls, so a slow DB doesn't get the container killed.
- `/readyz` — readiness (DB reachable, 2s timeout). Compose `healthcheck` and deploy gate both use this.
- Both `db` and `app` compose services declare `healthcheck:`; `app` waits on `db: condition: service_healthy`.

## Restart / crash survival

- `restart: unless-stopped` on both services — a killed process or `docker restart` comes back automatically.
- Postgres data on named volume `db_data` — survives container recreation.
- App is stateless — safe to kill/restart anytime, no in-memory state lost.
- `SIGTERM`/`SIGINT` handlers drain in-flight requests, close the DB pool, then exit (bounded by `SHUTDOWN_TIMEOUT_MS`) — no dropped requests on a normal restart.

## Logging & monitoring

- Structured JSON logs to stdout via `pino`/`pino-http` (one line per request + lifecycle events), consumable by `docker logs`, Loki, CloudWatch, etc.
- `/metrics` — Prometheus format: default Node process metrics + `http_requests_total` and `http_request_duration_seconds` histograms by method/route/status.

## CI/CD (`.github/workflows/ci-cd.yml`)

1. **test** — `npm test` on every push/PR.
2. **build-and-push** — builds the Docker image, tags it `ghcr.io/<repo>:<short-sha>` and `:latest`, pushes to GHCR.
3. **deploy** — SSHes to the deploy host and runs `scripts/deploy.sh <tag>` (shown here as a dry-run echo since this environment has no live host; wire the SSH step to your actual box/VM/VPS).

## Safe deploy / detect bad deploy / rollback

`scripts/deploy.sh <tag>`:
1. Builds/pulls the new image tag, `docker compose up -d app` (old container stays healthy until the new one passes its own healthcheck and compose swaps it — Postgres is untouched).
2. Polls `/readyz` up to 30s.
3. **Healthy** → records `<tag>` in `.deploy_state/last_good_tag`, done.
4. **Unhealthy** → dumps `docker compose ps`/`logs`, then **auto-calls** `scripts/rollback.sh <last_good_tag>`.

`scripts/rollback.sh [tag]` — redeploys a specific tag (or the last recorded good one), verifies `/readyz` again. Manual rollback: `./scripts/rollback.sh <tag>`.

This is the whole "detect a bad deployment" mechanism: the readiness probe is the gate, not a human watching a dashboard.

## Failure introduced (for this exercise)

**What**: `scripts/inject-failure.sh break` overwrites `POSTGRES_PASSWORD` in `.env` with a wrong value and restarts `app` — simulating a rotated/expired DB secret that wasn't updated everywhere (a real incident shape).

**Detection**:
- `docker compose ps app` shows the container `unhealthy` (readiness check failing).
- `docker compose logs app` shows `password authentication failed for user "comsync"` from `pg`.
- `/readyz` returns `503 {"status":"not-ready","reason":"..."}` instead of `200`.
- If run through `scripts/deploy.sh`, the readiness gate fails automatically and rollback fires without a human noticing first.

**Fix**: `scripts/inject-failure.sh fix` restores the correct `.env` and restarts `app`; script polls `/readyz` until `200`. In prod this maps to: rotate the secret back / push the corrected value to the secret manager, redeploy.

## Discussion points

- **10x traffic**: app is stateless and horizontally scalable behind a load balancer (`docker compose --scale app=N` or move to k8s/ECS); bottleneck becomes the single Postgres instance — mitigate with connection pooling (already pooled via `pg.Pool`, tune `DB_POOL_MAX`), read replicas, and caching hot reads.
- **DB unavailable**: `/readyz` fails → orchestrator stops routing traffic / deploy gate blocks; app doesn't crash-loop (pool errors are caught, not thrown), requests hitting DB return `500` with logged detail, not a leaked stack trace.
- **Secret rotation**: secrets live outside the repo (`.env` locally, GitHub Environment secrets / a real secret manager in prod); rotate by updating the store and rolling the app (`docker compose up -d app` picks up new `.env`), no code change needed.
- **Rollback**: see above — tag-based, readiness-gated, one command.
- **Reducing downtime**: run two app replicas behind a proxy and do rolling restarts (one at a time, gated by `/readyz`) instead of the current single-instance restart; add a real load balancer with active health checks.
- **Deliberately not built**: Kubernetes, service mesh, blue/green infra with a second full environment, external secret manager integration (Vault/SSM — code is ready for it, just swap where `DATABASE_URL` comes from), alerting/paging (Prometheus is scrape-ready but no Alertmanager wired), multi-region — all real overkill for a small service; added when the operational cost of not having them exceeds the cost of building them.
