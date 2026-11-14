<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Database

Local development, Vitest database tests, and Playwright e2e target **PostgreSQL 18**. Docker Compose uses `postgres:18-alpine` with named volume `postgres18_data` mounted at `/var/lib/postgresql` (`PGDATA=/var/lib/postgresql/18/docker`). Do not mount a PostgreSQL 17 volume into PostgreSQL 18. Existing local PG17 volumes (`postgres_data`) must stay untouched until Joaquín restores via dump/restore. See [docs/development/POSTGRES-18-UPGRADE.md](docs/development/POSTGRES-18-UPGRADE.md).

Production target is Neon PostgreSQL 18 in AWS Asia Pacific 2 (Sydney). Do not connect to that project, run production migrations, or change Vercel `DATABASE_URL` unless Joaquín explicitly asks. Preview and Production `DATABASE_URL`, and trusted-machine `DIRECT_URL`, should use `sslmode=verify-full`. Local Docker URLs omit `sslmode`. Do not introduce `sslmode=no-verify`, `uselibpqcompat=true`, or `rejectUnauthorized: false`. Prisma stays on the stable 7.x line (`PrismaPg` + `pg`). Do not add a Neon-specific client.

# Care Guide product contract

Authoritative product requirements: `docs/product/PRD.md` (v1.0 — Aftercare SaaS).

Care Guide’s **product direction** is branded aftercare SaaS for healthcare practices. The commercial/product name is **River Aftercare**. The **current codebase** is staff auth, Phase 1A–1C aftercare, clinic portal / operator foundation through Phase 2A.5, and **Phase 2B SEO & Discovery**. Chairside / live-session functionality was removed as legacy in PR #96, and the legacy chairside Prisma schema was subsequently removed. Aftercare must not depend on `ProcedureSession`. Historical ADRs remain historical records. Do not claim later-phase MVP features (QR, analytics, Privacy/Terms, production infra) are implemented until they exist.

# Dependency and runtime baseline

Prefer the **latest stable, mutually compatible** version of every direct production and development dependency. Do not stay on an older direct version merely because it currently works.

Do not use alpha, beta, rc, canary, experimental, or preview packages unless there is no suitable stable package for the required capability **and** the exception is listed below. Do not treat a prerelease dist-tag as “latest”.

Verify versions from registry metadata (`pnpm outdated`, `pnpm view`) rather than assuming freshness. “Latest stable” still means the newest versions that keep this repository’s peer-dependency graph working.

Production runtime: latest actively supported **Node.js LTS** (currently 26.x). Local, CI, and the Cursor Cloud image pin **26.13.1**. Vercel selects the major with `engines.node` set to `26.x` and rolls its own patch. Do not use a newer Current release solely because the version number is higher.

Node.js 26 does not ship Corepack. Install `corepack@0.36.0` (`npm install -g corepack@0.36.0`), then `corepack enable` and `corepack prepare --activate` so the `packageManager` pin is the pnpm that installs the lockfile.

Package manager: latest stable pnpm on the npm `latest` dist-tag, pinned via `packageManager`. Versions that exist only on `next-12` are not the stable release.

## Current exceptions

