# ADR 0008 — Dental first

- **Status:** Accepted. Historical sequencing record. The data model now uses `ServiceCategory` on Clinic Site, templates, and guides ([0027](0027-service-categories-and-composable-guide-grammar.md)).
- **Date:** 2026-08-31
- **PRD:** [../product/PRD.md](../product/PRD.md) §8, §20

## Context

Care Guide’s long-term ambition spans multiple healthcare verticals. Implementing several specialties at once would delay proof of the SaaS model (tenant branding, library enablement, publish, QR, mobile aftercare).

Dental is the agreed first vertical because it has a coherent procedure set and a clear aftercare job-to-be-done.

## Decision

**Dental** is the initial vertical.

Other specialties are future expansion, in this intended sequence:

```text
Dental
  → Cosmetic / Injectables
  → Physiotherapy
  → Podiatry
  → Dermatology
  → Veterinary
  → Surgery / Allied Health
```

That sequence is strategic direction, not an MVP build list.

Architecture and terminology should not make expansion unnecessarily difficult, but MVP implements one vertical.

## Consequences

- Canonical library work for MVP is Dental (or a small Dental subset for Phase 1).
- Domain names should stay specialty-aware as data (`specialty: dental`), not as a hard-coded single-specialty application.
- Multi-specialty rollout is an explicit non-goal for MVP.

## Notes for later implementation

Do not author clinically authoritative copy by scraping websites. The planning list of dental guides in the PRD is not a mandate to ship all of them in Phase 1.
