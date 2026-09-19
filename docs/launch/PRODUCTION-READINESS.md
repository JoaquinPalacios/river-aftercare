# Production-readiness gate — River Aftercare

Living launch checklist based on **current repository truth** (Phase 2B). Classifications:

- **READY** — implemented locally and documented
- **REQUIRED BEFORE PRODUCTION** — must be true before a public production hostname serves clinics or patients
- **RECOMMENDED BEFORE FIRST PAYING CLINIC** — can wait for a design partner on staging, not for paid production use
- **POST-LAUNCH** — roadmap after first clinics

Do not provision Vercel, Cloudflare, R2, domains, or email from this document. Do not connect to the Neon project, run production migrations, or change Vercel `DATABASE_URL` from a documentation pass.

## Product

| Item                                   | Status                                 | Notes                                                                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand assets (logo, isologo, favicon)  | READY                                  | Final approved pack on main. Operator upload exists for a dedicated 1200×630 OG image; the image still needs to be uploaded.                                                                                                                          |
| Patient UX                             | READY                                  | Tenant home + published guides, CSS Modules, no patient Tailwind.                                                                                                                                                                                     |
| Clinic portal                          | READY                                  | Overview / Guides / Practice, draft-preview-publish-unpublish-delete.                                                                                                                                                                                 |
| Operator                               | READY                                  | All Clinics + SEO & Discovery. No Templates library UI.                                                                                                                                                                                               |
| Guide lifecycle                        | READY                                  | Draft / published / unpublished; public pin protected.                                                                                                                                                                                                |
| Canonical dental templates             | REQUIRED BEFORE PRODUCTION             | Tooth Extraction exists as a **sample / non-clinical** demo-only library row for `demodental`. It is not generally available and is not clinical approval. Production insert: `pnpm bootstrap:demo-template`. **Never** `pnpm db:seed` in production. |
| Clinical governance / review ownership | REQUIRED BEFORE PRODUCTION             | Policy exists: normal clinics only see templates with `reviewedAt` + named `reviewedBy`. No signed clinical review of production copy.                                                                                                                |
| QR / share                             | RECOMMENDED BEFORE FIRST PAYING CLINIC | Durable URLs exist. Copy-URL UI, QR generation, and QR download/print are **not** implemented.                                                                                                                                                        |
| Check-ins / RecoveryPlan               | POST-LAUNCH                            | Explicitly out of this phase.                                                                                                                                                                                                                         |

## Discovery

| Item               | Status                                 | Notes                                                                                                   |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Marketing SEO      | READY                                  | DB-backed settings with code fallbacks.                                                                 |
| JSON-LD            | READY                                  | Organization / WebSite / SoftwareApplication without Offer; ContactPage; AboutPage.                     |
| Sitemap / robots   | READY                                  | Marketing only; staff/operator/tenant noindex preserved.                                                |
| llms.txt           | READY                                  | `/llms.txt`. `llms-full.txt` skipped (corpus too small).                                                |
| Agentic readiness  | READY                                  | Architecture audit in [AGENTIC-READINESS.md](AGENTIC-READINESS.md). No numeric Is Agentic score.        |
| Privacy / Terms    | REQUIRED BEFORE PRODUCTION             | Substantial drafts published at `/privacy` and `/terms`. **Legal review still required.** Not approved. |
| About              | READY                                  | Factual public page.                                                                                    |
| Dedicated OG image | RECOMMENDED BEFORE FIRST PAYING CLINIC | Operator upload/replace/remove is implemented. A 1200×630 PNG/JPEG/WebP still needs to be uploaded.     |

## Infra

