# ADR 0029 — Publish is the release boundary

- **Status:** Accepted
- **Date:** 2026-09-29
- **PRD:** [../product/PRD.md](../product/PRD.md)
- **Supersedes:** the review and practice-attestation workflow in [0026](0026-first-client-clinic-supplied-governance.md) and [0028](0028-canonical-template-lifecycle.md)
- **Related:** [0010](0010-practice-guides-explicitly-pin-canonical-revisions.md), [0014](0014-recovery-timeline-stages-are-data-driven-sections.md), [0027](0027-service-categories-and-composable-guide-grammar.md)

## Context

Canonical templates and clinic guides both required an explicit review step before publication: Operator “Record review” evidence on a canonical draft, and a practice attestation checkbox on a real-clinic guide. That step is no longer part of the product. Publish is the approval and release boundary.

Historical review columns already exist. Dropping them in this change would be a destructive migration. They can stay until a later cleanup.

## Decision

The authoring lifecycle is:

`Edit` → `Save` → `Publish`

- Save persists the current editable draft. It does not publish, and it does not clear historical review metadata.
- Publish is the explicit release. A valid canonical draft can be published without `reviewerName`, `reviewerCredential`, `reviewNote`, `reviewedAt`, or `reviewRecordedByUserId`. A valid clinic guide can be published without `reviewAttestedAt` or `reviewAttestedByUserId`.
- Publication still records the existing publisher and timestamp for canonical revisions, and the existing clinic snapshot author and `publishedAt` for practice revisions.
- Drafts stay hidden from patients and from clinic template discovery.
- A production canonical template is eligible when it is active, not a sample, has a latest published revision, and matches the clinic’s service categories. Sample `extraction` stays demo-only. Inactive templates stay hidden.
- New publications do not create review or attestation records. Existing column values are left in place.
- The Operator sticky actions are Draft status, Save, Publish, and More. Clinic authoring uses Save and Publish guide. The draft state stays visible through badges and revision status, not through the Save label.

Other publication invariants stay: draft status, active template, production/sample restrictions, a known service category, at least one valid section, section and home-care validation, version and concurrency checks, and immutability of the published revision or patient snapshot.

### Procedure-recovery authoring

For procedure-recovery templates, prefer a standalone Immediate care section, then a Recovery timeline whose first stage is First 24 hours, followed by Days 2–3, Days 4–7, and later stages as appropriate. That includes templates such as Tooth Extraction, Wisdom Tooth Removal, and Dental Implant Placement.

`FIRST_24_HOURS` remains a valid section kind for other guide structures. This convention does not rewrite existing template rows.

## Consequences

- Operator and clinic UIs no longer offer Record review, Not reviewed, Review recorded, or a practice attestation checkbox.
- Clinics can enable an active published production template that has no review metadata.
- A later migration may drop the unused review and attestation columns after this workflow has settled.
- `prisma/schema.prisma` comments are unchanged in this pass. The release gate treats any schema file diff as a schema change that needs a migration, and this pass does not add one. Deprecation is recorded here and in working memory.

## Notes for later implementation

- Do not add a destructive migration in the same change that removes the workflow.
- Do not mutate existing Tooth Extraction, Wisdom Tooth Removal, Dental Implant Placement, or demo extraction content to match the timeline convention.
