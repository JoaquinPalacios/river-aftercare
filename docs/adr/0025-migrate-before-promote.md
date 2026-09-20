# ADR 0025 — Production schema gate with auto-deploy from main

- **Status:** Accepted
- **Date:** 2026-09-19
- **Related:** [../launch/PRODUCTION-MIGRATION.md](../launch/PRODUCTION-MIGRATION.md), [../launch/PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md)

The filename keeps the original “migrate-before-promote” slug. That name is historical. **Manual Vercel Promote is not the current River Aftercare release policy.**

## Context

River Aftercare deploys application code from Git via Vercel. `pnpm build` generates the Prisma client and does **not** run `prisma migrate deploy`. Production schema changes are applied manually with `prisma migrate deploy` against Neon using unpooled `DIRECT_URL` on a trusted machine.

A committed migration (`20260919140000_add_clinic_typeface`) reached `main` and Vercel Production before Neon had the corresponding column. Runtime queries selected `ClinicProfile.typeface` and failed with Prisma P2022. Applying the migration recovered the site without an application redeploy.

Automatic `migrate deploy` on every Vercel build or pull request would remove that class of outage by creating a worse one: unreviewed, possibly destructive SQL running against production from ordinary CI, and production credentials available to untrusted PR builds.

An earlier draft of this ADR treated disabling Production auto-deploy from `main` and using Vercel Promote after migrate as the preferred dashboard state. Joaquín has since chosen to **keep automatic Production deployments from `main` enabled**. The production schema gate is the intended safety model.

## Decision

- **Automatic Production deployments from `main` remain enabled.** Do not disable them as part of normal River Aftercare operations. Manual Promote is not the canonical workflow.
- App-only merges to `main` go through the Vercel Production build, the schema gate confirms there are no pending migrations, and the automatic Production deployment completes.
- Schema-changing merges to `main` start a Production build. The schema gate is **expected** to fail while migrations are pending. Existing Production stays live. After human-reviewed `pnpm prod:db:*` apply and verify, **redeploy the same SHA**.
- Additive, destructive, and data migrations are all schema-touching releases. Application-only releases are not.
- Repository CI detects Prisma path changes and pairing mistakes **without** production credentials.
- Production apply remains a **human** action on a trusted machine with gitignored `.env.neon-production`. `DIRECT_URL` is for that trusted migration execution. `DATABASE_URL` remains the application runtime connection.
- Vercel Production builds **observe** `prisma migrate status` (currently via runtime `DATABASE_URL` unless `DIRECT_URL` is already present) and refuse to ship when the database is behind. They must not apply migrations, seed, or `db push`. Do not add `DIRECT_URL` to Vercel merely for ordinary runtime or this gate.
- Destructive SQL requires an explicit in-SQL review marker. The marker is attestation, not an automated approval of expand/contract sequencing.
- This repository does not add a GitHub Action that holds Neon production secrets.

## Consequences

- Schema-touching PRs produce an explicit release warning. Schema-without-migration and unreviewed destructive SQL fail the git gate.
- A pending-migration Production **build failure is a safety gate, not an incident by itself.**
- After migrate + verify, redeploy the same git SHA so the schema gate can pass and that deployment becomes Production.
- Disabling Production auto-deploy and promoting a verified deployment remains a possible future alternative. It is **not** current policy and must not be recommended as the normal River Aftercare release process.

## Notes for later implementation

- Do not wire `DATABASE_URL` / `DIRECT_URL` into pull request GitHub Actions.
- Do not run `prisma migrate deploy` from Preview or from any Vercel build.
- Do not treat `SKIP_PRODUCTION_SCHEMA_GATE=1` as a normal release switch.
- Do not invent a second production database client or a Neon-specific Prisma adapter for this gate.
- Do not expose `DIRECT_URL` to Vercel unless a future explicitly reviewed implementation genuinely requires it.
