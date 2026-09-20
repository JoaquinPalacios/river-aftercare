# Production Prisma migrations — River Aftercare

Canonical release procedure after a committed migration existed on `main` while production Neon had not received it. Vercel then deployed code that selected `ClinicProfile.typeface` and Prisma failed with **P2022**. Applying `prisma migrate deploy` via `DIRECT_URL` recovered production without an application redeploy.

This document is the release-control contract. It does not provision Neon or Vercel and does not store credentials.

## Canonical release policy

River Aftercare **keeps Vercel automatic Production deployments from `main` enabled**. Do not disable them as part of normal operations. Manual Promote is **not** the current release policy.

The production schema gate is the intended safety model. A failed Production build because migrations are pending is a **safety gate**, not an incident by itself. Existing Production continues serving the last successful deployment while the new build is blocked.

Production migrations remain **human-approved**. Vercel builds never apply migrations. Preview builds never apply migrations. Pull-request builds never receive production migration credentials.

### App-only PR

1. Merge to `main`
2. Vercel Production build starts
3. Production schema gate confirms the database has no pending migrations
4. Build succeeds
5. Automatic Production deployment completes

No manual deployment or promotion is required.

### Schema-changing PR

1. Merge to `main`
2. Vercel Production build starts
3. Production schema gate detects a pending Prisma migration
4. Build **fails**
5. Currently deployed Production remains live
6. Joaquín reviews the migration SQL
7. On a trusted local machine:

```bash
pnpm prod:db:status
```

8. If safe:

```bash
pnpm prod:db:migrate --apply
```

9. Verify:

```bash
pnpm prod:db:verify
```

10. Redeploy the **same** merged SHA in Vercel
11. Schema gate now passes
12. That deployment becomes Production

This failed-build-then-migrate-then-redeploy behaviour is **intentional**.

| Release contents                                           | Production action                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No `prisma/schema.prisma` or `prisma/migrations/**` change | Merge to `main`. Automatic Production deploy proceeds after the schema gate confirms no pending migrations.                                                  |
| Prisma schema and/or migration present                     | Merge to `main`. The Production schema gate is **expected** to fail the build. Review SQL → preflight → apply → verify → **Redeploy the same SHA**.          |

Migrations are not all the same:

| Class                         | Meaning                                           | Release implication                                                                                             |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A. Additive / expand          | New table/column/index/enum that old code ignores | Apply to production **before** code that reads or writes the new shape.                                         |
| B. Destructive / contract     | DROP / TRUNCATE / DELETE / ALTER DROP             | **No single-step schema+code cutover.** Expand/contract. Keep the old application compatible during transition. |
| C. Data migrations            | UPDATE/backfill                                   | Treat as a schema-touching release. Review row impact. Do not hide behind “no schema.prisma change”.            |
| D. No-schema application only | No Prisma paths in the diff                       | No production `migrate deploy`. Automatic Production deploy from `main` is the normal path.                     |

Never against production:

- `prisma db push`
- `prisma migrate reset`
- `prisma migrate dev`
- `pnpm db:seed` / `prisma db seed`

`migrate deploy` does not run the seed script. Production seed must still never be invoked as a separate step.

## Why this is not automatic

| Surface                    | Runs production `migrate deploy`? | Why                                                                                                                                                                                        |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pull request GitHub Action | No                                | Untrusted branches must not receive production credentials. The Action only diffs git.                                                                                                     |
| Vercel Preview             | No                                | Preview must not mutate Neon production.                                                                                                                                                   |
| Vercel Production build    | No                                | `pnpm build` generates the Prisma client and, on `VERCEL_ENV=production` only, runs **`migrate status`**. If migrations are pending, the build **fails**. It never deploys schema changes. |
| Local `pnpm prod:db:*`     | Only with `--apply` on migrate    | Trusted human release action using gitignored `.env.neon-production`.                                                                                                                      |

There is no environment-protected GitHub Actions deploy workflow in this repository. Production migration stays a local, explicit command. Do not add a `pull_request` workflow that reads Neon URLs.

## DIRECT_URL vs Vercel

These are different machines with different credentials.

**Trusted migration machine** (human-approved production apply):

- gitignored `.env.neon-production`
- `DATABASE_URL` (pooled runtime URL; required by the helpers)
- `DIRECT_URL` (unpooled; Prisma migration CLI resolves this)
- `pnpm prod:db:*` commands