| Item                         | Status                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Final domain                 | REQUIRED BEFORE PRODUCTION | Not selected.                                                                                                                                                                                                                                                                                                                                                                                                |
| Vercel (Next.js)             | REQUIRED BEFORE PRODUCTION | Desired host. Not provisioned in this phase.                                                                                                                                                                                                                                                                                                                                                                 |
| Neon Sydney PostgreSQL       | REQUIRED BEFORE PRODUCTION | **Project exists:** River Aftercare Production, branch `production`, region AWS Asia Pacific 2 (Sydney), PostgreSQL **18**. **Not wired:** production schema has not been migrated, Vercel `DATABASE_URL` is not configured, production data has not been seeded. Do not treat the empty project as production-ready.                                                                                        |
| Cloudflare authoritative DNS | REQUIRED BEFORE PRODUCTION | Candidate. Not provisioned.                                                                                                                                                                                                                                                                                                                                                                                  |
| R2 object storage            | REQUIRED BEFORE PRODUCTION | Application adapter and private Vercel delivery route are implemented (`CLINIC_ASSET_STORAGE_DRIVER=r2`, `assets.` host → authenticated `GetObject`). Bucket stays private; no r2.dev; no R2 custom domain. Joaquín still must set bucket-scoped credentials and `CLINIC_ASSET_PUBLIC_ORIGIN` ([ADR 0022](../adr/0022-cloudflare-r2-is-clinic-asset-provider.md), [R2-PROVISIONING.md](R2-PROVISIONING.md)). |
| Wildcard TLS staging proof   | REQUIRED BEFORE PRODUCTION | **Launch gate.** Cloudflare authoritative DNS + `_acme-challenge` delegation to Vercel must be proven on a **staging/test domain** before production domain cutover. This is not done.                                                                                                                                                                                                                       |
| Production migrations        | REQUIRED BEFORE PRODUCTION | Local chain is PostgreSQL 18 compatible (`prisma migrate deploy` from empty). **Not applied on Neon.** Additive `AccountToken` migration exists in the repo and must not be applied to production from this PR.                                                                                                                                                                                              |

## Email

| Item               | Status | Notes                                                                                                                                                                                                                                                                  |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public mailbox     | READY  | Production mailbox is `contact@riveraftercare.com.au` (Hostinger, forwarded to operator Gmail). Application never talks to Hostinger SMTP or Gmail.                                                                                                                    |
| Resend             | READY  | Marketing Contact sends via the shared Resend transport using `RESEND_API_KEY`, `CONTACT_EMAIL_FROM`, and `CONTACT_EMAIL_TO`. SMTP/nodemailer path removed. Auth-lifecycle From (`AUTH_EMAIL_FROM`) is configured in code but **not sent** until invitation/reset PRs. |
| SPF / DKIM / DMARC | READY  | Configured for the sending domain `mail.riveraftercare.com.au` (operator infrastructure; not modified by this app change).                                                                                                                                             |
| Inbound routing    | READY  | Hostinger mailbox + Gmail forwarding is the operator workflow.                                                                                                                                                                                                         |

## Security

| Item                   | Status                                 | Notes                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turnstile              | PARTIAL                                | Marketing `/contact` has a Managed widget plus mandatory server-side Siteverify. Production fails closed without `TURNSTILE_SECRET_KEY`. Login Turnstile is **not** implemented and was not added by login hardening.                                                                                                                                |
| Login rate limit       | WAF IN PRODUCTION                      | Durable limiter remains Vercel WAF `login-post-rate-limit` (15 POST / 10 minutes / IP on `app.riveraftercare.com.au/api/auth/login`). No application limiter. Application now bounds email ≤254 and password ≤256, rejects oversized passwords before scrypt, and dummy-verifies unknown/null-hash attempts. See [AUTH.md](../architecture/AUTH.md). |
| Contact rate limit     | OBSERVE                                | Vercel WAF `contact-post-observe` currently logs `POST /contact`. Application relies on Turnstile + honeypot. In-memory Map throttle removed (not durable on Vercel).                                                                                                                                                                                |
| Security headers / CSP | RECOMMENDED BEFORE FIRST PAYING CLINIC | Review at deploy.                                                                                                                                                                                                                                                                                                                                    |
| Secrets review         | REQUIRED BEFORE PRODUCTION             | No production secrets in repo.                                                                                                                                                                                                                                                                                                                       |
| Auth.js v5 beta        | REQUIRED BEFORE PRODUCTION             | Documented exception. Decision: treat as an **acceptable documented exception for first launch** unless a separate auth migration is approved. Do not silently switch to Better Auth.                                                                                                                                                                |

