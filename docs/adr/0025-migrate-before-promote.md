# ADR 0025 — Migrate production before promoting application code

- **Status:** Accepted
- **Date:** 2026-09-19
- **Related:** [../launch/PRODUCTION-MIGRATION.md](../launch/PRODUCTION-MIGRATION.md), [../launch/PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md)

## Context

River Aftercare deploys application code from Git via Vercel. `pnpm build` generates the Prisma client and does **not** run `prisma migrate deploy`. Production schema changes are applied manually with `prisma migrate deploy` against Neon using unpooled `DIRECT_URL`.

A committed migration (`20260919140000_add_clinic_typeface`) reached `main` and Vercel Production before Neon had the corresponding column. Runtime queries selected `ClinicProfile.typeface` and failed with Prisma P2022. Applying the migration recovered the site without an application redeploy.

Automatic `migrate deploy` on every Vercel build or pull request would remove that class of outage by creating a worse one: unreviewed, possibly destructive SQL running against production from ordinary CI, and production credentials available to untrusted PR builds.

## Decision

- **Migrate-before-promote** is the production schema release policy. Additive, destructive, and data migrations are all schema-touching releases. Application-only releases are not.
- Repository CI detects Prisma path changes and pairing mistakes **without** production credentials.
- Production apply remains a **human** action on a trusted machine with gitignored `.env.neon-production`.
- Vercel Production builds may **observe** `prisma migrate status` and refuse to ship when the database is behind. They must not apply migrations, seed, or `db push`.
- Destructive SQL requires an explicit in-SQL review marker. The marker is attestation, not an automated approval of expand/contract sequencing.
- This repository does not add a GitHub Action that holds Neon production secrets.

## Consequences

- Schema-touching PRs produce an explicit release warning. Schema-without-migration and unreviewed destructive SQL fail the gate.
- If Production auto-deploy from `main` stays enabled, a pending migration fails the Production **build** until `migrate deploy` has been applied and the SHA is redeployed.
- Joaquín can further close the window by disabling Production auto-deploy and promoting a verified deployment after migrate. That dashboard change is not made from application PRs.

## Notes for later implementation

- Do not wire `DATABASE_URL` / `DIRECT_URL` into pull request GitHub Actions.
- Do not run `prisma migrate deploy` from Preview.
- Do not treat `SKIP_PRODUCTION_SCHEMA_GATE=1` as a normal release switch.
- Do not invent a second production database client or a Neon-specific Prisma adapter for this gate.
