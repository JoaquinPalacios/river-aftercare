# ADR 0028 — Canonical template lifecycle

- **Status:** Accepted
- **Date:** 2026-09-27
- **PRD:** [../product/PRD.md](../product/PRD.md) §§12–13
- **Related:** [0010](0010-practice-guides-explicitly-pin-canonical-revisions.md), [0026](0026-first-client-clinic-supplied-governance.md), [0027](0027-service-categories-and-composable-guide-grammar.md)

## Context

River Aftercare will eventually publish production canonical templates. The existing model had a free-string `reviewedBy` on `GuideTemplateRevision`, no single-open-draft rule, and no Operator lifecycle for creating, reviewing, and publishing those templates.

Clinic attestation on `PracticeGuideRevision` is a different fact. It records that a clinic admin confirmed the practice’s own review. It does not record River’s clinical review of a canonical template, and it must not be inferred from canonical review fields.

The Tooth Extraction row (`slug = extraction`, `isSample = true`) is demo content. It is published without clinical review and must stay that way.

## Decision

Canonical revision status stays `DRAFT` or `PUBLISHED`. Review is metadata on a draft, not a status.

Production lifecycle, in `lib/canonical-templates/`:

`create template + draft v1` → `edit draft` → `record review` → `publish draft` → later `create draft v2 from the latest published revision` → edit / review / publish.

Ordinary lifecycle services always create `isSample = false`. They cannot create, edit, review, publish, abandon, or deactivate sample templates. The demo bootstrap remains the only writer of the extraction sample. The future production Tooth Extraction slug is `tooth-extraction`. This phase does not create that template. `extraction` is refused for ordinary creation.

### Review provenance

- `reviewerName` and optional `reviewerCredential` name the person whose review is recorded. That person may have no River user.
- `reviewNote` is optional.
- `reviewedAt` is when the evidence was recorded.
- `reviewRecordedByUserId` is the authenticated Operator who entered the evidence.
- `publishedByUserId` and `publishedAt` record publication.
- `createdByUserId` records who opened the draft.

Do not call the recording Operator `reviewedByUserId`. Reviewer and recorder may be the same human, but the model does not assume that.

Historical non-null `reviewedBy` values are copied into `reviewerName`. Nulls stay null. No reviewer or Operator is invented. A copied name without `reviewRecordedByUserId` is not complete review evidence, so it does not make a template eligible. The label `Care Guide demo seed` remains non-clinical.

User foreign keys use `ON DELETE SET NULL`. Removing a User does not delete the template or revision. The display reviewer name does not depend on that User.

### One open draft

A template has at most one `DRAFT` revision. Services take `lockCanonicalTemplate` (`pg_advisory_xact_lock` on `canonical-template:{templateId}`). PostgreSQL also has a partial unique index on `guideTemplateId` where `status = 'DRAFT'`.

The next draft clones the latest published revision’s sections and home-care instructions, including keys, order, and recurrence fields. Its version is exactly that revision’s version plus one. It has no review or publication metadata. If nothing has been published, draft v1 already exists and another initial draft is refused.

### Review invalidation

Recording a review does not publish. While the revision is a draft, review metadata may be replaced.

If patient-visible draft content changes after `reviewedAt` is set, the service clears `reviewerName`, `reviewerCredential`, `reviewNote`, `reviewedAt`, and `reviewRecordedByUserId`. That covers section title, body, kind, timing, and order, and home-care instruction fields and order. A template title, slug, or service-category change does not clear review.

### Publication and immutability

Publishing requires an active non-sample template, a current draft version, at least one valid section, valid home-care rows, a known service category, and complete review evidence (`reviewerName`, `reviewedAt`, `reviewRecordedByUserId`). It sets `status`, `publishedAt`, and `publishedByUserId` only. Section ids stay stable.

Published canonical revisions are historical source records. Lifecycle services do not edit, reorder, or delete their sections or home-care rows, and they do not delete the revision. There is no database trigger subsystem for this; the supported mutation path is the draft services. Clinic revision code is not responsible for the canonical invariant.

### Metadata

Before the first published revision, title, slug, and service category may be corrected. After that, slug and service category are immutable because clinic guides copy `PracticeGuide.serviceCategory` at enablement. Title may still change. `isSample` is immutable after creation.

### Abandonment and deactivation

Abandoning a draft deletes that draft and its sections. It never deletes a published revision. If the template has never been published, abandoning its only draft also deletes the template row so an empty shell does not keep the slug. A draft pinned by a clinic guide cannot be abandoned.

Deactivation sets `isActive = false`, `deactivatedAt`, and `deactivatedByUserId`. New discovery and enablement stop. Pins, published patient guides, and canonical history stay. Reactivation sets `isActive = true` and clears the current deactivation fields. There is no audit-event subsystem and no general deletion of a template that has been published.

### Clinic versions stay put

Publishing canonical v2 does not change an existing clinic `pinnedRevisionId`, clinic draft, or clinic published snapshot. There is no auto-draft, notification, or update-available behaviour in this phase.

Eligibility for a non-sample template remains: active template, latest published revision, complete review evidence on that revision, and a service category in the clinic’s site-category union. Sample templates stay demo-only.

Operator authorization stays at the future action boundary. Lifecycle services require an actor user id so audit fields can be stored, and they do not check the Operator role themselves.

## Consequences

- Production templates can be drafted, reviewed, and published without an Operator UI in this phase.
- The extraction sample stays unreviewed demo content.
- A content edit after review cannot be published on the strength of the old review.
- Clinics already on v1 stay on v1 when v2 is published.

## Notes for later implementation

- Do not add `READY_FOR_REVIEW` or `REVIEWED` statuses.
- Do not build the Operator template UI, bulk import, or production clinical copy in this phase.
- Do not notify clinics or move pins when a newer canonical revision is published.
- `tooth-extraction` is the production slug to use later. Do not reuse `extraction`.
