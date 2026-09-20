# ADR 0022 — Cloudflare R2 is the production clinic asset provider

- **Status:** Accepted
- **Date:** 2026-09-13
- **Updated:** 2026-09-20 (local/E2E filesystem driver is not a production path)
- **PRD:** [../product/PRD.md](../product/PRD.md) §10.2
- **Supersedes provider choice in:** [0019](0019-clinic-logo-upload-requires-object-storage.md)

## Context

Phase 2A.4 completed the application boundary for clinic logos (ADMIN upload, validation, SVG sanitization, `<img>` rendering) behind `ClinicAssetStorage`. The provisional production adapter was Supabase Storage because the repo already used `@supabase/supabase-js` for parked chairside Realtime.

Supabase Realtime is not a Storage bucket. Binding clinic branding to Supabase mixed a parked chairside dependency with a launch-critical public-asset path, and same-origin proxying through Next.js would put logo bytes on the Vercel origin.

River Aftercare already listed R2 as a production-readiness gate. Logos are small (≤2 MB), public, cacheable, and few per clinic.

## Decision

- **Cloudflare R2** is the production clinic-asset provider for clinic logos and future small clinic brand marks (isologo / similar).
- Talk to R2 with the latest stable `@aws-sdk/client-s3` from the **Next.js server only**. No browser SDK. No presigned browser upload for launch: files are small and must be validated/sanitized on the server.
- Keep the R2 bucket **private**. Disable r2.dev. Do **not** attach a Cloudflare R2 custom domain.
- Public delivery is:

  `browser → assets.<platform-domain> → Vercel route → authenticated private GetObject`

  Vercel remains authoritative DNS. `assets` is a reserved tenant slug, not a clinic hostname.

- Store a provider-independent **object key** in `ClinicProfile.logoUrl`. Resolve `img src` at runtime from `CLINIC_ASSET_PUBLIC_ORIGIN` + key.
- Use immutable keys `clinics/<clinicId>/branding/<uuid>.<ext>`.
- Keep the in-memory driver for Vitest. Use the local filesystem driver only for `next start` / Playwright so uploads survive the server-action vs route-handler bundle split. Do not introduce MinIO, Docker S3, or a filesystem production path.
- Do not provision Cloudflare, DNS, or Vercel env from application PRs. Joaquín follows [../launch/R2-PROVISIONING.md](../launch/R2-PROVISIONING.md).
- Leave parked chairside Supabase Realtime code in place.

Cloudflare DNS / R2 ≠ application runtime. Next.js remains on Vercel.

## Consequences

- Production logo upload stays dark until the R2 bucket, scoped token, and server env exist. The public hostname is the Vercel `assets.` label, not an R2 custom domain.
- Demo `/demo/riverside-mark.svg` continues to work without R2.
- SVG remains sanitized on the server and rendered only as `<img>`.
- A Cloudflare Worker is not required. The Vercel route sets `Cache-Control`, `Content-Type` from the validated extension, and `X-Content-Type-Options: nosniff`.
- This bucket is public-asset-only (public-by-exact-key via the app). Future private documents need a separate bucket and policy.
- The same private bucket may also store platform SEO social images under the distinct `platform/seo/` namespace. Do not fold that work into `ClinicAssetStorage`. See [0023](0023-platform-seo-assets-use-a-distinct-private-r2-namespace.md).

## Notes for later implementation

- Do not grant account-wide R2 admin tokens.
- Do not put private clinical documents in the branding bucket.
- Do not add a Worker solely to set headers unless a concrete browser bug requires it.
