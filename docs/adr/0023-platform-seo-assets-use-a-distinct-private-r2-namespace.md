# ADR 0023 — Platform SEO assets use a distinct private R2 namespace

- **Status:** Accepted
- **Date:** 2026-09-17
- **PRD:** [../product/PRD.md](../product/PRD.md) §10
- **Related:** [0020](0020-platform-seo-is-structured-database-configuration.md), [0022](0022-cloudflare-r2-is-clinic-asset-provider.md)

## Context

Operator SEO & Discovery persisted `PlatformSeoSettings.defaultOgImagePath` as an optional same-origin path. The normal workflow asked operators to type that path by hand and left it empty until a dedicated 1200 × 630 River Aftercare social image existed.

Clinic branding already uploads through private R2 and public exact-key delivery on `assets.riveraftercare.com.au`. Reusing that bucket is correct. Reusing `ClinicAssetStorage` or the `clinics/<clinicId>/branding/` key space is not: platform social images are not clinic property, and clinic ADMIN/STAFF must not mutate them.

## Decision

- Keep `defaultOgImagePath` as the canonical SEO setting. Do not add a second competing image column.
- Introduce a narrowly scoped `PlatformSeoAssetStorage` for `platform/seo/<uuid>.<ext>` objects. Do not turn `ClinicAssetStorage` into a catch-all.
- Upload, replace, and remove from the operator SEO page only, as authenticated server-side `PutObject` / `DeleteObject`. No browser-direct or presigned uploads.
- Public delivery is `GET`/`HEAD` `/platform/seo/[filename]` on the configured asset host only. Apex, app, tenant, and spoofed `x-forwarded-host` requests return a generic empty 404.
- Require exact 1200 × 630 PNG, JPEG, or WebP. Reject SVG. Do not resize or recompress.
- Automatically delete a previous object only when the stored value is clearly a managed `platform/seo/` object. Never delete legacy `/brand/...` paths or arbitrary external URLs.
- Share R2 credentials, the private bucket, `CLINIC_ASSET_PUBLIC_ORIGIN`, host matching, and immutable cache headers with clinic branding. Keep clinic and platform domain modules separate.

## Consequences

- Operators think in terms of a default social sharing image, not an R2 object.
- Marketing metadata continues to prefer page `ogImagePath`, then the platform default.
- The R2 bucket remains private. r2.dev stays disabled. Vercel remains authoritative DNS. No R2 custom domain.
- Platform OG images are public-by-exact-key. Private patient documents must never use this mechanism.

## Notes for later implementation

- Do not add a generic user-facing file manager.
- Do not serve platform SEO objects from the clinic branding namespace, or clinic logos from `platform/seo/`.
