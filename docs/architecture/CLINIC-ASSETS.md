# Clinic logo object storage

Practice identity stores `ClinicProfile.logoUrl` as a **provider-independent reference**:

- Demo / static marks: a same-origin path such as `/demo/riverside-mark.svg`
- Uploaded marks: an immutable object key `clinics/<clinicId>/branding/<uuid>.<ext>`

The patient renderer resolves that reference with `resolveClinicLogoSrc` and always renders the mark as `<img src="...">`. Uploaded SVG is never inlined, never passed to `dangerouslySetInnerHTML`, and never mounted via `object`/`embed`.

## Current status

**Application support for Cloudflare R2 is complete, including private-bucket delivery through a Vercel route.** Production still needs Joaquín to set server env (`CLINIC_ASSET_STORAGE_DRIVER=r2`, bucket-scoped credentials, `CLINIC_ASSET_PUBLIC_ORIGIN`). This repository does not create Cloudflare or Vercel resources and does not write production secrets.

The repository now has:

- `ClinicAssetStorage` (`uploadLogo`, `deleteLogo`, `readLogo`, `headLogo`, `getPublicLogoUrl`)
- `R2ClinicAssetStorage` adapter (`@aws-sdk/client-s3`, server-only, S3-compatible R2 API)
- In-memory driver for automated tests only (`CLINIC_ASSET_STORAGE_DRIVER=memory`) — not a filesystem and not for production
- Validation: PNG / JPEG / WebP (2 MB) and SVG (1 MB); MIME, extension, and magic/markup checked independently
- Server-only SVG sanitization (`jsdom` XML parse + DOMPurify SVG profile), loaded **only** on the SVG upload path
- ADMIN-only, same-clinic mutation (`uploadClinicLogo` / `removeClinicLogo`)
- Same-origin GET `/clinic-branding/<clinicId>/<filename>` as the **test / unconfigured-origin** fallback
- Production public URLs: `CLINIC_ASSET_PUBLIC_ORIGIN` + object key (`https://assets.riveraftercare.com.au/clinics/...`) served by a Vercel route that performs authenticated private R2 `GetObject`
- Practice UI: contained logo control with visually hidden file input, explicit choose-then-upload, cancel selection, and confirm-before-remove when storage is configured; explicit infrastructure-unavailable copy when it is not

Do not claim production clinics can upload logos until the R2 driver env is set in the deployed environment. Derive availability from the storage driver.

Cursor / CI must not provision Cloudflare. Joaquín follows [../launch/R2-PROVISIONING.md](../launch/R2-PROVISIONING.md).

## Secure SVG contract

Accepted clinic logos:

| Kind            | Max size | Notes                                                               |
| --------------- | -------- | ------------------------------------------------------------------- |
| PNG, JPEG, WebP | 2 MB     | Magic bytes must match MIME and extension                           |
| SVG             | 1 MB     | Well-formed XML, sensible `viewBox` or width/height, then sanitized |

SVG rejection / removal includes at least:

- `<script>` and other active HTML
- event attributes (`onload`, `onclick`, …)
- `<foreignObject>`
- `javascript:` / `data:` / `vbscript:` URLs
- external `href` / `xlink:href` / HTTP(S) resources
- unsafe CSS `url()`
- DTD/ENTITY payloads and non-XML processing instructions

Sanitization is **server-only**. Regex is not the security boundary. The stored object is a generated `*.svg` with `Content-Type: image/svg+xml`. Clients render it as an image.

Ordinary Practice mutations (display name, colours, contact, emergency text, presentation) must not import `jsdom`, DOMPurify, or `sanitize-clinic-logo-svg`. Those live in `practice/actions.ts`. Logo upload/remove live in `practice/logo-actions.ts`. `mutate-clinic-logo` dynamically imports the sanitizer only after `validateClinicLogo` reports `kind === "svg"`. Raster PNG/JPEG/WebP uploads never load jsdom.

`jsdom` is pinned to **26.1.0** (CJS `html-encoding-sniffer@4` / `parse5@7`). jsdom 27+ requires ESM-only `@exodus/bytes` from CommonJS; Vercel’s Node runtime rejects that with `ERR_REQUIRE_ESM`. Do not “fix” this by changing Vercel `NODE_OPTIONS`. Fail closed on SVG rather than skip sanitization.

## Production provider

**Cloudflare R2** is River Aftercare’s production clinic-asset provider.

Rationale:

- Extremely low storage cost
- No egress fee from R2
- S3-compatible portability via `@aws-sdk/client-s3`
- Public hostname `assets.<platform-domain>` on Vercel (same app; reserved slug, not a tenant)
- Bounded public-asset URL space, separate from staff/tenant hostnames
- Private R2 bucket; no r2.dev; no R2 custom domain
- Avoids coupling clinic logos to Vercel Blob or Supabase Storage

Cloudflare DNS / R2 is **not** the application runtime. Next.js remains on Vercel. Parked chairside **Supabase Realtime** is unrelated and stays in the repo.

Do not use Vercel Blob, the local filesystem, or `public/uploads`. The previous Supabase Storage clinic-asset adapter is removed.

The `memory` driver exists so unit and Playwright tests can exercise upload/replace/remove without Cloudflare. It is not a production fallback. Optional real-R2 credentials may be pointed at a development bucket for manual checks. MinIO / Docker S3 are not required.

## Required provisioning (human / infra)

See the runbook: [../launch/R2-PROVISIONING.md](../launch/R2-PROVISIONING.md).

