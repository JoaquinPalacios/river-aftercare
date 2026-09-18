# ADR 0013 — Provisional Aftercare Guide name and controlled presentation settings

- **Status:** Accepted
- **Date:** 2026-09-06
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.10, 11.2, 14, 18.5

## Context

Phase 1F shipped a public marketing homepage and clinic branding tokens. The visible product still read as an engineering prototype, occupied teal/green territory similar to unrelated products, and treated “post-operative instructions” as a universal patient heading.

The working commercial name is now **Aftercare Guide**. That name is provisional. It is not a legal brand lock. At the time of this ADR, the repository, package, and environment prefixes remained `care-guide` until branding was formally locked.

**Update 2026-09-17:** the commercial name is **River Aftercare**. The GitHub repository and npm package were renamed to `river-aftercare`. `CARE_GUIDE_*` environment prefixes remain.

Clinic pages must stay clinic-first. Platform marketing colour must not be imposed on tenant pages. Arbitrary tenant CSS remains prohibited.

## Decision

1. Use **Aftercare Guide** as the visible product name on the public marketing site, marketing metadata, patient attribution (“Powered by Aftercare Guide”), and current product documentation. Do not rewrite historical ADRs or the PRD as if the product was always called Aftercare Guide.

2. Keep the Aftercare Guide marketing palette distinct from clinic brand colours. Tenant pages continue to derive semantic `--cg-*` tokens from `ClinicProfile` colour fields. A clinic may still choose green. River Aftercare vertical accents (Dental cobalt, Physiotherapy teal, Chiropractic periwinkle, Cosmetic cyan) are **marketing taxonomy only** and must not be written into tenant theme resolution.

3. Extend `ClinicProfile` with controlled presentation settings:

   | Setting                   | Values                                                                        | Effect                                     |
   | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
   | `instructionTerminology`  | `AFTERCARE`, `POST_TREATMENT`, `POST_PROCEDURE`, `POST_OPERATIVE`, `RECOVERY` | Patient-facing instruction label           |
   | `themeMode`               | `LIGHT`, `DARK`, `SYSTEM`                                                     | Clinic theme policy for the tenant surface |
   | `allowPatientThemeToggle` | boolean                                                                       | Whether patients see a small theme control |

   Defaults that preserve a safe baseline: `AFTERCARE`, `SYSTEM`, `false`.

4. A patient theme control is allowed only as a tiny isolated Client Component, and only when `allowPatientThemeToggle` is true. No `ThemeProvider`, no runtime CSS-in-JS, no arbitrary CSS fields.

5. Future `typographyPreset` (`CLINICAL` / `MODERN` / `EDITORIAL`) is documented and not implemented. Do not allow remote font URLs or arbitrary tenant font selection.

## Consequences

- Marketing and tenant surfaces can evolve independently.
- Riverside Dental Demo is seeded with `POST_TREATMENT`, `SYSTEM`, and `allowPatientThemeToggle = true` so the toggle can be reviewed.
- Operator admin for these fields is not in this phase. Configuration is schema/seed-driven.

## Notes for later implementation

Do not add `customCss`, `stylesheet`, or `headerHtml`. Paid-plan attribution removal stays a later commercial flag, not pricing logic.
