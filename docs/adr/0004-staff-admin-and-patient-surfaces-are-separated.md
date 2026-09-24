# ADR 0004 — Staff/admin and patient surfaces are logically separated

- **Status:** Accepted
- **Date:** 2026-08-31
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.10, 11.2, 14, 18.5

## Context

Aftercare patients must not be sent through staff login. Staff cookies on a patient host would mix audiences, complicate caching, and risk leaking admin capabilities onto public branded sites.

The repository currently serves staff and the parked patient display from one Next.js app origin (`/login`, `/dashboard`, `/display/[token]`). That is acceptable as current implementation truth; it is not the target aftercare host model.

## Decision

Prefer a logical split:

```text
app.<platform-domain>              Care Guide / staff administration
<tenant>.<platform-domain>         patient-facing aftercare
```

Patient-facing tenant hosts must not depend on Care Guide staff authentication. Staff cookies should remain isolated from tenant patient hosts where practical.

Clinic self-service is not required for MVP; operator admin still belongs on the admin/staff host, not on the patient hostname.

## Consequences

- Public aftercare rendering must work without a staff session.
- Later cookie, CORS, and host configuration must respect this split.
- The later decision removed `/display/[token]` with the chairside application. Staff and patient hosts stay separated. See [ADR 0009](0009-existing-chairside-product-is-parked.md).

## Implementation notes (Phase 1B)

Tenant hosts block staff/parked paths (`/login`, `/dashboard`, `/sessions`, `/session`, `/display`, `/api/auth`). `app.<root>` is a staff alias for the same application. Auth cookies stay host-only; Phase 1B does not set `Domain=.localhost` or a production parent-domain cookie.

## Notes for later implementation

Do not gate `https://<tenant>.<platform-domain>/<guide>` on `requireStaffSession()`. Do not reuse the chairside display token as aftercare auth.
