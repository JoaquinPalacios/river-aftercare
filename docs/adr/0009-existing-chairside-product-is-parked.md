# ADR 0009 — Existing chairside product is parked, not deleted

- **Status:** Superseded
- **Date:** 2026-08-31
- **PRD:** [../product/PRD.md](../product/PRD.md) §18, §20, §26

> **Subsequent outcome (2026-09-24):** The chairside application was removed as legacy. Routes `/sessions/new`, `/session/[id]/control`, `/display/[token]`, and `/dashboard/procedures` 404. Supabase Realtime client code and `@supabase/supabase-js` are gone. Dormant Prisma models remain so production tables were not dropped. The historical decision below is unchanged. The binding rule that aftercare must not depend on `ProcedureSession` still applies. See PRD §26.

## Context

The repository contains a working (in-progress) chairside product:

- `ProcedureSession`, `Doctor`, `Room`
- live stage controls
- Supabase Realtime
- `/display/[token]`
- chairside display modes
- transition history
- completed-session external `aftercareUrl`

Deleting it would destroy recoverable option value and is out of scope for the product reset. Continuing to extend it as if it were Care Guide would destroy the aftercare reset.

## Decision

The existing chairside product is **parked, not deleted**.

Its code remains isolated from the aftercare domain until a later explicit product decision. It may eventually become an optional add-on. **Do not name or develop that add-on now.**

Do not call the chairside implementation dead code.

The only binding architectural rule for the current project: **the aftercare domain must remain independent from the chairside session domain.**

## Consequences

- Phase 0 (this documentation) does not modify chairside application code, Prisma schema, or tests.
- Future aftercare PRs should not “clean up” chairside by merging models.
- README must describe chairside as current implementation / parked capability, not as the product vision.

## Notes for later implementation

Leave `/display/[token]`, session routes, realtime, and related schema in place. Aftercare routes, models, and admin are new surfaces.
