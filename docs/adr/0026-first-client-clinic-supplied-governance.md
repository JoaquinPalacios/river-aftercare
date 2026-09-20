# ADR 0026 — First-client clinical governance is clinic-supplied and clinic-attested

- **Status:** Accepted
- **Date:** 2026-09-20
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.3–10.5, 12, 13
- **Related:** [0006](0006-canonical-guide-plus-practice-configuration.md), [0010](0010-practice-guides-explicitly-pin-canonical-revisions.md), [0017](0017-clinic-owned-practice-revisions-pin-public-documents.md), [0021](0021-clinic-patient-guides-stay-noindex-by-default.md)

## Context

The first real clinic will publish aftercare on River Aftercare before a clinically reviewed canonical library exists. Inferring “sample” from missing `GuideTemplateRevision.reviewedAt` / `reviewedBy` is not an explicit product designation. Classification that treated any reviewed published revision as making the template available, while enablement pinned the latest published revision, could pin an unreviewed v2 after a reviewed v1.

Practice publication also had no clinic-accountability record on the immutable `PracticeGuideRevision` snapshot.

## Decision

**First-client model: clinic-supplied / clinic-approved content (Model B).**

River Aftercare is the publishing and workflow platform. The clinic supplies aftercare content and is responsible for its clinical review before publication. River Aftercare does not claim the current canonical template library is clinically approved. A River Aftercare reviewed canonical library is deferred.

- `GuideTemplate.isSample` is the explicit sample/demo designation. `isSample = true` is never eligible for ordinary real-clinic enablement, even if revision review metadata is later populated.
- The Tooth Extraction library row (`slug = extraction`) is sample content for `demodental` only.
- Canonical availability and enablement evaluate the **same** latest published revision. A newer unreviewed published revision does not inherit eligibility from an older reviewed revision.
- Each new published `PracticeGuideRevision` (version 1+) for a **real clinic** requires a fresh practice attestation (`reviewAttestedAt`, `reviewAttestedByUserId`). The actor is the authenticated Clinic ADMIN confirming, on behalf of the practice, that the content has undergone the practice’s required clinical review. That user is not recorded as the clinical reviewer.
- Canonical `reviewedAt` / `reviewedBy` never substitute for clinic attestation.
- Custom guides (`guideTemplateId` and `pinnedRevisionId` null) remain the first-client path.
- `demodental` remains a real tenant hostname. Operator clinic creation cannot claim that slug. It is not an infrastructure reserved label in `RESERVED_TENANT_SLUGS`, because those labels must not resolve as tenants.
- Demo publication must not fabricate clinical attestation. Historical demo published rows stay unaugmented.
- Patient pages continue to show only the clinic’s published snapshot. Do not emit `reviewedBy`, attestation identity, `MedicalWebPage`, or clinical-review JSON-LD. The platform patient disclaimer is separate approved product copy, not clinical review metadata.

## Consequences

- First-clinic publication is possible without a River Aftercare clinical library.
- Sample templates cannot accidentally become generally available by filling review fields.
- Real-clinic publish is gated in the server action/service, not only by a UI checkbox.
- Republish always requires a new attestation; prior published rows stay immutable.

## Notes for later implementation

- Patient disclaimer copy is implemented as `PatientAftercareDisclaimer` on real-clinic published-guide pages, print, and authenticated preview that reuses `PatientPage`. It sits after the guide body and before `PracticeContact`. Demo tenant `demodental` keeps separate sample messaging and does not receive this disclaimer. Do not add `reviewedBy`, attestation identity, or `MedicalWebPage`.
- A later hybrid Model C (clinic attestation plus a reviewed non-sample canonical library) can reuse exact-revision pinning and per-revision clinic attestation without changing this boundary.
- Do not add operator-attestation-for-a-clinic, AHPRA credentials, or MedicalWebPage claims in this phase.
