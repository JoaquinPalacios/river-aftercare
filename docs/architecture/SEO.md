# Launch SEO, discovery, and structured data — River Aftercare

Phase 2B production-quality discovery layer. This remains a **structured clinical aftercare publishing platform**, not a generic CMS.

## Surfaces

| Surface                                                                     | Host                            | Index                 | Follow | Sitemap | Notes                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------- | --------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Marketing `/`, `/pricing`, `/contact`, `/about`                             | apex / `localhost`              | yes                   | yes    | yes     | Title, description, canonical, Open Graph, Twitter, generated JSON-LD.                                                                                 |
| Marketing `/privacy`, `/terms`                                              | apex / `localhost`              | **no** until approval | yes    | yes     | Public copy is published without a draft banner. Page-level `noindex, follow` until counsel/operator approval. Still listed in sitemap and `llms.txt`. |
| Marketing `/clinics`                                                        | apex / `localhost`              | yes                   | yes    | yes     | Clinic overview hub. Shared Organization / WebSite / SoftwareApplication plus route WebPage. Not a fifth vertical.                                     |
| Marketing `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics` | apex / `localhost`              | yes                   | yes    | yes     | Vertical acquisition pages. Shared Organization / WebSite / SoftwareApplication plus per-route WebPage. No FAQPage or MedicalWebPage.                  |
| `/llms.txt`                                                                 | apex                            | n/a                   | n/a    | no      | Agent-oriented public summary generated from identity + public routes, including `/clinics` and clinic vertical pages                                  |
| Staff portal `/dashboard`, `/guides`, `/practice`                           | `app.<root>`                    | no                    | no     | no      | Authenticated clinic chrome                                                                                                                            |
| Operator `/operator/*`                                                      | `app.<root>`                    | no                    | no     | no      | Includes SEO & Discovery                                                                                                                               |
| Authenticated draft preview                                                 | `app.<root>/guides/:id/preview` | no                    | no     | no      | Never a public canonical                                                                                                                               |
| Parked chairside `/display`, `/sessions`                                    | `app.<root>`                    | no                    | no     | no      | Existing anti-index posture                                                                                                                            |
| Tenant home and published guides                                            | `<clinic>.<root>`               | **no**                | yes    | **no**  | Shareable aftercare documents; clinic-first metadata; not SEO inventory                                                                                |
| Internal rewrites `/_marketing`, `/_sites`                                  | n/a                             | no                    | no     | no      | Blocked from the public Host                                                                                                                           |

Page-level Next.js `robots` metadata is the real noindex control. `robots.txt` is a crawl hint, not a substitute.

`robots.txt` allows public marketing paths and `/llms.txt`. It disallows authenticated/internal prefixes so those URLs are not advertised as crawl targets. Tenant patient pages are not disallowed (they live on clinic hosts at `/` and `/<slug>`), and they still emit `noindex, follow`.

## Sitemap lastmod

Sitemap `lastmod` is an explicit per-route calendar date on `DEFAULT_MARKETING_PAGE_SEO.lastModified`, not Prisma `updatedAt` and not sitemap generation or deploy time.

When materially changing a public marketing page, update its sitemap lastModified value.

Omit `lastModified` rather than publishing a knowingly false timestamp. Do not invent millisecond precision.

## Canonical URL policy

Canonical URLs are **derived**, not operator-editable:

```
production origin + route
```

Operators edit content metadata (title, description, social overrides). They do not edit routing truth. This prevents accidental SEO self-destruction.

## Data model

Structured Prisma configuration, not a `seo.json` CMS and not raw JSON-LD:

- `PlatformSeoSettings` — singleton identity (`siteName`, descriptions, public contact email, default OG path, factual `sameAs` URLs)
- `MarketingPageSeo` — per known marketing path

Code defaults from River Aftercare product constants keep public pages working when the settings row does not exist. Do not seed fake social profiles.

Fallback hierarchy for social tags:

```
page OG override
  → page SEO title/description
    → platform default
```

Missing optional values omit the tag. They do not render empty `og:image` or malformed meta.

## Operator: SEO & Discovery

Route: `/operator/seo`. Platform **OPERATOR** only. Clinic ADMIN / STAFF receive `notFound()`. Authorization is enforced in the layout **and** the server action.

Operators cannot paste HTML, scripts, `javascript:` / `data:` URLs, or raw JSON-LD. JSON-LD is generated from structured settings and shown read-only.

## Open Graph image

Ideal share card: **1200 × 630**. The approved logo/isologo is **not** a social card.

Operators upload the default social image from **SEO & Discovery**. The file is validated on the server (PNG / JPEG / WebP only, exact 1200 × 630, ≤ 2 MB), stored in private R2 under `platform/seo/<uuid>.<ext>`, and delivered at:

```text
Operator
  -> authenticated server-side upload
  -> private R2
  -> platform/seo/<immutable-key>
  -> https://assets.riveraftercare.com.au/platform/seo/<immutable-key>
  -> Vercel cached public exact-key delivery
```