**Vercel Production build:**

- uses the production schema gate (`prisma migrate status` only)
- already has runtime `DATABASE_URL`
- should **not** require adding `DIRECT_URL` merely to support ordinary application runtime
- the current gate proceeds when `DATABASE_URL` is present; Prisma CLI prefers `DIRECT_URL` if it happens to be set, otherwise `DATABASE_URL`
- do not expose `DIRECT_URL` to Vercel unless a future explicitly reviewed implementation genuinely requires it

`DIRECT_URL` is for trusted production migration execution. `DATABASE_URL` remains the application runtime connection.

## Detection (no database)

```bash
pnpm release:check
```

Compares the current worktree against `origin/main` (or `RELEASE_CHECK_BASE` / `--base`). No production credentials.

- No Prisma path changes → normal.
- Prisma path changes → explicit release warning.
- `schema.prisma` changed without a new `migration.sql` → fail.
- Historical migration rewritten → fail.
- New SQL missing/empty → fail.
- Destructive SQL (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE … DROP`, …) without `-- river-aftercare:destructive-reviewed` → fail.
- Destructive SQL **with** that marker → warning. The marker is a human attestation, not an automatic approval.

PRs run the same check via `.github/workflows/prisma-release-gate.yml` (contents:read only).

## Canonical production commands

Create a **local, gitignored** `.env.neon-production` (`.env*` is already ignored). Put the Neon **pooled** URL in `DATABASE_URL` and the **unpooled** URL in `DIRECT_URL`. Do not commit the file. Do not copy it into Preview env or into Vercel merely to make the schema gate run.

Preferred helpers (fail closed if the file is missing, named wrong, lacks `DIRECT_URL`/`DATABASE_URL`, or points at localhost):

```bash
pnpm prod:db:status
pnpm prod:db:migrate              # prints the plan; does not apply
pnpm prod:db:migrate --apply      # prisma migrate deploy via DIRECT_URL
pnpm prod:db:verify
```

Pass `--apply` directly to the pnpm script. Do **not** insert a standalone `--` between the script name and `--apply`; pnpm forwards that `--` and `scripts/prod-db.mjs` rejects it (`Unknown argument: --`).

Equivalent manual commands (trusted machine only). Unsetting ambient URLs is required so local `.env` cannot win:

```bash
env -u DATABASE_URL -u DIRECT_URL \
  DOTENV_CONFIG_PATH=.env.neon-production \
  pnpm exec prisma migrate status --config prisma.config.ts

env -u DATABASE_URL -u DIRECT_URL \
  DOTENV_CONFIG_PATH=.env.neon-production \
  pnpm exec prisma migrate deploy --config prisma.config.ts
```

`prisma.config.ts` prefers `DIRECT_URL` when set. Runtime `getPrisma()` always uses `DATABASE_URL`.

Do not echo those URLs. Do not run seed. Do not run `db push`.

## Release record (copy into the PR or keep locally)

Lightweight. Do not add a database AuditLog.

- Migration name(s):
- SQL reviewed (A additive / B contract / C data):
- Destructive marker present if required:
- Production preflight (`pnpm prod:db:status`) passed:
- Migration applied (`pnpm prod:db:migrate --apply`):
- Verification (`pnpm prod:db:verify`) passed:
- Same merged SHA redeployed in Vercel after verification:

## Vercel deployments

**Canonical:** automatic Production deployments from `main` remain **enabled**. Do not disable them as part of normal River Aftercare operations.

On `VERCEL_ENV=production`, `pnpm build` runs `prisma migrate status` and refuses to finish if production is behind. It never runs `migrate deploy`, seed, or `db push`. After a pending-migration failure, apply migrations with `pnpm prod:db:migrate --apply`, verify, then **Redeploy** the same SHA. Existing Production stays on the prior successful deployment until that redeploy succeeds.

Break-glass only: `SKIP_PRODUCTION_SCHEMA_GATE=1` (do not use this to ship code that needs unapplied migrations).

**Not the current policy:** disabling Production auto-deploy and using Vercel **Promote** after migrate. That remains a possible future alternative if Joaquín later chooses it; it is **not** the canonical River Aftercare release workflow.

Do not configure Vercel to run `prisma migrate deploy` on every Production or Preview build. Do not put `.env.neon-production` or production `DIRECT_URL` on untrusted PR builds.
