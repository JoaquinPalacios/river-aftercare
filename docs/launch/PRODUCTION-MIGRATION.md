# Production Prisma migrations — River Aftercare

Canonical release procedure after a committed migration existed on `main` while production Neon had not received it. Vercel then deployed code that selected `ClinicProfile.typeface` and Prisma failed with **P2022**. Applying `prisma migrate deploy` via `DIRECT_URL` recovered production without an application redeploy.

This document is the release-control contract. It does not provision Neon or Vercel and does not store credentials.

## Policy

| Release contents                                           | Production action                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| No `prisma/schema.prisma` or `prisma/migrations/**` change | Normal application deploy may proceed.                                                                    |
| Prisma schema and/or migration present                     | **Migrate-before-promote.** Review SQL → preflight → apply → verify → only then promote application code. |

Migrations are not all the same:

| Class                         | Meaning                                           | Release implication                                                                                             |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A. Additive / expand          | New table/column/index/enum that old code ignores | Apply to production **before** code that reads or writes the new shape.                                         |
| B. Destructive / contract     | DROP / TRUNCATE / DELETE / ALTER DROP             | **No single-step schema+code cutover.** Expand/contract. Keep the old application compatible during transition. |
| C. Data migrations            | UPDATE/backfill                                   | Treat as a schema-touching release. Review row impact. Do not hide behind “no schema.prisma change”.            |
| D. No-schema application only | No Prisma paths in the diff                       | No production `migrate deploy`.                                                                                 |

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

Create a **local, gitignored** `.env.neon-production` (`.env*` is already ignored). Put the Neon **pooled** URL in `DATABASE_URL` and the **unpooled** URL in `DIRECT_URL`. Do not commit the file. Do not copy it into Preview env.

Preferred helpers (fail closed if the file is missing, named wrong, lacks `DIRECT_URL`/`DATABASE_URL`, or points at localhost):

```bash
pnpm prod:db:status
pnpm prod:db:migrate              # prints the plan; does not apply
pnpm prod:db:migrate -- --apply   # prisma migrate deploy via DIRECT_URL
pnpm prod:db:verify
```

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
- Migration applied (`pnpm prod:db:migrate -- --apply`):
- Verification (`pnpm prod:db:verify`) passed:
- Application promoted / Production deploy of this SHA:

## Vercel promotion

**Current default Git behaviour:** a merge to `main` typically creates a Vercel Production deployment of application code. Migrations are **not** applied during that build. That is the code-before-schema failure mode.

**Safety net already in this repo:** on `VERCEL_ENV=production`, `pnpm build` runs `prisma migrate status` and refuses to finish if production is behind. After a pending-migration failure, apply migrations with `pnpm prod:db:migrate -- --apply`, then **Redeploy** the same SHA. Break-glass only: `SKIP_PRODUCTION_SCHEMA_GATE=1` (do not use this to ship code that needs unapplied migrations).

**Recommended Vercel dashboard change (Joaquín; not applied by this repository):**

1. Vercel → Project → **Settings** → **Environments** → **Production**.
2. Disable automatic deployments from the production Git branch (`main`).
3. Keep Preview deployments for pull requests.
4. After merge: preflight → apply → verify → **Deployments → Promote to Production** (or a manual Production deploy of the verified SHA).

Do not configure Vercel to run `prisma migrate deploy` on every Production or Preview build. Do not put `.env.neon-production` on untrusted PR builds.

## After merge of this control change

1. Keep using `pnpm release:check` on schema PRs (CI will too).
2. For the next Prisma-touching release, follow the sequence above **before** the Production hostname serves the new code.
3. Optionally disable Production auto-deploy as documented. The pending-migration build gate remains even if auto-deploy stays on.
