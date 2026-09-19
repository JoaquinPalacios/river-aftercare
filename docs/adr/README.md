# Architecture Decision Records

This log records product-architecture decisions for Care Guide after the v1.0 aftercare reset.

These records are documentation only. They do not implement behaviour.

## Format

Each ADR is a numbered Markdown file:

```text
docs/adr/NNNN-short-title.md
```

Use this lightweight structure:

- **Status** — Accepted, Proposed, Superseded, or Deprecated
- **Date**
- **Context**
- **Decision**
- **Consequences**
- **Notes for later implementation** — constraints only; not a work ticket

Do not create an ADR for a reversible UI detail. Create one when a later implementation session would otherwise have to guess the product boundary.

## Index

| ADR                                                                          | Title                                                        | Status   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| [0001](0001-aftercare-is-primary-product-domain.md)                          | Aftercare is the primary product domain                      | Accepted |
| [0002](0002-public-patient-experience-is-web-first.md)                       | Public patient experience is web-first                       | Accepted |
| [0003](0003-tenant-identity-uses-hostname.md)                                | Tenant identity uses hostname                                | Accepted |
| [0004](0004-staff-admin-and-patient-surfaces-are-separated.md)               | Staff/admin and patient surfaces are logically separated     | Accepted |
| [0005](0005-aftercare-uses-a-new-domain-model.md)                            | Aftercare uses a new domain model                            | Accepted |
| [0006](0006-canonical-guide-plus-practice-configuration.md)                  | Canonical guide + practice configuration model               | Accepted |
| [0007](0007-no-patient-pii-required-for-mvp.md)                              | No patient PII required for MVP                              | Accepted |
| [0008](0008-dental-first.md)                                                 | Dental first                                                 | Accepted |
| [0009](0009-existing-chairside-product-is-parked.md)                         | Existing chairside product is parked, not deleted            | Accepted |
| [0010](0010-practice-guides-explicitly-pin-canonical-revisions.md)           | Practice guides explicitly pin canonical revisions           | Accepted |
| [0011](0011-patient-styling-uses-css-modules-and-semantic-runtime-tokens.md) | Patient styling uses CSS Modules and semantic runtime tokens | Accepted |
| [0012](0012-apex-host-is-the-public-marketing-face.md)                       | Apex host is the public marketing face                       | Accepted |
| [0013](0013-provisional-aftercare-guide-presentation-controls.md)            | Provisional Aftercare Guide name and presentation controls   | Accepted |
| [0014](0014-recovery-timeline-stages-are-data-driven-sections.md)            | Recovery timeline stages are data-driven sections            | Accepted |
| [0015](0015-recovery-plan-is-not-procedure-session.md)                       | RecoveryPlan is not ProcedureSession                         | Accepted |
| [0016](0016-platform-operator-is-distinct-from-clinic-admin.md)              | Platform OPERATOR is distinct from clinic ADMIN              | Accepted |
| [0017](0017-clinic-owned-practice-revisions-pin-public-documents.md)         | Clinic-owned practice revisions pin the public document      | Accepted |
| [0018](0018-recovery-timeline-stores-optional-day-ranges.md)                 | Recovery timeline stores optional structured day ranges      | Accepted |
| [0019](0019-clinic-logo-upload-requires-object-storage.md)                   | Clinic logo upload waits for production object storage       | Accepted |
| [0020](0020-platform-seo-is-structured-database-configuration.md)            | Platform SEO is structured database configuration            | Accepted |
| [0021](0021-clinic-patient-guides-stay-noindex-by-default.md)                | Clinic patient guides stay noindex by default                | Accepted |
| [0022](0022-cloudflare-r2-is-clinic-asset-provider.md)                       | Cloudflare R2 is the production clinic asset provider        | Accepted |
| [0023](0023-platform-seo-assets-use-a-distinct-private-r2-namespace.md)      | Platform SEO assets use a distinct private R2 namespace      | Accepted |
| [0024](0024-account-lifecycle-tokens-and-shared-transactional-email.md)      | Account lifecycle tokens and shared transactional email      | Accepted |
| [0025](0025-migrate-before-promote.md)                                       | Migrate production before promoting application code         | Accepted |

Related product contract: [../product/PRD.md](../product/PRD.md).
Performance contract: [../architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md).
