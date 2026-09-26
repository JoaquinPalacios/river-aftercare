# Cursor Cloud environment — River Aftercare

This is the human-readable source of truth for the River Aftercare Cursor Cloud Agent environment.

The Cloud environment is an isolated development machine. It is for normal development, automated tests, browser and end-to-end verification, and authenticated testing as Operator, Admin, and Staff. It is not a production system and it is not a path to production infrastructure.

## Purpose

Cursor Cloud Agents should be able to install dependencies, start the app, run Vitest and Playwright, and sign in through the real River Aftercare authentication flow. They do that against a fresh local PostgreSQL 18 database inside the agent VM.

Production Neon, R2, Resend, Stripe, Vercel, Sentry, Cloudflare APIs, DNS, and production River Aftercare services are out of scope. Do not connect to them from this environment. Do not copy production credentials into it.

## Lifecycle

```text
Cursor Build
  -> reusable prepared Build
  -> fresh Cloud Agent VM
  -> local PostgreSQL 18
  -> committed migrations
  -> seed
  -> Next.js
  -> tests and browser verification
```

Two phases:

| Phase                                  | When it runs                                           | What it does                                                                                                       | What it must not do                                                                |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Build / `install`                      | While Cursor prepares a reusable Build, after checkout | Node 24, pinned pnpm, lockfile install, Prisma client generation, Playwright Chromium, cached `postgres:18-alpine` | Migrate, seed, require `CLOUD_*` or `AUTH_SECRET`, talk to production              |
| Fresh agent / `start` plus `terminals` | Every new Cloud Agent VM                               | Start Docker, start PostgreSQL, wait until it is ready, `prisma migrate deploy`, seed, then Next.js on port 3000   | `db push`, `migrate reset`, production migration helpers, production database URLs |

The repository configuration and a successful Cursor Build are reusable. Running processes and PostgreSQL data are not. Each agent VM starts from the Build disk, then `scripts/cursor-cloud-start.sh` creates a fresh local database state. Stopping the VM discards that database. Re-running startup against an already-running VM is safe: Compose, `migrate deploy`, and seed are idempotent.

Cursor checks out the repository itself. `.cursor/Dockerfile` does not `COPY` the project into the image.

## Runtime requirements

| Tool       | Requirement                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Node.js    | 24.x LTS. The image installs Node `24.21.0` (`.nvmrc` is `24`, `engines.node` is `^24.0.0`).         |
| pnpm       | Exact `packageManager` pin, currently `pnpm@11.24.0`, activated with Corepack.                       |
| PostgreSQL | 18, via Compose service `postgres` using `postgres:18-alpine`.                                       |
| Prisma     | Stable 7.x (`PrismaPg` + `pg`). Generate during install. Deploy committed migrations during startup. |
| Next.js    | `pnpm exec next dev --hostname 0.0.0.0 --port 3000` in the `next-dev` terminal.                      |
| Playwright | Chromium, installed with OS dependencies during install.                                             |

Docker Compose is the local PostgreSQL mechanism. The Cloud image follows Cursor's current nested-Docker pattern: Docker CE, the Compose plugin, `fuse-overlayfs`, and `iptables-legacy`, with the `ubuntu` user in the `docker` group. See [Cloud Environment Setup](https://cursor.com/docs/cloud-agent/setup). Do not invent a different daemon configuration.

The base Cloud image used for ad-hoc agent setup does not provide Node 24 or a nested Docker engine. A custom Dockerfile remains justified.

## Databases

| Database         | Use                                                              |
| ---------------- | ---------------------------------------------------------------- |
| `care_guide`     | Normal Cloud development, Vitest database tests, and `pnpm dev`. |
| `care_guide_e2e` | Playwright only. Playwright creates, migrates, and seeds it.     |

Connection strings match `compose.yaml` (`postgres` / `postgres` on `localhost:5432`). `scripts/cursor-cloud-start.sh` writes those non-secret values into the gitignored `.env` and refuses any other target.

`DIRECT_URL` is not configured. A set `DIRECT_URL`, a Neon hostname, or `VERCEL_ENV=production` fails startup. Do not introduce `.env.neon-production`.

Playwright keeps the existing guard that refuses to run when the E2E URL points at the development database.

Startup applies schema with:

```bash
pnpm exec prisma migrate deploy --config prisma.config.ts
pnpm db:seed
```

That is the committed-migration workflow. It is not `prisma db push`, not `prisma migrate reset`, and not `pnpm prod:db:*`.

## Cloud login accounts

