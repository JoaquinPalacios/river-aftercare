# R2 provisioning — clinic branding assets

Manual runbook for Joaquín. Cursor / CI must **not** execute these steps, log into Cloudflare, create buckets or tokens, change DNS, or write production secrets.

Production clinic-asset provider: **Cloudflare R2**. Application runtime stays on **Vercel**. Public reads go through a River Aftercare route, not an R2 public bucket or custom domain. See [../architecture/CLINIC-ASSETS.md](../architecture/CLINIC-ASSETS.md) and [ADR 0022](../adr/0022-cloudflare-r2-is-clinic-asset-provider.md).

Do not put credentials in the repository.

## Production architecture

```text
browser
  -> https://assets.riveraftercare.com.au/clinics/<clinicId>/branding/<filename>
  -> River Aftercare / Vercel server route
  -> authenticated private R2 GetObject / HeadObject
```

Production facts:

- **Vercel remains authoritative DNS.** `riveraftercare.com.au`, `app.riveraftercare.com.au`, and `*.riveraftercare.com.au` already point at Vercel Production, so `assets.riveraftercare.com.au` is served by the same Next.js app.
- **The R2 bucket remains private.** Do not enable public access.
- **`r2.dev` remains disabled.** Do not turn on the r2.dev browsing/public URL.
- **No Cloudflare R2 custom domain.** Do not connect `assets.riveraftercare.com.au` (or any hostname) to the bucket.
- **No browser-direct uploads.** ADMIN uploads go clinic portal → Next.js server → `PutObject`. There are no presigned browser uploads.
- **Clinic branding is public-by-exact-key only.** Knowing `clinics/<clinicId>/branding/<uuid>.<ext>` is enough to fetch that image. There is no directory listing.
- **This bucket must not be used for private patient documents.** Future private files need a separate bucket, token, and auth model.

`assets` is a reserved tenant slug. Hostname routing must never treat `assets.riveraftercare.com.au` as a clinic tenant.

## 1. Cloudflare account / project prerequisites

1. Use the River Aftercare Cloudflare account that holds the private R2 bucket.
2. Confirm you can open **R2** in the dashboard.
3. Keep the public asset hostname out of application code. The app reads `CLINIC_ASSET_PUBLIC_ORIGIN`.
4. Next.js stays on Vercel. R2 is private object storage, not the app host and not the public CDN origin.

## 2. Create / confirm the R2 bucket

1. R2 → **Create bucket** if it does not already exist.
2. Production name: `river-aftercare-clinic-assets-prod` (must match `R2_BUCKET`).
3. Location: choose the jurisdiction/region appropriate for the practice data residency decision. Default to the account’s primary R2 location if none is set yet.
4. This bucket is **public-asset-only** clinic branding (logos / future small brand marks). Do **not** store private documents, patient files, or backups here.
5. Do **not** enable a general bucket listing/index. Objects are reachable only by exact key through the Vercel route.
6. Leave **r2.dev** disabled. Leave the bucket **private**. Do **not** attach an R2 custom domain.

## 3. Create a scoped R2 API token

1. R2 → **Manage R2 API Tokens** (or account API tokens with R2 object permissions).
2. Create a token for the application server only.
3. Restrict the token to **this bucket** when Cloudflare offers bucket scoping.

## 4. Least privileges

The application needs object **read, write, and delete** on `river-aftercare-clinic-assets-prod` only:

| Permission                      | Needed | Why                                                                    |
| ------------------------------- | ------ | ---------------------------------------------------------------------- |
| Object Read                     | Yes    | Authenticated private `GetObject` / `HeadObject` from the Vercel route |
| Object Write                    | Yes    | `PutObject` for ADMIN uploads                                          |
| Object Delete                   | Yes    | Best-effort delete on replace/remove                                   |
| Admin Read / Admin Read & Write | **No** | Would allow account-wide bucket admin                                  |
| Account-level Cloudflare admin  | **No** | Far too broad                                                          |

Do not grant account-wide R2 admin. Do not reuse this token for DNS, Workers, or other Cloudflare APIs.

Save:

- Access Key ID → `R2_ACCESS_KEY_ID`
- Secret Access Key → `R2_SECRET_ACCESS_KEY`
- Account ID → `R2_ACCOUNT_ID`

## 5. Public hostname `assets.riveraftercare.com.au`

Do **not** create an R2 custom domain. Do **not** change Vercel DNS in application PRs.

The public URL is a Vercel hostname:

`CLINIC_ASSET_PUBLIC_ORIGIN=https://assets.riveraftercare.com.au`

Public read is by object key only:

`https://assets.riveraftercare.com.au/clinics/<clinicId>/branding/<uuid>.<ext>`

