# River Aftercare

The GitHub repository and npm package are **river-aftercare**. The current commercial/product name is **River Aftercare**. `CARE_GUIDE_*` environment prefixes remain technical.

## Product direction

**River Aftercare** is a **B2B SaaS platform** that lets healthcare practices give patients **clear, branded, mobile-first post-treatment aftercare guides** through **permanent web URLs and QR codes**.

- The **practice** is the customer.
- The **patient** is the end user of the aftercare experience.
- Care Guide operates the platform, curated guide library, publishing, and admin tools.

The first vertical is **Dental**. The intended patient URL shape is:

```text
<tenant>.<platform-domain>/<guide>
```

for example `pacificdental.<platform-domain>/extraction`. The commercial platform domain is **not selected**; do not treat any domain in this repo as final.

Authoritative product contract:

- [docs/product/PRD.md](docs/product/PRD.md) — Care Guide PRD v1.0 — Aftercare SaaS
- [docs/product/POST-LAUNCH-ROADMAP.md](docs/product/POST-LAUNCH-ROADMAP.md) — post-launch Check-ins, RecoveryPlan, verticals
- [docs/adr/](docs/adr/README.md) — architecture decisions
- [docs/README.md](docs/README.md) — documentation index

## Current implementation

**The aftercare SaaS described above is not a complete commercial product yet.**

Phase 1A added the **data/domain foundation**. Phase 1B added **tenant hostname routing** (`proxy.ts` rewrite to `/_sites/<slug>/…`). Phase 1B.5 added the **patient styling/performance foundation** (CSS Modules, server CSS variables, Tailwind isolated to staff). **Phase 1C** added the first public patient aftercare homepage and guide UI. **Phase 1D was absorbed into 1C** (composition, overrides, additions, and semantic guide rendering already shipped there). **Phase 1E** added Playwright browser acceptance, axe checks, and performance gates. **Phase 1F** added the public marketing homepage, patient UX/UI uplift, and a controlled branding-token foundation (including light/dark and radius presets). **Phase 1F.1** refined the River Aftercare marketing identity, tenant presentation settings (terminology, theme policy, optional patient theme toggle), and premium visual language. **Phase 1F.2** added marketing section surfaces and footer, a compact theme popover, a data-driven recovery timeline, and explicit local login env accounts. **Phase 1G** added a day-aware patient demo on `demodental` (Today / Timeline / printable recovery guide). **Phase 1G.1** removed Check-in from launch UI, slowed marketing reveal slightly, and made Print / Save PDF a dedicated resolved-guide document. Check-in is post-launch premium/add-on work. **Marketing completion** added platform `/pricing` and `/contact` on the root host only. Future RecoveryPlan is not `ProcedureSession` ([ADR 0015](docs/adr/0015-recovery-plan-is-not-procedure-session.md)).

Chairside / live-session functionality (rooms, doctors, live stages, `/display/[token]`, and Supabase Realtime) was **removed as legacy** in PR #96. The legacy chairside Prisma schema was subsequently removed. It is not part of River Aftercare. **Aftercare must not depend on `ProcedureSession`.** Auth.js `Session` records are unrelated.

|                   |                                                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product direction | Branded aftercare infrastructure (PRD v1.0)                                                                                                                                                                                                                                                                |
| Current code      | Staff auth + Phase 1A–1G.1 aftercare (domain, hostname routing, public patient pages, marketing homepage, Today/Timeline demo on `demodental`, platform `/pricing` + `/contact`, browser/performance acceptance). Chairside live sessions removed. No persisted RecoveryPlan, no Check-in, no patient PII. |
| Aftercare MVP     | Planned (Phases 1–3 in the PRD). Phase 1 technical slice is implemented; commercial MVP is later.                                                                                                                                                                                                          |

Examples of **intended** product behaviour that do **not** exist in code yet:

- QR codes for durable aftercare URLs
- basic anonymous aftercare analytics
- approved Privacy / Terms pages (published drafts exist; counsel approval flags remain false)
- automatic production schema migration (migrations stay manual; see [docs/launch/PRODUCTION-MIGRATION.md](docs/launch/PRODUCTION-MIGRATION.md))

Phase 1A did add the aftercare **domain model** (canonical template + pinned revision + practice override/addition) and demo seed. That is not the public product.

