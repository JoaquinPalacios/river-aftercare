# PostgreSQL 18 local upgrade — River Aftercare

Repository / local / test contract. **Not** a production Neon runbook.

Current development baseline is **PostgreSQL 18**. Production Neon is already born on PostgreSQL 18 in AWS Asia Pacific 2 (Sydney). This document is for Joaquín's **local Docker** database if it still has PostgreSQL 17 data.

Do **not** connect to the Neon project from these steps.
Do **not** run `docker compose down -v`, `docker volume rm`, or `docker system prune` as part of this upgrade. Those commands can destroy the existing PostgreSQL 17 volume.

Cloud Cursor cannot migrate Joaquín's Mac volume. Run this on the machine that already has the local database.

## Why a new volume

The official PostgreSQL Docker image changed storage layout at major 18.

| Major | Compose volume key (this repo) | Container mount            | Default `PGDATA`                |
| ----- | ------------------------------ | -------------------------- | ------------------------------- |
| ≤17   | `postgres_data` (legacy, keep) | `/var/lib/postgresql/data` | `/var/lib/postgresql/data`      |
| 18    | `postgres18_data` (current)    | `/var/lib/postgresql`      | `/var/lib/postgresql/18/docker` |

Replacing `postgres:17-alpine` while leaving the old `postgres_data:/var/lib/postgresql/data` mount is **not** a valid upgrade. PostgreSQL 18 must not mount, initialize, or overwrite the PG17 volume.

The new compose file therefore:

- uses `postgres:18-alpine`;
- mounts a **new** named volume `postgres18_data` at `/var/lib/postgresql`;
- sets `PGDATA=/var/lib/postgresql/18/docker`;
- leaves the old `postgres_data` volume undeclared so Compose never attaches it.

Docker prefixes named volumes with the Compose project (usually the directory name). On disk the legacy volume looks like `<project>_postgres_data`. The new one is `<project>_postgres18_data`.

Keep the PG17 volume until Joaquín has restored, verified, and **manually** approved its removal.

## Unchanged local ergonomics