Server-only env (never `NEXT_PUBLIC_`):

```bash
CLINIC_ASSET_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_BUCKET=<river-aftercare-clinic-assets-prod>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
CLINIC_ASSET_PUBLIC_ORIGIN=https://assets.riveraftercare.com.au
# Optional. When unset, derived as https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
# R2_S3_ENDPOINT=
```

`CLINIC_ASSET_PUBLIC_ORIGIN` is used when the server renders `<img src>`. It is not a credential. Do not prefix R2 keys with `NEXT_PUBLIC_`.

After env is set, Practice Upload / Replace / Remove become live for clinic ADMIN. STAFF remains forbidden (Practice returns 404; mutations also reject).

## Key and URL contract

| Stored `ClinicProfile.logoUrl`            | Resolved `img src` (production)                                                | Test / no origin                          |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| `clinics/<clinicId>/branding/<uuid>.webp` | `https://assets.riveraftercare.com.au/clinics/<clinicId>/branding/<uuid>.webp` | `/clinic-branding/<clinicId>/<uuid>.webp` |
| `clinics/<clinicId>/branding/<uuid>.svg`  | `https://assets.riveraftercare.com.au/clinics/<clinicId>/branding/<uuid>.svg`  | `/clinic-branding/<clinicId>/<uuid>.svg`  |
| `/demo/riverside-mark.svg`                | `/demo/riverside-mark.svg`                                                     | same                                      |

Never trust original filenames. Never store Cloudflare, R2.dev, or other provider URLs in `ClinicProfile.logoUrl`. Resolve through `clinicAssetPublicUrl` / `resolveClinicLogoSrc` only.

No schema migration: the existing `logoUrl` column already stored provider-independent paths, not full Supabase URLs. Uploaded values now store the object key instead of the same-origin proxy path so production can serve from the asset domain without rewriting the database when the hostname changes.

Replace uploads write a new object, then update Prisma, then delete the previous **clinic branding** key only. Demo paths such as `/demo/riverside-mark.svg` are never deleted from object storage.

Optional **Dark logo** (`ClinicProfile.darkLogoUrl`) and **favicon** (`ClinicProfile.faviconUrl`) use the same object namespace, UUID keys, headers, and ADMIN/same-clinic authorization as the standard logo. Favicons are PNG-only, square, 32–1024px, max 512 KB. The uploaded PNG is served as-is (no extra image-processing dependency) for both `rel="icon"` and `apple-touch-icon`. Replacing either asset writes a new key so patient metadata URLs change.

Dark logo is used only when the resolved patient appearance is Dark. Missing Dark logo falls back to the standard logo. Missing favicon falls back to the River Aftercare pack on patient guides. Marketing, staff, login, and operator keep River icons.

If the new object uploads but the database update fails, the application attempts to delete the new orphan and shows a safe error. If the database update succeeds but the old-object delete fails, the clinic sees success and the failure is logged for later cleanup.

## Object metadata

R2 `PutObject` sets:

- `Content-Type`: `image/png`, `image/jpeg`, `image/webp`, or `image/svg+xml`
- `Cache-Control`: `public, max-age=31536000, immutable`

Keys are new UUIDs on every upload. Do not overwrite the same key.

## Public delivery and headers

Production logos are **intentionally public-by-exact-key** clinic-branding assets. Knowing the object key is enough to fetch the image from the Vercel asset host. The R2 bucket itself stays **private**. Do not store private documents in this bucket. Do not enable a bucket listing/index. Do not enable r2.dev. Do not attach an R2 custom domain.

```text
browser
  -> https://assets.riveraftercare.com.au/clinics/<clinicId>/branding/<filename>
  -> River Aftercare / Vercel route (`app/clinics/[clinicId]/branding/[filename]/route.ts`)
  -> authenticated private R2 GetObject (GET) or HeadObject (HEAD)
```

The route only serves when `Host` matches `CLINIC_ASSET_PUBLIC_ORIGIN`. Successful responses set `Content-Type` from the validated file extension (never arbitrary R2 metadata), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, and `Cross-Origin-Resource-Policy: same-site`. Do not send `Cross-Origin-Resource-Policy: same-origin` — clinic, staff, and marketing hosts load the image from the `assets.` subdomain. CORS is not required. A Cloudflare Worker is not required.

The `/clinic-branding/...` route remains for the memory driver / unconfigured origin and still sets `nosniff`, a restrictive CSP, and `Cross-Origin-Resource-Policy: same-origin` for that same-origin localhost fallback path.

## Authorization

Logo mutation requires authenticated clinic **ADMIN**, clinic membership, and `targetClinicId === authenticated clinic`. STAFF cannot upload, replace, or remove. OPERATOR remains a separate surface. Do not trust a client-supplied clinic id; server actions use `requireClinicAdmin()` membership.

## Platform SEO social images

Clinic branding and platform SEO images share the **same private R2 bucket** and Vercel `assets.` host. They do **not** share the clinic storage interface.

- Clinic logos stay under `clinics/<clinicId>/branding/<uuid>.<ext>`
- Platform default social images use `platform/seo/<uuid>.<ext>`
- `ClinicAssetStorage` remains clinic-logo-specific. Platform uploads go through `PlatformSeoAssetStorage`.

See [SEO.md](SEO.md) and [ADR 0023](../adr/0023-platform-seo-assets-use-a-distinct-private-r2-namespace.md). Private patient documents must never use this public-by-exact-key mechanism.