## Data

| Item           | Status                                 | Notes                                                                                                     |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Backups        | REQUIRED BEFORE PRODUCTION             | Neon project exists in Sydney. Confirm PITR/backups on that project before serving production traffic.    |
| Restore drill  | RECOMMENDED BEFORE FIRST PAYING CLINIC | Prove restore once production data exists. Local dump/restore is documented for development PG18.         |
| DB region      | REQUIRED BEFORE PRODUCTION             | Neon AWS Asia Pacific 2 (Sydney). Project created; application not connected.                             |
| No patient PII | READY                                  | Aftercare MVP still has no patient identity ([ADR 0007](../adr/0007-no-patient-pii-required-for-mvp.md)). |

## Content

| Item                      | Status                     | Notes                                                                                                                                                    |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed dental templates | REQUIRED BEFORE PRODUCTION | No generally available reviewed templates. Sample Tooth Extraction is `demodental`-only. Wisdom Teeth / Implant / Root Canal are **not** in the library. |
| Clinical review ownership | REQUIRED BEFORE PRODUCTION | Named reviewer/process missing.                                                                                                                          |

## Legal

| Item                       | Status                     | Notes                                                                          |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| Privacy                    | REQUIRED BEFORE PRODUCTION | Substantial draft implemented — LEGAL REVIEW STILL REQUIRED. **Not approved.** |
| Terms                      | REQUIRED BEFORE PRODUCTION | Substantial draft implemented — LEGAL REVIEW STILL REQUIRED. **Not approved.** |
| Medical/content disclaimer | REQUIRED BEFORE PRODUCTION | Part of legal pack.                                                            |

## Operations

| Item             | Status                                 | Notes                                                                                                  |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Error monitoring | REQUIRED BEFORE PRODUCTION             | Not configured.                                                                                        |
| Logs             | REQUIRED BEFORE PRODUCTION             | Platform logs after Vercel exists.                                                                     |
| Uptime           | RECOMMENDED BEFORE FIRST PAYING CLINIC |                                                                                                        |
| Deploy rollback  | REQUIRED BEFORE PRODUCTION             | Vercel rollback once deployed.                                                                         |
| Backup restore   | RECOMMENDED BEFORE FIRST PAYING CLINIC |                                                                                                        |
| Support path     | REQUIRED BEFORE PRODUCTION             | Public contact form + production mailbox exist. Confirm Vercel env and a live test send before launch. |

## Commercial

| Item                     | Status                                 | Notes                                                                     |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| Final pricing            | REQUIRED BEFORE PRODUCTION             | Essential A$79 / Practice A$149 remain **provisional**. No Offer JSON-LD. |
| Manual invoice vs Stripe | RECOMMENDED BEFORE FIRST PAYING CLINIC | Billing not implemented. Design partners can be invoiced manually.        |
| Seat policy              | POST-LAUNCH                            |                                                                           |

## QA

| Item                               | Status                                 | Notes                                                                   |
| ---------------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Playwright + axe (local)           | READY                                  | Includes marketing, tenant, portal, operator SEO.                       |
| iPhone / Android / Safari / Chrome | RECOMMENDED BEFORE FIRST PAYING CLINIC | Local Playwright is not a device lab.                                   |
| Tenant hostname                    | READY                                  | Local `*.localhost` simulation. Production wildcard TLS still unproven. |
| Print / PDF                        | READY                                  | Dedicated print route exists for published guides.                      |
| Performance budgets                | READY                                  | Patient CSS/JS contract unchanged; no new marketing client SEO library. |

