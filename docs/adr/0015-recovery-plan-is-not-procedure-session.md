# ADR 0015 — RecoveryPlan is not ProcedureSession

- **Status:** Accepted
- **Date:** 2026-09-09
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.3–10.5, 18.2–18.4
- **Roadmap:** [../product/POST-LAUNCH-ROADMAP.md](../product/POST-LAUNCH-ROADMAP.md)

## Context

The current public aftercare page is a published, anonymous document. A future real product needs a started recovery that can answer “what matters today?” without coupling aftercare to the parked chairside product.

`ProcedureSession` is a live, in-clinic walkthrough with rooms, doctors, PIN/display tokens, and stage transitions. Reusing it for aftercare would encode the wrong lifecycle, the wrong identity model, and the wrong privacy boundary.

Phase 1G/1G.1 keeps a day-aware **demo fixture** (Today / Timeline / printable recovery guide) on the fictional `demodental` tenant. Check-in is **not** part of the launch product. The generic `/extraction` guide does not know a real patient's treatment day.

## Decision

Keep the current document pipeline:

```text
GuideTemplate
  → published GuideTemplateRevision
  → PracticeGuide (enabled, pinned revision, overrides, additions)
  → composed resolved guide
```

A future **RecoveryPlan** (also called CarePlanInstance in product conversation) is a new aftercare record. It is **not** `ProcedureSession`. It must not reuse chairside session tables, tokens, or stage machines. The chairside application was later removed; any remaining `ProcedureSession` tables are dormant and still must not be reused.

Proposed RecoveryPlan fields (not implemented):

| Field                               | Purpose                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                                | Internal identifier                                                                             |
| `clinicId`                          | Tenant scope                                                                                    |
| `practiceGuideId` / pinned revision | Which published guide this plan follows                                                         |
| `startedAt` / `procedureDate`       | Explicit recovery origin. Never infer from `Date.now()` alone at read time without storing this |
| `publicToken`                       | Opaque unguessable token for the patient URL                                                    |
| `status`                            | e.g. active / completed / void                                                                  |
| `createdAt` / `updatedAt`           | Audit timestamps                                                                                |

Derived (not stored as clinical truth):

```text
RecoveryPlan
  → Today resolver
  → Timeline (earlier / current / upcoming)
  → printable recovery guide / PDF
  → optional Check-ins (premium, post-launch)
```

The current Today/Timeline demo computes from an **explicit fixture** (`simulatedDay`, `recoveryWindowDays`) plus composed `RECOVERY_TIMELINE` sections. It does not persist RecoveryPlan.

Before Today is sold as a real per-patient capability, a real anonymous RecoveryPlan / share-link domain must exist.

Do **not** add: patient name, DOB, PIN, patient account, medication records, appointments, or health-data writes in this phase.

## Check-in commercial boundary

Persisted check-ins are a **premium / add-on** (or higher Connected / Recovery tier) capability and are **POST-LAUNCH**. Current production launch contains no persisted patient check-ins and no Check-in UI.

A real implementation will require all of:

- RecoveryPlan persistence
- opaque patient / recovery token
- patient-reported health information handling
- retention and deletion policy
- tenant isolation
- audit / event history
- clinic dashboard
- alerts / notifications only if explicitly added later
- explicit non-emergency-monitoring wording
- operational expectations
- security / privacy review

Feature availability should be gateable per clinic/plan (`enabled` / `disabled`). When disabled, Check-in is omitted from navigation.

See [POST-LAUNCH-ROADMAP.md](../product/POST-LAUNCH-ROADMAP.md).

## Accessibility ownership

**Clinic controls:** branding, terminology, guide content, timeline, warnings, contact, feature availability, and default presentation/theme where appropriate.

**Patient / device controls:** theme override where the clinic permits it, reduced motion, and future reading density / text sizing.

A clinic must not be able to disable a user’s `prefers-reduced-motion` preference. Density controls are not in this phase.

## Printable recovery guide

Print derives from the **same composed GuideDocument** as the web guide. Launch uses print-oriented HTML and `@media print` (browser Print / Save as PDF). Do not add a PDF library until a commercial workflow requires server-generated files. Do not call the launch output a patient-specific Care Plan.

## Consequences

- Aftercare loaders and patient UI remain free of `ProcedureSession`.
- Launch cannot accidentally store PHI through a demo Check-in.
- Later PDF generation, if added, must still start from the resolved guide, not a second copy of clinical text.

## Notes for later implementation

Do not begin RecoveryPlan schema, tokens, or check-in persistence from a marketing/demo polish task. Phase 2 operator admin is a separate explicit programme.