| Package     | Current         | Latest stable                 | Why latest cannot be used                                                                                                                                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                | Planned resolution                                                                                                                                  |
| ----------- | --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next-auth` | `5.0.0-beta.32` | `4.24.15` (`latest` dist-tag) | The app already uses Auth.js v5 (Prisma adapter, `auth.ts`). npm `latest` is v4, a different major line.                                                                                                                                                                                                   | `pnpm view next-auth dist-tags` — `latest` is v4; v5 is only on `beta`. Moving to v4 is a significant auth-stack migration.                                                                                                                                                                                                                                             | Stay on the v5 beta line until Auth.js publishes a stable v5, then upgrade.                                                                         |
| `jsdom`     | `26.1.0`        | `31.0.1`                      | jsdom 31.0.1 is still CommonJS and depends on ESM-only `parse5@8` and `@exodus/bytes`. Vercel disables `require(esm)` by default, so SVG sanitisation throws `ERR_REQUIRE_ESM`. 26.1.0 remains the last CJS-safe line (`html-encoding-sniffer@4` + `parse5@7`). `@types/jsdom` stays on `21.1.7` to match. | Registry metadata for `jsdom@31.0.1`, `parse5@8.1.1` (`"type": "module"`), and `@exodus/bytes@1.16.0` (`"type": "module"`), 14 November 2026. [Vercel advanced Node.js configuration](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration) still says require of ES modules is disabled unless `NODE_OPTIONS` opts in. Do not set that flag. | Re-evaluate when jsdom’s production graph no longer `require()`s an ESM-only package, or when Vercel enables `require(esm)` without a project flag. |

`prisma` CLI’s npm `latest` dist-tag currently points at `8.0.0-rc.33`. That is a prerelease. Direct Prisma packages stay on the latest **stable** 7.x line that matches `@prisma/client` (`7.10.1`). That is policy compliance, not an exception.

`@types/node` tracks the Node 26 LTS contract (`^26.6.6`). npm `latest` for `@types/node` is `26.6.6`.

`pnpm@12.21.0` is published, but only on the `next-12` dist-tag. The stable `latest` tag is `12.18.0`. This repo pins `12.18.0`.

TypeScript is `7.0.2` (latest stable). `eslint-config-next` still loads `typescript-eslint` 8.x, which requires the TypeScript 5/6 compiler API (`ts.Extension`). TypeScript 7 no longer exports that API from `require("typescript")`, so this repo does not import `eslint-config-next`. ESLint 10 uses `@next/eslint-plugin-next` plus `@babel/eslint-parser` with TypeScript/JSX plugins until `typescript-eslint` supports TypeScript 7. Do not downgrade TypeScript to restore `eslint-config-next`.

# Cursor Cloud specific instructions

Cloud Agents develop against local PostgreSQL 18 only (`care_guide` for the app, `care_guide_e2e` for Playwright). Production Neon is forbidden. Never substitute production credentials, production URLs, or `DIRECT_URL` when Cloud credentials are absent.

`CLOUD_ADMIN_*`, `CLOUD_STAFF_*`, and `CLOUD_OPERATOR_*` are disposable Cloud-development accounts supplied by Cursor. `AUTH_SECRET` is a Cloud-only Runtime Secret. Do not hardcode, commit, or log their values. When those Cloud variables are unset, seed and browser auth fall back to `LOCAL_*` exactly as local development does. A partial Cloud pair is a setup error.

Test role-specific flows through the real UI login. Use the Admin, Staff, and Operator Cloud accounts for their own roles. Filesystem clinic-asset storage replaces R2. Contact mail and auth mail stay non-delivering and in memory. Published Turnstile test keys are the local verification path.

Do not deploy. Production deployment, production migration, and production service commands require explicit Joaquín approval. Schema changes may be developed and tested against Cloud PostgreSQL. They must never cause an automatic production migration. Run the normal verification commands before completion (`pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, and, when the change needs a browser, `pnpm build` then `pnpm test:e2e`).

In-VM routes are `http://localhost:3000`, `http://app.localhost:3000`, and `http://<slug>.localhost:3000`. The externally forwarded preview hostname does not satisfy River Aftercare tenancy. Do not weaken hostname routing to make that preview host work. Validate hostname-sensitive behaviour inside the VM.

Human-readable setup, lifecycle, and troubleshooting: [docs/development/CURSOR-CLOUD.md](docs/development/CURSOR-CLOUD.md).

## Cursor Cloud maintenance contract

Any repository change that alters development or runtime requirements must review the Cursor Cloud environment in the same change. Review is required for Node, pnpm, native dependencies, scripts, Prisma, PostgreSQL, `compose.yaml`, migrations and seeding, environment variables, authentication, hostname/tenancy routing, ports, Playwright, the E2E database, build/start commands, new local services, and external integrations used by development or tests.

When that change affects Cloud development, update the needed combination of `.cursor/environment.json`, `.cursor/Dockerfile`, `docs/development/CURSOR-CLOUD.md`, and `AGENTS.md` in the same branch. Do not defer the environment update. When one of those areas changes and no Cloud update is required, the final task report must state: `Cursor Cloud environment reviewed; no update required.`