## Analytics

| Item                  | Status      | Notes                                                                       |
| --------------------- | ----------- | --------------------------------------------------------------------------- |
| Anonymous guide views | POST-LAUNCH | Useful, not a first-design-partner blocker. Must not introduce patient PII. |

## Auth decision (Phase 2B — no migration)

`next-auth@5.0.0-beta.32` remains a documented AGENTS.md exception because npm `latest` is Auth.js v4.

**Classification: A — acceptable documented exception for first launch.**

Investigate Better Auth only as a separate, approved project. Do not migrate in this phase.

## R2 / Vercel DNS gate

**Staging wildcard TLS proof remains required: YES.**

Desired production direction (document only):

- Vercel → Next.js
- Neon Sydney → PostgreSQL 18 (project created, schema not migrated, Vercel `DATABASE_URL` unset)
- Cloudflare → authoritative DNS candidate, R2, Turnstile
- Resend → transactional email

Cloudflare as authoritative DNS plus `_acme-challenge` delegation to Vercel must be proven on a staging/test domain before production domain cutover.

## Concise remaining gate

| Priority                   | Remaining item                                                   | Blocker?              | Next action                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| MUST BEFORE PRODUCTION     | Final domain + Cloudflare DNS + Vercel project                   | Yes                   | Choose domain; configure staging first                                                                                                       |
| MUST BEFORE PRODUCTION     | Wildcard TLS staging proof (`_acme-challenge` → Vercel)          | Yes                   | Prove on a test domain                                                                                                                       |
| MUST BEFORE PRODUCTION     | Neon Sydney PG18 + backups + migrate deploy                      | Yes                   | Project exists. Still need Vercel `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled) + `prisma migrate deploy`. Never from a drive-by branch. |
| MUST BEFORE PRODUCTION     | R2 (or equivalent) clinic-logo bucket                            | Yes                   | Follow ADR 0019                                                                                                                              |
| MUST BEFORE PRODUCTION     | Privacy + Terms counsel approval of published drafts             | Yes                   | Legal review; do not mark approved until counsel signs                                                                                       |
| MUST BEFORE PRODUCTION     | Public mailbox + SPF/DKIM/DMARC + delivery                       | Application ready     | Hostinger mailbox + Resend sending domain exist. Confirm production env on Vercel before serving public Contact.                             |
| MUST BEFORE PRODUCTION     | Turnstile on login                                               | Yes                   | Contact Turnstile is implemented. Login still needs a widget + server-side verification.                                                     |
| MUST BEFORE PRODUCTION     | Error monitoring + secrets review                                | Yes                   | Sentry or equivalent                                                                                                                         |
| MUST BEFORE PRODUCTION     | Auth.js v5 beta accepted in writing                              | Yes                   | Keep exception or separate auth project                                                                                                      |
| MUST BEFORE PRODUCTION     | Dedicated OG image optional for go-live                          | No                    | Upload workflow exists; 1200×630 asset still needs to be uploaded                                                                            |
| BEFORE FIRST PAYING CLINIC | Reviewed multi-template dental library                           | Yes for paid          | Clinical review of Extraction + additional procedures                                                                                        |
| BEFORE FIRST PAYING CLINIC | QR + copy URL                                                    | No for design partner | Implement share kit                                                                                                                          |
| BEFORE FIRST PAYING CLINIC | Final commercial pricing / Stripe                                | Yes for paid          | Replace provisional A$79 / A$149                                                                                                             |
| BEFORE FIRST PAYING CLINIC | Device QA (iPhone/Android/Safari)                                | Recommended           | Real devices                                                                                                                                 |
| POST-LAUNCH                | Analytics, Check-ins, RecoveryPlan, editorial `/guides`, MCP/API | No                    | Roadmap                                                                                                                                      |
