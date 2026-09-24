# Care Guide documentation

This directory is the product and architecture documentation for Care Guide.

## Authoritative product contract

| Document                                                                   | Purpose                                                                                                                                                                |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [product/PRD.md](product/PRD.md)                                           | **Care Guide PRD v1.0 — Aftercare SaaS.** Authoritative product requirements, MVP scope, phases, and the removed-chairside boundary.                                   |
| [product/POST-LAUNCH-ROADMAP.md](product/POST-LAUNCH-ROADMAP.md)           | Post-launch Check-ins, RecoveryPlan, template library, and future verticals. Not current implementation.                                                               |
| [adr/](adr/README.md)                                                      | Architecture Decision Records for the aftercare product reset.                                                                                                         |
| [product/WORKING-MEMORY.md](product/WORKING-MEMORY.md)                     | Working notes for later implementation sessions. Not a substitute for the PRD.                                                                                         |
| [architecture/PERFORMANCE.md](architecture/PERFORMANCE.md)                 | Patient-route CSS/JS measurement contract and Phase 1F.1 budget.                                                                                                       |
| [architecture/MARKETING-CONTACT.md](architecture/MARKETING-CONTACT.md)     | Clinic enquiry delivery, Resend + Turnstile, and the production mailbox.                                                                                               |
| [architecture/CLINIC-PORTAL.md](architecture/CLINIC-PORTAL.md)             | Clinic portal IA, permissions, guide lifecycle, and logo storage blocker.                                                                                              |
| [architecture/APPLICATION.md](architecture/APPLICATION.md)                 | Next.js monolith launch architecture and future API extraction triggers.                                                                                               |
| [architecture/BILLING.md](architecture/BILLING.md)                         | Stripe Billing architecture. Phase 1 (test-mode projection + webhook) is implemented; Checkout/Portal/enforcement are not. Historical GST/30-day notes are superseded. |
| [launch/STRIPE-SETUP.md](launch/STRIPE-SETUP.md)                           | Manual Stripe TEST MODE catalogue, webhook, and later Customer Portal settings. No live mode.                                                                          |
| [architecture/AUTH.md](architecture/AUTH.md)                               | Production staff login, password change/reset, operator invitations, AccountToken, and auth-email.                                                                     |
| [architecture/TRANSACTIONAL-EMAIL.md](architecture/TRANSACTIONAL-EMAIL.md) | Shared Resend transport, Contact vs auth identities, password-reset and invitation mail, and lazy AUTH_EMAIL_* config.                                                 |
| [architecture/SEO.md](architecture/SEO.md)                                 | Launch indexing policy, structured SEO settings, JSON-LD, tenant noindex, and future search visibility.                                                                |
| [launch/PRODUCTION-READINESS.md](launch/PRODUCTION-READINESS.md)           | Current production-readiness gate. Not a provisioning runbook.                                                                                                         |
| [launch/PRODUCTION-MIGRATION.md](launch/PRODUCTION-MIGRATION.md)           | Canonical production Prisma workflow: auto-deploy from `main`, schema gate, human-approved `prod:db:*` migrate, same-SHA redeploy.                                     |
| [launch/NEON-RECOVERY.md](launch/NEON-RECOVERY.md)                         | Production Neon history/PITR recovery runbook. Isolated child-branch first. In-place production restore is not tested.                                                 |
| [launch/AGENTIC-READINESS.md](launch/AGENTIC-READINESS.md)                 | Architecture audit vs Is Agentic. No claimed production score.                                                                                                         |
| [launch/R2-PROVISIONING.md](launch/R2-PROVISIONING.md)                     | Manual Cloudflare R2 bucket/token/domain steps for Joaquín. Not executed from Cursor.                                                                                  |
| [development/POSTGRES-18-UPGRADE.md](development/POSTGRES-18-UPGRADE.md)   | Local PostgreSQL 17 → 18 dump/restore runbook. Protects the existing PG17 Docker volume.                                                                               |

## How to read these documents

1. Start with the [PRD](product/PRD.md) for product intent, MVP capabilities, exclusions, and phases.
2. Read the [ADRs](adr/README.md) for the architectural decisions the PRD depends on.
3. Use [WORKING-MEMORY.md](product/WORKING-MEMORY.md) only as a map of the current repository.

The aftercare **product** described in the PRD is not a complete commercial MVP. Phase 1A–1C plus 1E hardening, 1F public-experience work, Phase 1G’s interactive `demodental` recovery demo, **Phase 1G.1 launch-scope cleanup**, **root-platform pricing/contact/about pages**, the **River Aftercare clinic portal foundation**, **Phase 2A clinic self-service + operator foundation**, **Phase 2A.1–2A.5 portal/SEO polish**, and **Phase 2B SEO & Discovery** are implemented. Public `/privacy` and `/terms` copy is published without a draft banner; operator legal-approval flags remain pending. Phase 1D was absorbed into 1C. Analytics, persisted RecoveryPlan, Check-ins, counsel-approved legal flags, and production infra proofs are later. Logo **application** upload is implemented against Cloudflare R2; production still needs Joaquín to provision the bucket. Chairside / live-session functionality was removed as legacy in PR #96; the legacy chairside Prisma schema was subsequently removed. See PRD §26, [ADR 0009](adr/0009-existing-chairside-product-is-parked.md), [ADR 0015](adr/0015-recovery-plan-is-not-procedure-session.md), [ADR 0016](adr/0016-platform-operator-is-distinct-from-clinic-admin.md), [ADR 0019](adr/0019-clinic-logo-upload-requires-object-storage.md), [ADR 0020](adr/0020-platform-seo-is-structured-database-configuration.md), [ADR 0021](adr/0021-clinic-patient-guides-stay-noindex-by-default.md), [ADR 0022](adr/0022-cloudflare-r2-is-clinic-asset-provider.md), and [POST-LAUNCH-ROADMAP.md](product/POST-LAUNCH-ROADMAP.md).

**River Aftercare** is the current commercial/product name. The GitHub repository and npm package are `river-aftercare`. `CARE_GUIDE_*` environment prefixes remain technical.