Cursor supplies these variables for the Cloud environment. Do not hardcode them, commit them, or put real values in `.env.example`.

| Variable                  | Kind                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `CLOUD_ADMIN_EMAIL`       | Environment variable                                             |
| `CLOUD_ADMIN_PASSWORD`    | Runtime Secret                                                   |
| `CLOUD_STAFF_EMAIL`       | Environment variable                                             |
| `CLOUD_STAFF_PASSWORD`    | Runtime Secret                                                   |
| `CLOUD_OPERATOR_EMAIL`    | Environment variable                                             |
| `CLOUD_OPERATOR_PASSWORD` | Runtime Secret                                                   |
| `AUTH_SECRET`             | Runtime Secret, Cloud-only, newly generated for this environment |

`AUTH_SECRET` must not be the production secret or a local developer's secret. It is never written into the repository, this document, or logs.

`lib/dev/local-login-accounts.ts` is the only credential resolver. Seed, Playwright sign-in, and the navigation-latency script all use it.

For each role independently:

1. A complete `CLOUD_*` email and password pair wins.
2. If neither Cloud variable is set, the existing `LOCAL_*` pair is used, including the current behaviour of skipping an incomplete Local pair.
3. If only one side of a Cloud pair is set, or the email is blank, resolution fails. It does not combine a Cloud email with a Local password.
4. `NODE_ENV=production` refuses the seed when any `LOCAL_*` or `CLOUD_*` credential variable is present, and does not write development accounts. Production with none of those variables still skips account creation.

The three Cloud accounts are disposable development users on the demo clinic (`demodental`), except Operator, which stays a platform operator without a clinic membership. Sign in through the real UI. Do not add an authentication bypass.

| Role     | Account            | After login      |
| -------- | ------------------ | ---------------- |
| Admin    | `CLOUD_ADMIN_*`    | Staff dashboard  |
| Staff    | `CLOUD_STAFF_*`    | Staff dashboard  |
| Operator | `CLOUD_OPERATOR_*` | Operator clinics |

Local development is unchanged. Developers keep using `LOCAL_ADMIN_*`, `LOCAL_STAFF_*`, and `LOCAL_OPERATOR_*` from their own `.env`. Cloud variables are not required on a laptop.

## Hostnames

`CARE_GUIDE_ROOT_DOMAIN=localhost`.

The Cloud image's default resolver does not implement RFC 6761, so `app.localhost` would not resolve. Startup runs `dnsmasq` only when `app.localhost` does not already resolve, and answers every name under `.localhost` on `127.0.0.1`. That is wildcard DNS, not an `/etc/hosts` list. Laptops that already resolve `*.localhost` are left unchanged. Tenancy code is unchanged.

Inside the VM:

| URL                                | Surface           |
| ---------------------------------- | ----------------- |
| `http://localhost:3000`            | Marketing         |
| `http://app.localhost:3000`        | Staff application |
| `http://demodental.localhost:3000` | Demo tenant       |
| `http://<slug>.localhost:3000`     | Other tenants     |

Cursor's documented port forwarding opens the agent's port on a forwarded hostname. That hostname is not `*.localhost`, so it does not satisfy River Aftercare tenancy. Current Cursor port-forwarding documentation does not provide a supported way to preserve this app's Host-based routing on the external preview URL. Do not change tenancy security to make that hostname work.

Validate hostname-sensitive behaviour inside the VM with Playwright or with an explicit `Host` header against `127.0.0.1:3000`.

## External services

Cloud startup writes local, inert defaults:

| Integration            | Cloud behaviour                                                            |
| ---------------------- | -------------------------------------------------------------------------- |
| Clinic assets          | `CLINIC_ASSET_STORAGE_DRIVER=filesystem` under `.data/clinic-assets`       |
| Marketing contact mail | `CONTACT_MAILER=memory`                                                    |
| Auth mail              | In memory, because this is not Vercel production                           |
| Turnstile              | Published Cloudflare test keys already used by local development           |
| Stripe                 | Unset. No live or test secret keys                                         |
| Sentry                 | Unset                                                                      |
| Vercel                 | `VERCEL_ENV` unset. `pnpm build` does not enter the production schema gate |
| R2                     | Unset                                                                      |

Startup refuses `RESEND_API_KEY`, R2 credentials, Stripe secrets, and Sentry DSNs or auth tokens so a production credential cannot be used by mistake.

## Testing

From the agent VM, after startup:

