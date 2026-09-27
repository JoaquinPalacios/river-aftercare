# ADR 0027 — Service categories and a composable guide grammar

- **Status:** Accepted
- **Date:** 2026-09-27
- **PRD:** [../product/PRD.md](../product/PRD.md) §12

## Context

River Aftercare is no longer a dental-only content model. One commercial Account may contain more than one branded Clinic Site, and one site may provide more than one service. A single specialty field on `Clinic` would hide that.

Procedure recovery (a timeline) is one guide pattern. Physiotherapy and some chiropractic care also need recurring home-care instructions. Those instructions must survive draft edits, adaptation, and immutable publication. They are published guidance, not patient adherence.

ADR 0008 remains the historical decision that dental was the first vertical. It does not keep `Specialty` as the domain name.

## Decision

`ServiceCategory` is the product vertical:

- `DENTAL`
- `PHYSIOTHERAPY`
- `CHIROPRACTIC`
- `COSMETIC_AESTHETIC`

A `ClinicSite` has zero or more categories through `ClinicSiteServiceCategory`. Membership is unique. `ClinicLocation` does not own categories. `Clinic` does not have one global category.

A canonical `GuideTemplate` has exactly one `serviceCategory`. A `PracticeGuide` stores the same classification, nullable for guides that cannot be classified from a template or a classified copy. New custom guides choose a category. The category is not ownership and does not consume an entitlement.

Template discovery uses the union of the Account’s active Clinic Site categories. An Account with no classified site sees no canonical templates. Sample templates, including Tooth Extraction (`slug = extraction`, `isSample = true`), stay demo-only.

The guide grammar stays vertical-neutral. Existing section kinds remain. `HOME_CARE_PLAN` is the plan-oriented section. Its recurring items are child rows (`GuideTemplateHomeCareInstruction` and `PracticeGuideHomeCareInstruction`), copied with the revision. A guide may contain timeline sections and a home-care plan together.

Offering a classified guide at a location whose parent site is classified and does not include that category is rejected. Unclassified guides and unclassified sites stay compatible. Automatic primary-root placement is unchanged in this phase.

Account splits move site membership with the site. A location moved onto a new site copies the source site’s categories. Copied guides keep `serviceCategory` and structured home-care items.

## Consequences

- Existing custom guides and unclassified sites stay null or empty. They are not inferred from names or copy.
- The known `demodental` site and the extraction sample are explicitly `DENTAL`.
- Structured home-care items are not a billable unit and have no completion, reminder, or patient identity.
- A later production template library and operator template manager are separate work.

## Notes for later implementation

Root placement created with a new guide, and publish advancement of that placement, do not yet apply the site compatibility check. Location enablement does.