Pacific Dental is a **conceptual routing example only**. Seeded demo data uses the fictional **Rivers Care Demo Clinic** (`demodental` / Riverside Dental Demo). Do not reproduce a real practice’s brand assets unless explicitly approved.

---

## Getting started

This is a [Next.js](https://nextjs.org) App Router project.

```bash
pnpm dev
```

Staff:

- [http://app.localhost:3000](http://app.localhost:3000)
- [http://app.localhost:3000/login](http://app.localhost:3000/login)

Public marketing:

- [http://localhost:3000](http://localhost:3000)
- [http://localhost:3000/pricing](http://localhost:3000/pricing)
- [http://localhost:3000/contact](http://localhost:3000/contact)
- [http://localhost:3000/about](http://localhost:3000/about)

Tenant hostname simulation (`*.localhost`, no `/etc/hosts` changes):

- [http://demodental.localhost:3000](http://demodental.localhost:3000) — known demo tenant
- [http://demodental.localhost:3000/extraction](http://demodental.localhost:3000/extraction) — rewritten tenant guide path
- [http://unknown.localhost:3000](http://unknown.localhost:3000) — unknown tenant (generic not-found)

Set `CARE_GUIDE_ROOT_DOMAIN=localhost` in `.env`. Tenant hosts render the public patient experience (practice-branded aftercare home and published guides). The staff app stays on `app.localhost`.

Staff URL:

```text
http://app.localhost:3000/login
```

Local login credentials come from `LOCAL_<ROLE>_EMAIL` and `LOCAL_<ROLE>_PASSWORD` in `.env` or `.env.local`. `.env.example` shows the local-only defaults for the two current membership roles (`ADMIN` and `STAFF`). Those values are refused by the seed in production. Do not use them outside local development.

`/contact` is a clinic enquiry form. Delivery uses server-only `CONTACT_EMAIL_TO` / `CONTACT_EMAIL_FROM` plus Resend, with Cloudflare Turnstile verified on the server. `.env.example` uses fake local values and Cloudflare dummy Turnstile keys. If delivery is not configured, the form does not pretend the enquiry was sent. Production mailbox: `contact@riveraftercare.com.au`. See [docs/architecture/MARKETING-CONTACT.md](docs/architecture/MARKETING-CONTACT.md).

You can start editing `app/(marketing)/%5Fmarketing/page.tsx` or `app/(staff)/page.tsx`; the page auto-updates as you edit.

Staff surfaces use Tailwind. Patient tenant routes use CSS Modules and server-rendered CSS custom properties — see [docs/architecture/PERFORMANCE.md](docs/architecture/PERFORMANCE.md).

## Tests

```bash
pnpm test          # Vitest (unit, loaders, routing, server render)
pnpm test:e2e      # Playwright against production `next start` on port 4173
pnpm test:all      # Vitest then Playwright
```

Browser tests use a **dedicated PostgreSQL 18 database** (`care_guide_e2e` by default), not `DATABASE_URL`. Playwright creates that database if needed, runs `prisma migrate deploy` + `prisma db seed` against it, and starts `next start` with `DATABASE_URL` pointed at the e2e database. `CI=1 pnpm test:e2e` therefore must not add guides to the normal local development dataset. Playwright refuses to start unless the server major is 18.

Optional override:

```bash
E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/care_guide_e2e?schema=public"
```

Do not set `E2E_DATABASE_URL` to the same database as `DATABASE_URL`. Playwright refuses to start if they match.

If a previous Playwright run left fixture guides in the development database, list them with `node scripts/list-e2e-guide-artifacts.mjs`. Destructive cleanup is opt-in: `node scripts/cleanup-e2e-guide-artifacts.mjs --yes`.

Browser tests also expect a seeded **development** database only for `pnpm dev` (`pnpm db:seed`), `CARE_GUIDE_ROOT_DOMAIN=localhost`, and RFC 6761 `*.localhost` resolution (no `/etc/hosts`). Install Chromium once with `pnpm exec playwright install chromium`. Playwright and axe are development-only.

## Database workflow

This project uses **PostgreSQL 18** with Prisma 7 (`PrismaPg` + `pg`) for application data.

Issue #2 replaced the temporary Prisma bootstrap model with the first real clinic-scoped staff schema:

- `Clinic`
- `User`
- `ClinicMembership`
- `Account`
- `Session`
- `VerificationToken`

The Auth.js adapter models use the canonical Prisma names for adapter compatibility. The removed chairside workflow used the explicit name `ProcedureSession` rather than a generic `Session` name. That schema was subsequently removed. **New aftercare models must not reuse `ProcedureTemplate` / `ProcedureSession` for the aftercare domain** (see the PRD glossary).

### Local PostgreSQL 18

If you have Docker available, start the local database with:

```bash
docker compose up -d
```

That starts `postgres:18-alpine` on **localhost:5432**, database `care_guide`, named volume `postgres18_data` mounted at `/var/lib/postgresql` (`PGDATA=/var/lib/postgresql/18/docker`). Stop it with:

```bash
docker compose down
```

Do **not** add `-v`. That would delete the PostgreSQL 18 volume. The previous PostgreSQL 17 volume (`postgres_data`) is intentionally unused so Compose never mounts it into 18. If you already have local PG17 data, follow [docs/development/POSTGRES-18-UPGRADE.md](docs/development/POSTGRES-18-UPGRADE.md) (dump → restore into the new volume). Production minor/patch versions are controlled by Neon; local Docker uses the `postgres:18-alpine` major tag.

The expected local connection string for this repo is:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/care_guide?schema=public"
```

Prisma CLI (`migrate` / `seed` / `studio`) uses optional `DIRECT_URL` when set, otherwise `DATABASE_URL`. Local Docker does not need a second URL. Production Neon uses a **pooled** `DATABASE_URL` for the app and an **unpooled** `DIRECT_URL` for trusted-machine migrations. Production helpers (`pnpm prod:db:status`, `pnpm prod:db:migrate --apply`, `pnpm prod:db:verify`) load only gitignored `.env.neon-production` and will not fall back to local `.env`. Vercel automatic Production deploys from `main` stay enabled and do **not** run `migrate deploy`. Schema-touching releases are expected to fail the Production schema gate until the same SHA is redeployed after `prod:db:*` — [docs/launch/PRODUCTION-MIGRATION.md](docs/launch/PRODUCTION-MIGRATION.md).

The app runtime also expects:

```bash
AUTH_SECRET="replace-with-a-long-random-string"
```

1. Copy `.env.example` to `.env`. Next.js loads `.env` for the app runtime, and Prisma CLI commands load it through `prisma.config.ts`.
2. Start Postgres with `docker compose up -d`.
3. Prisma CLI commands read the connection string from `prisma.config.ts`, which loads `.env` via `dotenv`.
4. Generate the Prisma client with `pnpm db:generate`.
5. Validate or format the schema with `pnpm db:validate` and `pnpm db:format`.
6. Create local migrations with `pnpm db:migrate:dev` once the database is healthy.
7. Open Prisma Studio with `pnpm db:studio`.
8. Seed the demo clinic and staff accounts with `pnpm db:seed`.

If `AUTH_SECRET` is missing, the app fails fast with a clear startup error instead of surfacing repeated Auth.js `MissingSecret` errors later during requests.

Optional production error monitoring uses Sentry (`NEXT_PUBLIC_SENTRY_DSN`). The application builds and runs without it. `SENTRY_AUTH_TOKEN` is a build-only secret for source-map upload and must never be `NEXT_PUBLIC_`. See [docs/launch/PRODUCTION-READINESS.md](docs/launch/PRODUCTION-READINESS.md).

### Seeded demo accounts

The seed creates one fictional clinic plus clinic-scoped staff users when local env vars are present:

- Clinic: `Rivers Care Demo Clinic` (`clinic_demo_rivers`)
- Tenant slug: `demodental`
- Patient-facing profile: `Riverside Dental Demo`
- Admin: `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD`
- Staff: `LOCAL_STAFF_EMAIL` / `LOCAL_STAFF_PASSWORD`

Copy the `LOCAL_*` examples from `.env.example`. They are fake local-only values and are not created if `NODE_ENV=production`.

The seed also creates one **sample / non-clinical** aftercare **Tooth Extraction** template plus a demo clinic guide. Aftercare demo copy is labelled non-clinical. That template is visible only to the `demodental` tenant. It does not seed chairside rooms, doctors, or procedure templates.

`pnpm db:seed` is **not** safe for production: it upserts the demo clinic, users (when allowed), and a published practice guide. Production migrate helpers never invoke it.

To create **only** the sample Tooth Extraction canonical library rows (1 `GuideTemplate`, 1 published unreviewed revision, 8 sections) against a database:

```bash
pnpm bootstrap:demo-template            # dry-run (default)
pnpm bootstrap:demo-template -- --apply # writes
```

The command prefers `DIRECT_URL` when set. It does not run `prisma/seed.mjs`. It is not part of build, migrate, or deploy.

## Current staff auth (implemented)

Clinic access is membership-derived (`ClinicMembership`), not a single clinic field on `User`. Auth.js uses the canonical `Account`, `Session`, and `VerificationToken` Prisma models. For the current staff helpers, one effective clinic membership per signed-in user is assumed; multiple memberships fail explicitly instead of silently choosing one.

### Auth server wiring

- `auth.ts` as the root Auth.js configuration
- `@auth/prisma-adapter` against the canonical Prisma models
- database-backed sessions
- a minimal internal credentials sign-in handler for seeded staff accounts
- reusable server helpers for the current signed-in user and clinic membership context

The MVP auth flow uses custom `/api/auth/login` and `/api/auth/logout` endpoints layered on top of Auth.js database sessions and shared server-side auth helpers. Login accepts existing non-empty passwords up to 256 characters and emails up to 254 characters. New passwords set through Change Password or Reset Password must be 12–256 characters. See [docs/architecture/AUTH.md](docs/architecture/AUTH.md).

Example login request (use the `LOCAL_ADMIN_*` values from your env file):

```bash
curl -X POST http://app.localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<LOCAL_ADMIN_EMAIL>","password":"<LOCAL_ADMIN_PASSWORD>"}'
```

Related routes:

- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/accept-invitation`
- `GET /api/auth/me` or `/api/auth/session`
- `POST /api/auth/logout`
- `/login` — email/password form; successful sign-in redirects to `/dashboard` or `/operator/clinics`
- `/forgot-password` — request a reset email (generic response)
- `/reset-password` — set a new password from a one-time emailed fragment token
- `/accept-invitation` — invited clinic users set their own password from a one-time fragment token
- `/account/security` — authenticated change password for operator, clinic admin, and clinic staff
- `/operator/clinics/[clinicId]/team` — operator-managed clinic invitations (platform operator only)
- `app/(staff)/(clinic-portal)/layout.tsx` — River Aftercare clinic portal shell via `lib/auth/require-staff-session.ts`
- `/dashboard` — clinic Overview
- `/guides` — clinic Guides

Signed-out visits to `/dashboard` and `/guides` redirect to `/login`. Signed-in visits to `/login` redirect to `/dashboard`. Only users with one effective clinic membership can establish a valid staff session for that shell. Retired chairside URLs (`/dashboard/procedures`, `/sessions/new`, `/session/[id]/control`, `/display/[token]`) are not application routes and return 404.

## Learn more

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) — Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) — interactive tutorial

You can check out the [Next.js GitHub repository](https://github.com/vercel/next.js).

Hosting for the aftercare product in the PRD was left open. Production currently runs on Vercel; that is an operations fact, not a PRD rewrite. Schema releases follow [docs/launch/PRODUCTION-MIGRATION.md](docs/launch/PRODUCTION-MIGRATION.md).

## Deploy on Vercel

Production hosting is Vercel. Automatic Production deployments from `main` remain **enabled**. Git merge to `main` starts a Production **application** build. It does not apply Prisma migrations and must not run `db push` or seed. Manual Promote is not the canonical workflow.

App-only merges: the Production schema gate confirms no pending migrations and the automatic deploy completes.

Schema-changing merges:

1. `pnpm release:check`
2. Review SQL
3. Merge to `main` (the Production schema gate is expected to fail while migrations are pending; current Production stays live)
4. `pnpm prod:db:status`
5. `pnpm prod:db:migrate --apply`
6. `pnpm prod:db:verify`
7. Redeploy the **same** merged SHA in Vercel

See [docs/launch/PRODUCTION-MIGRATION.md](docs/launch/PRODUCTION-MIGRATION.md). The Next.js template pointer below is not a Care Guide infrastructure decision.

The easiest way to deploy a Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
