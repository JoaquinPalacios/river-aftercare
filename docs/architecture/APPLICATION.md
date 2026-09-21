# Application architecture — River Aftercare MVP

The launch backend and application remain a **Next.js App Router monolith**.

Do **not** introduce NestJS, `apps/api`, a REST façade, or a second authenticated API service before a concrete extraction trigger exists.

## What stays in Next.js

| Layer                             | Role                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| App Router routes                 | Hosts, layouts, Server Components, metadata. Launch indexing policy: [SEO.md](SEO.md).      |
| Server Actions / server functions | Authorize, validate input, call a domain module, map the result                             |
| Prisma 7 + PostgreSQL 18          | Persistence. Local Docker and tests use major 18. Production target is Neon PG18 (Sydney).  |
| Domain modules                    | Guides, publication, practice configuration, authorization, operator queries, asset storage |

Patient tenant rendering, clinic portal, and operator console share this process. That avoids a second deployment, session propagation across a network boundary, DTO duplication, CORS, and extra monitoring for a workload that does not need it yet.

## Domain modules today

Business rules should not live only inside React components. Current server modules include:

| Concern                      | Module area                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guide lifecycle              | `lib/clinic-portal/*-practice-guide.ts`                                                                                                                                   |
| Canonical sample/review      | `lib/aftercare/guide-template-review.ts`, `GuideTemplate.isSample`                                                                                                        |
| Practice attestation         | `lib/clinic-portal/practice-review-attestation.ts`, `publishPracticeGuide`                                                                                                |
| Patient aftercare disclaimer | `lib/aftercare/patient-aftercare-disclaimer.ts`, `PatientAftercareDisclaimer` — platform copy on real-clinic published guides/print/preview; not demo; not MedicalWebPage |
| Practice configuration       | `lib/clinic-portal/update-practice-settings.ts`                                                                                                                           |
| Authorization                | `lib/auth/require-*.ts`, `lib/clinic-assets/authorize-clinic-logo.ts`                                                                                                     |
| Staff login                  | `lib/auth/password.ts`, `lib/auth/login-input.ts`, [AUTH.md](AUTH.md)                                                                                                     |
| Password management          | `lib/auth/password-policy.ts`, `lib/auth/change-password.ts`, `lib/auth/request-password-reset.ts`, `lib/auth/reset-password.ts`                                          |
| Invitations                  | `lib/operator/invite-clinic-user.ts`, `lib/auth/accept-invitation.ts`, `lib/auth/account-token-service.ts`, `lib/operator/change-clinic-membership-role.ts`               |
| Account tokens               | `lib/auth/account-token.ts`, `lib/auth/account-token-service.ts`                                                                                                          |
| Transactional email          | `lib/email/transactional-mailer.ts`, `lib/email/auth-email.ts`, [TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md)                                                          |
| Error tracking               | `lib/observability/*`, `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`                                                                       |
| Billing projection           | `lib/billing/*`, `POST /api/stripe/webhook` — test-mode Stripe event ingestion and local entitlement projection. No Checkout, Portal, or enforcement.                    |
| Operator clinic queries      | `lib/operator/list-operator-clinics.ts`                                                                                                                                   |
| Platform SEO                 | `lib/seo/*`                                                                                                                                                               |
| Logo storage boundary        | `lib/clinic-assets/*`                                                                                                                                                     |
| Platform SEO assets          | `lib/platform-assets/*`                                                                                                                                                   |

Route handlers and Server Actions should generally: authorize → validate → call the module → map the result.

Staff login is a Route Handler (`POST /api/auth/login`), not a Server Action. Forgot/reset password, invitation acceptance, and invitation status are Route Handlers. Change password and operator Team mutations are Server Actions. Current production login bounds, dummy password verification, host restriction, and WAF-only login rate limiting are documented in [AUTH.md](AUTH.md).

## Extraction triggers

Evaluate a separate API service (NestJS or otherwise) only when one of these is real:

- a public API for third parties
- a native / mobile app that cannot use this App Router
- substantial third-party integrations that need their own contract
- substantial async workloads that do not fit Server Actions
- independent backend scaling or a dedicated backend team
- external agents publishing or reading structured guides (MCP / public agent APIs)

Until then, keep extracting **modules**, not processes. Do not add MCP, GraphQL, or a public API solely to look agentic.

## Schema releases

Vercel automatic Production deployments from `main` stay **enabled**. Vercel deploys application code. It does **not** apply Prisma migrations. On Production builds the schema gate runs `prisma migrate status` (through runtime `DATABASE_URL`) and fails if migrations are pending; that is intentional. Human-approved schema apply uses unpooled `DIRECT_URL` from a local `.env.neon-production` file (`pnpm prod:db:status` / `pnpm prod:db:migrate --apply` / `pnpm prod:db:verify`), then the **same SHA** is redeployed. Do not add `DIRECT_URL` to Vercel for ordinary runtime. See [../launch/PRODUCTION-MIGRATION.md](../launch/PRODUCTION-MIGRATION.md) and [ADR 0025](../adr/0025-migrate-before-promote.md).