```bash
pnpm lint
pnpm exec tsc -b --pretty false
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm build` generates the Prisma client, lints, typechecks, and runs `next build`. The production schema gate runs only when `VERCEL_ENV=production`, which Cloud startup rejects. Do not set `SKIP_PRODUCTION_SCHEMA_GATE`.

`pnpm test:e2e` uses `care_guide_e2e` and refuses `care_guide`. Playwright starts `next start` on port 4173 from the existing production build, so run `pnpm build` first.

Static marketing pages bake demo and staff links at build time. With `CARE_GUIDE_METADATA_BASE` unset, those links use port 3000, which is correct for the Cloud dev server and wrong for Playwright. Before `pnpm test:e2e`, rebuild with `CARE_GUIDE_METADATA_BASE=http://localhost:4173` so the baked hrefs match port 4173. Do not put that value in the Cloud `.env`: the dev server on port 3000 must keep port 3000 links. Do not change tenancy routing to hide this.

Re-run `bash scripts/cursor-cloud-start.sh` to confirm startup is safe the second time.

## Network

Egress stays open until a Cloud Build has succeeded. Production-service credentials stay absent even when the network can reach those vendors. Do not call production endpoints.

After a green validation run, record the domains that install and startup actually contacted and only then consider a least-privilege allowlist. Do not invent that list.

## Rebuild and validate

1. Change `.cursor/Dockerfile` or `.cursor/environment.json` on a branch.
2. Push the branch. Cursor Builds use the default-branch environment configuration until an agent is started on the branch that contains the change.
3. Start a Cloud Agent on that branch so Cursor builds the image and runs `install`.
4. Confirm startup, then run the testing commands above.

Interactive "set up the environment" from the dashboard uses Cursor's base image and ignores `build.dockerfile`. The committed Dockerfile is applied when a Cloud Agent starts from this repository configuration.

## Troubleshooting

| Symptom                                                 | What to check                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm` version differs from `packageManager`            | `corepack enable` and `corepack prepare --activate` from the repository root.                                                                                      |
| Docker will not start                                   | `sudo service docker start`, then `docker info`. The daemon must use `fuse-overlayfs` inside the Cloud VM.                                                         |
| PostgreSQL never becomes ready                          | `docker compose ps` and `docker compose logs postgres`. Startup waits on `pg_isready` for `care_guide` and fails with those logs. Do not `docker compose down -v`. |
| Seed says Cloud credentials are incomplete              | Set both variables for that role, or unset both. Do not fill the missing half from `LOCAL_*`.                                                                      |
| Login fails before the form                             | `AUTH_SECRET` must be present as a Runtime Secret. The app fails fast when it is missing.                                                                          |
| Staff or tenant routes 404 on the forwarded preview URL | Expected. Use `http://app.localhost:3000` and `http://<slug>.localhost:3000` inside the VM.                                                                        |
| `app.localhost` does not resolve                        | Re-run `bash scripts/cursor-cloud-start.sh`. It starts `dnsmasq` for RFC 6761 names. Do not add tenant names to `/etc/hosts`.                                      |
| `pnpm build` tries to reach Neon                        | `VERCEL_ENV` or `DIRECT_URL` has been set. Unset them. Cloud build must not run the production schema gate.                                                        |
| E2E refuses the database                                | `E2E_DATABASE_URL` points at `care_guide`. Keep it on `care_guide_e2e`.                                                                                            |

## Maintenance contract

The Cursor Cloud configuration is not one-time setup.

Any repository change that alters development or runtime requirements must include a review of the Cursor Cloud environment as part of the same change. Do not defer that update to a future task.

Review the Cloud environment when changing any of:

- Node version
- pnpm or `packageManager` version
- dependencies that add or remove system or native requirements
- development, build, or test scripts
- Prisma versions, configuration, or schema workflow
- PostgreSQL version
- `compose.yaml`
- database bootstrap, migrations, or seeding
- required environment variables
- authentication setup
- local hostname or tenancy routing
- ports
- Playwright or browser requirements
- E2E database behaviour
- build or start commands
- new local services
- external integrations required for development or tests

When one of those changes affects Cloud development, update the appropriate combination of these files in the same branch and pull request:

- `.cursor/environment.json`
- `.cursor/Dockerfile`
- `docs/development/CURSOR-CLOUD.md`
- `AGENTS.md`

When one of those areas changes but no Cloud change is required, the agent's final task report must explicitly state:

```text
Cursor Cloud environment reviewed; no update required.
```

`AGENTS.md` carries the short operational form of this contract. This document is the detailed one. Do not copy this page back into `AGENTS.md`.
