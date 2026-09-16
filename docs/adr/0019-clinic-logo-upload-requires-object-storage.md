# ADR 0019 — Clinic logo upload waits for production object storage

- **Status:** Accepted (provider choice superseded by [0022](0022-cloudflare-r2-is-clinic-asset-provider.md))
- **Date:** 2026-09-11
- **Updated:** 2026-09-13 (production provider is Cloudflare R2; application adapter shipped)
- **PRD:** [../product/PRD.md](../product/PRD.md) §10.2

## Context

Clinics should upload a logo themselves before launch. Local filesystem, database bytea/base64 blobs, and unauthenticated public writes are not production-safe.

SVG clinic marks are professionally common. A blanket “SVG not accepted” rule is too strict, but uploaded SVG markup must never be trusted or inlined.

Phase 2A.4 completed the application boundary. The provisional adapter was Supabase Storage. That provider choice is replaced by [ADR 0022](0022-cloudflare-r2-is-clinic-asset-provider.md). Parked chairside **Supabase Realtime** is unrelated and remains.

## Decision

- Keep ADMIN-only mutation, PNG/JPEG/WebP + sanitized SVG, `<img>` rendering, and `ClinicAssetStorage`.
- Store a provider-independent reference in `ClinicProfile.logoUrl` (demo path or object key). Resolve URLs at read time.
- Production depends on a provisioned Cloudflare R2 bucket and `CLINIC_ASSET_STORAGE_DRIVER=r2`. See [../architecture/CLINIC-ASSETS.md](../architecture/CLINIC-ASSETS.md) and [../launch/R2-PROVISIONING.md](../launch/R2-PROVISIONING.md).
- Do not ship a fake filesystem upload. Do not provision Cloudflare from Cursor.

## Consequences

- Demo logo `/demo/riverside-mark.svg` continues to work.
- Launch checklist must include R2 env + the Vercel `assets.` hostname before clinic-uploaded logos work in production. Do not use an R2 custom domain.
- Arbitrary CSS, HTML, remote stylesheet URLs, and inline SVG injection remain forbidden.
- A `memory` driver exists for tests only.