`PlatformSeoSettings.defaultOgImagePath` remains the canonical persisted field. Uploads store a same-origin public path `/platform/seo/<uuid>.<ext>`. Metadata resolution prefixes `CLINIC_ASSET_PUBLIC_ORIGIN` so crawlers request the `assets.` host, not the apex. Page-specific `ogImagePath` overrides still win.

SVG is not accepted for this social image. The image is not resized or recompressed.

R2 stays private. r2.dev stays disabled. There is no R2 custom domain and no browser-direct or presigned upload. Platform OG images are public-by-exact-key only. Private patient documents must never use this mechanism.

Until an operator uploads a dedicated 1200 × 630 asset, diagnostics still show:

**DEDICATED RIVER AFTERCARE OG IMAGE STILL REQUIRED**

Organization JSON-LD `logo` uses the public isologo at a stable absolute URL (`/brand/river-aftercare-isologo.svg`), never localhost. That logo is not the social card.

## JSON-LD

Server-rendered, serialized with `<` escaped. Homepage graph:

- `Organization` `@id: <origin>/#organization`
- `WebSite` `@id: <origin>/#website` → `publisher` `#organization`
- `SoftwareApplication` `@id: <origin>/#application` — no ratings. Pricing page only attaches `Offer` nodes for Essential and Practice (monthly and yearly AUD). Do not emit `valueAddedTaxIncluded`. River Aftercare is not registering for GST at this stage. Group remains custom and is not a numeric public offer.
- `WebPage`

Pricing uses `WebPage` + the shared SoftwareApplication identity. Essential and Practice offers use `priceCurrency: AUD`. Do not emit `valueAddedTaxIncluded`, a tax rate, or a GST-included or GST-excluded claim. River Aftercare is not registering for GST at this stage. Do not publish a Group floor price, availability dates, or `InStock` inventively.

The `/clinics` hub and clinic acquisition pages (`/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics`) use `WebPage` with `mainEntity` pointing at the shared SoftwareApplication. They do not create per-profession organizations, ratings, FAQPage, or MedicalWebPage.

Contact uses `ContactPage`. About uses `AboutPage`.

`WebPage.name` uses the page SEO title. Open Graph title/description overrides are for social sharing only and must not leak into JSON-LD.

The document `<title>` is the SEO title. If that title already contains the site name, do **not** append `— River Aftercare` again. Marketing page metadata uses Next.js `{ absolute }` titles. The marketing layout title template is identity-preserving (`%s`) so it cannot double the brand.

Do not emit `MedicalWebPage`, `reviewedBy`, `lastReviewed`, `medicalAudience`, `aggregateRating`, fake addresses, founding dates, or invented `sameAs` profiles.

## Tenant / patient policy

Launch default is **private from search** (`PRIVATE_FROM_SEARCH`). Patient pages still need excellent:

- title
- description
- canonical (tenant hostname, never `/_sites`)
- Open Graph
- clinic identity

because patients share links.

Future `searchVisibility: PRIVATE_FROM_SEARCH | INDEXABLE` must not be added to Prisma until a clinic can opt a **published** guide in from a reviewed UI, after content and governance bars are met.

## Future organic content

Keep these separate. Do not collapse them:

| Surface                   | Example                                      | Role                                                           |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| White-label patient guide | `riversidedental.<domain>/extraction`        | Patient utility, noindex by default                            |
| River Aftercare editorial | `<domain>/guides/tooth-extraction-aftercare` | Potential indexable, clinically governed, acquisition-oriented |

The editorial library is **not** built in Phase 2B. Architecture must not prevent it.

## Implementation map

| Concern                | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform SEO load/save | `lib/seo/load-platform-seo.ts`, `lib/seo/save-platform-seo.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Resolution / fallbacks | `lib/seo/resolve-marketing-seo.ts`, `lib/seo/defaults.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| JSON-LD                | `lib/seo/json-ld.ts`, `lib/seo/serialize-json-ld.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Validation             | `lib/seo/validation.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| llms.txt               | `lib/seo/llms-txt.ts`, `app/llms.txt/route.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Sitemap / robots       | `lib/seo/sitemap.ts`, `app/sitemap.ts`, `app/robots.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Operator UI            | `app/(staff)/(operator)/operator/seo/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Platform OG assets     | `lib/platform-assets/*`, `app/platform/seo/[filename]/route.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Marketing metadata     | `lib/seo/marketing-page.ts`, `lib/marketing/metadata.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Tenant metadata        | `lib/aftercare/tenant-metadata.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Robots constants       | `lib/seo/robots-policy.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| HTML stripping         | `lib/seo/metadata-text.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Icon                   | River pack from `public/favicons/*` via `PRODUCT_HEAD_METADATA` on marketing, staff, and aftercare root layouts. There is no root `app/favicon.ico` / `app/icon.png` / `app/apple-icon.png` file convention and no root `public/favicon.ico`. Patient tenant guides override `icons` with the clinic `faviconUrl` when configured (PNG `rel="icon"` + `apple-touch-icon` only). Missing clinic favicon keeps the River pack. Tenant HTML may still include the River `/favicons/site.webmanifest`; that is not a tab-icon competitor. |
