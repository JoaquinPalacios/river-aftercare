# ADR 0021 — Clinic patient guides stay noindex by default

- **Status:** Accepted
- **Date:** 2026-09-13
- **PRD:** [../product/PRD.md](../product/PRD.md) §10.4–10.6

## Context

Published clinic guides are durable patient documents on tenant hostnames. They need shareable title, description, canonical, and Open Graph tags. They are not a River Aftercare content-acquisition programme.

Indexing white-label clinic pages by default would mix clinic-owned instructions into platform search results and risk thin or duplicate clinical content.

## Decision

- Launch default for tenant home and published guides is **private from search** (`noindex, follow`).
- Do not include tenant URLs in the marketing sitemap while noindex.
- Staff, operator, and authenticated preview stay `noindex, nofollow`.
- A future `searchVisibility: PRIVATE_FROM_SEARCH | INDEXABLE` field may exist only after a clinic can opt a **published** guide in, with differentiated content and governance.
- Keep white-label patient URLs (`<clinic>.<domain>/<guide>`) separate from any future indexable River Aftercare editorial library (`<domain>/guides/...`).

## Consequences

- Patients can still share links.
- Google may crawl tenant pages (robots.txt does not block tenant `/<slug>`) and should honour metadata noindex.
- Do not emit `MedicalWebPage` / `reviewedBy` claims. Clinic publish attestation is practice workflow accountability, not structured clinical-review metadata for patients or JSON-LD. The platform aftercare disclaimer does not change this. See [ADR 0026](0026-first-client-clinic-supplied-governance.md).

## Notes for later implementation

- INDEXABLE must never be the default.
- Editorial `/guides` on the marketing host is a later product, not a rename of tenant pages.
