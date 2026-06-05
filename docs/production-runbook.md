# Production Runbook

## Assumptions

- The VM already runs Docker, Docker Compose v2, and Traefik.
- Traefik exposes a Docker network named `traefik-public`.
- DNS points `WEB_HOST` and `API_HOST` to the VM.
- The first rollout is a private demo, not a public beta.

## First Deploy

1. Copy `.env.production.example` to `.env.production` on the VM.
2. Replace every placeholder secret with a strong generated value.
3. Confirm the Traefik network exists:

```bash
docker network inspect traefik-public
```

4. Build and start the stack:

```bash
docker compose --env-file .env.production -f docker/production.compose.yml up -d --build
```

For local config validation with the example file:

```bash
APP_ENV_FILE=../.env.production.example docker compose --env-file .env.production.example -f docker/production.compose.yml config
```

5. Check migration and app health:

```bash
docker compose --env-file .env.production -f docker/production.compose.yml ps
curl -fsS "https://${API_HOST}/v1/health"
```

## Smoke Test

- Register or seed one demo physician.
- Create one encounter.
- Run one copilot analysis after ingesting at least one guideline chunk.
- Generate, edit, and confirm a SOAP document.
- Confirm `/v1/audit` returns the confirmation event.

## Backup

Run at least daily and store encrypted output outside the VM:

```bash
docker compose --env-file .env.production -f docker/production.compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backup-$(date +%F).sql"
```

MinIO data is stored in the `copiloto_minio_data` Docker volume. Back it up together with the database when PDF/object storage is enabled.

## Rollback

1. Keep the previous image tag or commit SHA.
2. Restore the previous compose build from that SHA.
3. Restore the database only if the new migration is not backward-compatible.
4. Re-run the smoke test before reopening access.