The Next.js route `app/clinics/[clinicId]/branding/[filename]/route.ts` serves that path **only** when `Host` matches the hostname in `CLINIC_ASSET_PUBLIC_ORIGIN`. The same path on `riveraftercare.com.au`, `app.riveraftercare.com.au`, tenant subdomains, or an arbitrary `Host` header returns a generic empty 404.

The route sets:

```text
content-type: image/png | image/jpeg | image/webp | image/svg+xml
cache-control: public, max-age=31536000, immutable
x-content-type-options: nosniff
```

Do not add `Cross-Origin-Resource-Policy: same-origin` (clinic and staff hosts load the image cross-subdomain). Do not add CORS; these are normal `<img>` requests. CSP is not required for launch: SVG is sanitized and loaded only as `<img>`.

## 6. Application environment variables

Set on the **Vercel project / server** only (Production, and Preview if you want uploads there). Never `NEXT_PUBLIC_` for R2 credentials. This repository does not write those values.

```bash
CLINIC_ASSET_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=
R2_BUCKET=river-aftercare-clinic-assets-prod
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
CLINIC_ASSET_PUBLIC_ORIGIN=https://assets.riveraftercare.com.au
```

Optional:

```bash
# Only if you need a jurisdiction endpoint such as
# https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com
R2_S3_ENDPOINT=
```

When `R2_S3_ENDPOINT` is unset, the app derives `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

The browser never sees R2 credentials or the S3 endpoint. `ClinicProfile.logoUrl` stays an immutable object key, not a provider URL.

Redeploy after setting env so server processes see the values. Practice Upload / Replace / Remove appear only when this driver is configured.

## 7. Verify upload

1. Sign in as a clinic **ADMIN** (not STAFF).
2. Practice → Identity → choose a PNG/JPEG/WebP (≤2 MB) or SVG (≤1 MB) → **Upload logo**.
3. Confirm the UI shows **Uploaded** and a preview `<img>`.
4. Confirm `ClinicProfile.logoUrl` is a key `clinics/<clinicId>/branding/<uuid>.<ext>`, not a Cloudflare, r2.dev, or `assets.` URL.

## 8. Verify public read

1. Open the patient tenant homepage and a published guide.
2. The clinic mark must load from `CLINIC_ASSET_PUBLIC_ORIGIN` + key.
3. `curl -I` the object URL: HTTP 200, expected `Content-Type`, `X-Content-Type-Options: nosniff`.
4. Confirm a guessed directory URL (`/clinics/<clinicId>/branding/`) does **not** list the bucket.
5. Confirm the same path on the apex, `app.`, or a tenant host returns a generic 404.

## 9. Verify cache headers

```bash
curl -sI "https://assets.riveraftercare.com.au/clinics/<clinicId>/branding/<uuid>.png"
```

Expect:

```text
content-type: image/png
cache-control: public, max-age=31536000, immutable
x-content-type-options: nosniff
```

HEAD must not require downloading the object body from R2. Use GET in a browser if a CDN reports a misleading cache status.

## 10. Verify SVG

1. Upload a simple logo SVG.
2. Confirm it renders as `<img>`, not inline markup.
3. Confirm a hostile SVG (`<script>`, `onload`, `foreignObject`, `javascript:` href) is rejected or stripped by the server and never stored with active content.
4. Confirm `content-type: image/svg+xml`.

## 11. Verify replacement and deletion

1. **Replace:** upload a second file. The preview updates. The old key should be deleted from R2 (best-effort). A leftover old object is acceptable if delete fails; the clinic must still see the new logo.
2. **Remove:** ADMIN removes the logo. Patient UI falls back to the display name. No broken `<img>`.

## 12. Rollback

Application rollback (no Cloudflare teardown required):

1. On Vercel, unset `CLINIC_ASSET_STORAGE_DRIVER` (or set it away from `r2`) and redeploy.
2. Practice shows the storage-unavailable copy. Existing `logoUrl` keys will not resolve until origin+driver are restored; demo paths still work.
3. To restore service, put the same env back. Keys in the database remain valid because they are not provider URLs.

Infrastructure rollback:

1. Revoke the R2 API token.
2. Do not delete the bucket until you accept losing uploaded logos. Prefer token revoke + env unset.
3. Do not attach an R2 custom domain as a fallback. Keep the bucket private.

## Local development

- Automated tests: `CLINIC_ASSET_STORAGE_DRIVER=memory` (Playwright webServer and Vitest). Never hits Cloudflare.
- Same-origin fallback route: `/clinic-branding/<clinicId>/<filename>` for memory/test when `CLINIC_ASSET_PUBLIC_ORIGIN` is unset.
- Manual real-R2: optional development bucket + the same env names. Do not commit values.
- Do not require MinIO or a local filesystem fake of production.

## Storage class

`river-aftercare-clinic-assets-prod` = **PUBLIC-ASSET-ONLY**, delivered through a private bucket and a Vercel route. Future private assets use a separate bucket and token.