|                      |                                                    |
| -------------------- | -------------------------------------------------- |
| Host port            | `5432` (this repository's contract; keep it)       |
| Development database | `care_guide`                                       |
| Playwright database  | `care_guide_e2e` (same server, different database) |
| User / password      | `postgres` / `postgres`                            |
| Healthcheck          | `pg_isready -U postgres -d care_guide`             |

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/care_guide?schema=public"
E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/care_guide_e2e?schema=public"
```

Playwright must not use `care_guide`. Production seed still refuses `LOCAL_*` demo credentials when `NODE_ENV=production`.

## Patch policy

- **Major contract:** PostgreSQL 18.
- Local Docker follows the existing unpinned-major tag policy: `postgres:18-alpine`.
- Production **minor/patch** is controlled by Neon. Do not hard-code a Neon patch in application docs.
- Do not use PostgreSQL 19 images.

## Preferred migration method

Logical dump / restore. Do **not** mount a PG17 data directory into PG18. Do **not** introduce `pg_upgrade` for this small development database. Production Neon does not need a 17→18 physical upgrade.

```text
PostgreSQL 17  →  pg_dump  →  SQL dump  →  fresh PostgreSQL 18 volume  →  psql  →  verify
```

---

## A. Fresh local PostgreSQL 18 (no data to keep)

If this machine never had a working River Aftercare PG17 volume, or the data is disposable:

```bash
docker compose up -d
docker compose ps
# wait until healthcheck is healthy, then:
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT version();"
pnpm db:generate
pnpm exec prisma migrate deploy --config prisma.config.ts
pnpm db:seed
```

Stop with `docker compose down` (no `-v`).

---

## B. Keep existing PG17 data (Joaquín's local database)

### 1. Record the old volume (do not delete it)

```bash
docker volume ls
docker compose ps
```

Note the project-prefixed PG17 volume (`*_postgres_data`, not `*_postgres18_data`). Example:

```bash
OLD_VOLUME="$(docker volume ls -q | grep -E '_postgres_data$' | grep -v postgres18_data)"
echo "$OLD_VOLUME"
```

If more than one name matches, pick the volume this repo actually used (same Compose project directory as `care-guide`).

### 2. Verify the PG17 source while it is still running

If the current `postgres:17-alpine` compose stack is still up on port 5432:

```bash
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT version();"
docker compose exec postgres psql -U postgres -d care_guide -c "SHOW server_version;"
docker compose exec postgres psql -U postgres -d care_guide -c "\dt"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT id, email, \"platformRole\" FROM \"User\" ORDER BY email;"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT id, name, slug FROM \"Clinic\";"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT COUNT(*) AS practice_guides FROM \"PracticeGuide\";"
```

Expect `server_version` to start with `17`. Demo clinic is `demodental` / `clinic_demo_rivers` when the development seed has been applied.

### 3. Backup before any compose change

Create a dated dump of `care_guide` (and `care_guide_e2e` if you care about Playwright leftovers; they are rebuildable):

```bash
mkdir -p "$HOME/river-aftercare-db-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/river-aftercare-db-backups/care_guide-pg17-${STAMP}.sql"

docker compose exec -T postgres pg_dump -U postgres -d care_guide --clean --if-exists --no-owner --no-acl > "$BACKUP"
ls -lh "$BACKUP"
```

Keep that file until PG18 restore is verified.

If compose has already been switched to 18 and the old volume is **not** mounted, start a **temporary PG17 container** against the old volume only. Do not use the new `postgres18_data` volume here:

```bash
docker run --rm -d --name care-guide-pg17-backup \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=care_guide \
  -e PGDATA=/var/lib/postgresql/data \
  -p 5435:5432 \
  -v "${OLD_VOLUME}:/var/lib/postgresql/data" \
  postgres:17-alpine

until docker exec care-guide-pg17-backup pg_isready -U postgres -d care_guide; do sleep 1; done

docker exec care-guide-pg17-backup psql -U postgres -d care_guide -c "SELECT version();"
docker exec -T care-guide-pg17-backup pg_dump -U postgres -d care_guide --clean --if-exists --no-owner --no-acl \
  > "$BACKUP"

docker stop care-guide-pg17-backup
```

Port `5435` is only for this one-shot backup so it does not collide with the PG18 server on `5432`.

### 4. Start fresh PostgreSQL 18 (new volume)

From the repo root after pulling this branch:

```bash
docker compose up -d
docker compose ps
```

Wait for `healthy`. Confirm it is 18 and that the mount is the new volume:

```bash
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT version();"
docker compose exec postgres psql -U postgres -d care_guide -c "SHOW server_version;"
docker compose exec postgres psql -U postgres -d care_guide -c "SHOW data_directory;"
docker volume ls | grep postgres
```

`data_directory` should be `/var/lib/postgresql/18/docker`. The old `*_postgres_data` volume must still appear in `docker volume ls`.

### 5. Restore the dump

```bash
docker compose exec -T postgres psql -U postgres -d care_guide < "$BACKUP"
```

`pg_dump --clean --if-exists` can emit notices for objects that did not exist on the empty PG18 database. That is expected.

### 6. Verify

```bash
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT version();"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT COUNT(*) FROM \"Clinic\";"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT COUNT(*) FROM \"User\";"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT COUNT(*) FROM \"PracticeGuide\";"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT slug, name FROM \"Clinic\" WHERE slug = 'demodental';"
```

PostgreSQL 18 no longer accepts `SHOW lc_collate` / `SHOW lc_ctype`. Read them from `pg_database` instead:

```bash
docker compose exec postgres psql -U postgres -d care_guide -c "SHOW server_encoding;"
docker compose exec postgres psql -U postgres -d care_guide -c "SHOW TimeZone;"
docker compose exec postgres psql -U postgres -d care_guide -c "SELECT pg_encoding_to_char(encoding) AS encoding, datcollate, datctype FROM pg_database WHERE datname = current_database();"
```

Then apply any remaining migrations and run tests:

```bash
pnpm db:generate
pnpm exec prisma migrate deploy --config prisma.config.ts
pnpm test
```

If migrate deploy reports pending migrations, apply them on PG18. Do not rewrite historical SQL.

### 7. Keep the PG17 volume

Leave `*_postgres_data` on disk until Joaquín confirms the restored PG18 database is good. Removal, if ever, is a **manual** later step:

```bash
# Only after explicit local approval. Not part of the upgrade.
# docker volume rm <project>_postgres_data
```

---

## Neon / Vercel (later — do not do this from the upgrade branch)

The repository stays on **PostgreSQL protocol + Prisma 7 + `PrismaPg` + `pg`**. Do not add `@neondatabase/serverless` or `@prisma/adapter-neon` unless the runtime moves to an edge environment that cannot open TCP.

When Joaquín wires production:

1. In the Neon console, copy the **pooled** connection string (`-pooler` in the hostname). Use that as Vercel `DATABASE_URL`. Keep `sslmode=require` (Neon may also add `channel_binding=require`).
2. Copy the **direct / unpooled** connection string (no `-pooler`). Use that as Vercel / local-prod-ops `DIRECT_URL` for `prisma migrate deploy`.
3. Local Docker continues to work with `DATABASE_URL` only. `prisma.config.ts` uses `DIRECT_URL` when set, otherwise `DATABASE_URL`.
4. Runtime `getPrisma()` always uses `DATABASE_URL` (pooled in production).

Do not mark production ready merely because the Neon project exists.

## CI

This repository has **no GitHub Actions workflow** that starts PostgreSQL. Vitest DB tests and Playwright e2e expect a PostgreSQL **18** server already reachable at `DATABASE_URL` / `E2E_DATABASE_URL` (local Compose, or an equivalent disposable server). Playwright creates `care_guide_e2e` on that same major and refuses to use `care_guide`.
