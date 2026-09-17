# ADR 0020 — Platform SEO is structured database configuration

- **Status:** Accepted
- **Date:** 2026-09-13
- **PRD:** [../product/PRD.md](../product/PRD.md) §10 (publishing / public pages)

## Context

River Aftercare is a structured clinical aftercare publishing platform. Phase 2A.5 already defined marketing indexability and tenant noindex. Phase 2B needs operator-editable marketing metadata and generated JSON-LD.

A raw `seo.json` file or an operator JSON-LD textarea would turn the control plane into a mini-CMS and create injection and self-destructive canonical risks.

## Decision

- Persist platform identity and per-route marketing metadata in Prisma (`PlatformSeoSettings`, `MarketingPageSeo`).
- Generate JSON-LD from those fields. Never accept raw JSON, HTML, or scripts from operators.
- Derive canonical URLs from the production origin + route. Do not make canonicals operator-editable.
- Keep River Aftercare product constants as fallbacks when the settings row is absent.
- Limit editable routes to known public marketing paths. Do not introduce a generic page-builder model.

## Consequences

- Operator SEO & Discovery is a real platform-OPERATOR feature.
- Public pages keep working without a seeded row.
- `/privacy` and `/terms` are known marketing paths. SEO metadata is editable in the structured operator form. Body copy is code-owned legal draft, not a CMS. Legal approval remains a launch gate.
- Clinic guide SEO remains attached to clinic/guide resources, not this singleton CMS.

## Notes for later implementation

- A dedicated 1200×630 OG image is still required; do not stretch brand marks. Operators upload it through SEO & Discovery into `PlatformSeoSettings.defaultOgImagePath`.
- Do not add Offer price markup while published prices are provisional.