## Errors, 404s, and health

Host-aware fallbacks live next to each root layout: `error.tsx`, `not-found.tsx`, and `global-error.tsx` under `(marketing)`, `(staff)`, and `(aftercare)`. Copy is generic. Pages do not render Prisma/Neon/Vercel detail or error digests. Fallback components must not call `getPrisma`, clinic profile, R2, or membership lookup. Multiple root layouts do not apply a group `not-found.tsx` to unmatched URLs, so marketing uses `_marketing/[...slug]`, staff uses `[...slug]`, and nested tenant paths use `[guideSlug]/[...rest]` — each catch-all only calls `notFound()`.

`GET` / `HEAD` `/api/health` is staff-host only (`isStaffAppHost`). Healthy: HTTP 200 `{ "status": "ok" }`. Unhealthy: HTTP 503 `{ "status": "unavailable" }` plus a `health_database_unavailable` log event without connection text. The probe is `SELECT 1` through `getPrisma()` (pooled `DATABASE_URL`). It is not a schema-drift check. Failed probes are **not** sent to Sentry — Uptime already watches this URL.

## Observability

Uptime and application exception tracking are separate products. Neither is a substitute for the other.

**Uptime (external HTTP monitors, configured in Better Stack, not in this repo):** marketing `/`, staff `/login`, the demo patient guide, and staff-host `/api/health`. Intervals and URLs: [../launch/PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md).

**Error tracking (Sentry, in-app):** `@sentry/nextjs` reports unexpected exceptions to Sentry. Server initialization is Node `instrumentation.ts` + `sentry.server.config.ts`. `onRequestError` captures unhandled Server Component, Route Handler, and Server Action failures where Next.js reports them. Browser initialization is `instrumentation-client.ts`. React `error.tsx` / `global-error` call `ClientErrorReporter` without showing event IDs. There is **no** Session Replay, **no** Better Stack JavaScript tag, **no** RUM beyond existing Vercel Analytics / Speed Insights, and **no** tracing/profiling/Prisma query instrumentation.

Enablement: `VERCEL_ENV` (or `NEXT_PUBLIC_VERCEL_ENV` in the browser) of `production` or `preview` **and** a valid DSN (`NEXT_PUBLIC_SENTRY_DSN`, with optional server `SENTRY_DSN`). Production reports as `production`; preview as `preview`. Development, test, and local stay off even if a DSN is present. The DSN is browser-visible configuration, not a secret. `SENTRY_AUTH_TOKEN` is a secret and is used only for optional source-map upload. Builds succeed when all Sentry variables are absent. The trusted-machine CLI `pnpm observability:test-error` is a separate operator path: it may load the DSN from ignored `.env`, initializes Sentry only for that process, and labels the synthetic event `environment=verification`. It does not turn on application telemetry.

Payload policy: `sendDefaultPii: false`, `includeServerName: false`, `tracesSampleRate: 0`, `replaysSessionSampleRate: 0`, `maxBreadcrumbs: 0`, no local variables, no attachments, no module inventory. Default integrations that collect console, request data, machine context, replay, or database/performance traces are filtered out. `beforeSend` strips `user`, `server_name`, `modules`, breadcrumbs, extra, request headers/cookies/query/body, and device/OS/culture/app-memory contexts. **All URL fragments are stripped** (including `/reset-password#token=` and `/accept-invitation#token=`). Controlled tags are `component`, `failure_code`, and `environment`. Exception type, redacted message, stack filenames, and line/column numbers are kept. River Aftercare does not attach staff email/name or patient identity.

Handled infrastructure failures that never reach `onRequestError` are reported through `reportOperationalFailure` / `reportAuthEmailFailure` / `reportContactEmailFailure` in `lib/observability/report-server-exception.ts`. Business code imports that wrapper, not Sentry. Current codes: `contact_email_delivery_failed`, `auth_email_delivery_failed`, `auth_email_not_configured`. Metadata is limited to `component`, `failure_code`, and `environment`. Recipient, subject, body, token, and provider detail are not sent. Expected 400/401/403/404/409, Turnstile/honeypot rejection, invalid/expired/consumed tokens, and ordinary authorization denial are not reported.

Sentry outage, a missing DSN, or source-map upload failure must not fail a user request or `pnpm build`. Alerting is not active until Joaquín configures the Sentry project and Vercel env. Published Privacy/Terms do not yet name Sentry; update subprocessors when enabling.

See [../launch/PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md).
