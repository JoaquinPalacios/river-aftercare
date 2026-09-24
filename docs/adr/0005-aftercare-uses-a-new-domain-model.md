# ADR 0005 — Aftercare uses a new domain model

- **Status:** Accepted
- **Date:** 2026-08-31
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.3, 12, 18.2–18.4, §26

## Context

Chairside content is modelled as clinic-owned `ProcedureTemplate` rows with ordered `ProcedureStageTemplate` stages (`calmCopy`, `patientCopy`, `detailedCopy`), selected-area options, and live `ProcedureSession` state.

Aftercare content is a durable, publishable, multi-tenant library of post-treatment guidance with canonical + practice layers. Mapping aftercare onto session stages would encode the wrong lifecycle (live progress vs permanent guidance) and the wrong ownership (clinic-owned walkthrough vs Care Guide canonical library).

## Decision

Aftercare uses a **new domain model**.

Do not retrofit `ProcedureSession` stages into aftercare guides.

Do not reuse `ProcedureTemplate` as the name or the record type for canonical aftercare templates.

Product objects are **Guide Template**, **Practice Guide**, practice branding/contact, additions, and overrides (see PRD §12).

## Consequences

- Later Prisma work (not Phase 0) must add aftercare models rather than overload parked session models.
- The removed chairside `ProcedureTemplate.aftercareUrl` is not the aftercare product. The chairside application was later removed in PR #96, and that schema was subsequently dropped. See [ADR 0009](0009-existing-chairside-product-is-parked.md).
- Implementers must not “just add sections” to stage templates to ship aftercare.

## Notes for later implementation

Phase 1 is the first allowed moment to introduce aftercare schema. Phase 0 documentation must not be treated as permission to migrate now.
