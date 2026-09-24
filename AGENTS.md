<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Database

Local development, Vitest database tests, and Playwright e2e target **PostgreSQL 18**. Docker Compose uses `postgres:18-alpine` with named volume `postgres18_data` mounted at `/var/lib/postgresql` (`PGDATA=/var/lib/postgresql/18/docker`). Do not mount a PostgreSQL 17 volume into PostgreSQL 18. Existing local PG17 volumes (`postgres_data`) must stay untouched until Joaquín restores via dump/restore. See [docs/development/POSTGRES-18-UPGRADE.md](docs/development/POSTGRES-18-UPGRADE.md).

Production target is Neon PostgreSQL 18 in AWS Asia Pacific 2 (Sydney). Do not connect to that project, run production migrations, or change Vercel `DATABASE_URL` unless Joaquín explicitly asks. Prisma stays on the stable 7.x line (`PrismaPg` + `pg`). Do not add a Neon-specific client.

# Care Guide product contract

Authoritative product requirements: `docs/product/PRD.md` (v1.0 — Aftercare SaaS).

Care Guide’s **product direction** is branded aftercare SaaS for healthcare practices. The commercial/product name is **River Aftercare**. The **current codebase** is staff auth, Phase 1A–1C aftercare, clinic portal / operator foundation through Phase 2A.5, and **Phase 2B SEO & Discovery**. Chairside / live-session functionality was removed as legacy. Dormant `ProcedureSession` models may remain in Prisma; aftercare must not depend on them. Do not claim later-phase MVP features (QR, analytics, Privacy/Terms, production infra) are implemented until they exist.

# Dependency and runtime baseline

Prefer the **latest stable, mutually compatible** version of every direct production and development dependency. Do not stay on an older direct version merely because it currently works.

Do not use alpha, beta, rc, canary, experimental, or preview packages unless there is no suitable stable package for the required capability **and** the exception is listed below. Do not treat a prerelease dist-tag as “latest”.

Verify versions from registry metadata (`pnpm outdated`, `pnpm view`) rather than assuming freshness. “Latest stable” still means the newest versions that keep this repository’s peer-dependency graph working.

Production runtime: latest actively supported **Node.js LTS** (currently 24.x). Do not use Node Current solely because the version number is higher.

Package manager: latest stable pnpm, pinned via `packageManager`.

## Current exceptions

| Package     | Current         | Latest stable                 | Why latest cannot be used                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                | Planned resolution                                                                                                                                 |
| ----------- | --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next-auth` | `5.0.0-beta.32` | `4.24.15` (`latest` dist-tag) | The app already uses Auth.js v5 (Prisma adapter, `auth.ts`). npm `latest` is v4, a different major line.                                                                                                                                                                                                                          | `pnpm view next-auth dist-tags` — `latest` is v4; v5 is only on `beta`. Moving to v4 is a significant auth-stack migration.                                                             | Stay on the v5 beta line until Auth.js publishes a stable v5, then upgrade.                                                                        |
| `jsdom`     | `26.1.0`        | `30.1.0`                      | jsdom 27+ `require()`s ESM-only `html-encoding-sniffer@6` → `@exodus/bytes`. Vercel’s Node runtime disables `require(esm)`, so SVG sanitisation (and any module that loads jsdom) throws `ERR_REQUIRE_ESM`. 26.1.0 is the last CJS-safe line (`html-encoding-sniffer@4` + `parse5@7`). `@types/jsdom` stays on `21.1.7` to match. | [html-encoding-sniffer#25](https://github.com/jsdom/html-encoding-sniffer/issues/25); Vercel/Lambda disable `require(esm)` even on Node 24. Do not “fix” this by changing Vercel flags. | Re-evaluate when jsdom’s production CJS graph no longer requires ESM-only packages, or when Vercel loads those packages without `ERR_REQUIRE_ESM`. |

`prisma` CLI’s npm `latest` dist-tag currently points at `8.0.0-rc.*`. That is a prerelease. Direct Prisma packages stay on the latest **stable** 7.x line that matches `@prisma/client` (`7.10.0`). That is policy compliance, not an exception.

`@types/node` tracks the Node 24 LTS contract (`^24`), not `@types/node@latest` (Node Current 26).

TypeScript is `7.0.2` (latest stable). `eslint-config-next` still loads `typescript-eslint` 8.x, which requires the TypeScript 5/6 compiler API (`ts.Extension`). TypeScript 7 no longer exports that API from `require("typescript")`, so this repo does not import `eslint-config-next`. ESLint 10 uses `@next/eslint-plugin-next` plus `@babel/eslint-parser` with TypeScript/JSX plugins until `typescript-eslint` supports TypeScript 7. Do not downgrade TypeScript to restore `eslint-config-next`.
