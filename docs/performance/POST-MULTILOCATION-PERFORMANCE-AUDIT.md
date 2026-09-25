# Post-multi-location performance audit

Audit only. No product behaviour, schema, Stripe, caching, or multi-location changes are included in this branch.

Starting `main` SHA: `228f8568587ebe98af79c475e8e8d1f09fa45cef` (PR #100, multi-site and multi-location product).

Measured: 2026-09-25.

## 1. Executive summary

Patient pages are the performance problem. Marketing and logged-out staff login are not.

From a US runner, production `demodental` home, guide, and print returned in about **1.3–1.5 seconds to first byte**, every time, with `Cache-Control: private, no-store` and `x-vercel-cache: MISS`. The same route shapes on a local production build against PostgreSQL 18 were **20–70ms**. `EXPLAIN ANALYZE` on the lookup predicates finished in **under 0.1ms**. The database is not CPU-bound at a realistic multi-location size. The time is network round trips on an uncached dynamic render.

Each patient document loader issues many SQL statements because Prisma splits relation reads into separate queries (8 for a home list, 15 for one guide). Next.js then runs metadata and the page together, so those statements run again. An additional location home is the worst measured path: **41 SQL executes**, because `/{segment}` tries a root guide, misses, and then loads the location, and that whole sequence is duplicated.

Do not start with indexes or a shared cache. Indexes for slug and `(locationId, publicSlug)` already exist, and a shared cache can serve one account’s guide to another. The first code change should dedupe work **inside one request**. The first infrastructure check should confirm whether Vercel functions run in Sydney next to Neon, or in `iad1`. This audit cannot prove the Australian field number from a US probe.

Staff JavaScript is a separate, smaller issue. Login, password, and Sites & Locations pull Zod into the browser (about **388KB uncompressed**) because client components import modules that construct Zod schemas. Patient pages do not.

## 2. Scope

In scope: rendering, patient routes, staff portal, operator reads, Prisma/PostgreSQL behaviour, Neon connection use, tenant and placement resolution, client JavaScript, fonts, images, third parties, caching safety, and route waterfalls.

Out of scope, and not implemented here: Group/Practice split, operator-assisted account splitting, Stripe add-ons, annual Group pricing, downgrade UX, R2 key migration, slug redirects, new indexes, and any behaviour change.

## 3. Environment and method

| Source                 | What it is                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production HTTP        | 5 sequential requests per public route, plus 2 health probes and 1 `www` redirect. No concurrency, no writes, no tenant crawl. Only `riveraftercare.com.au`, `app.riveraftercare.com.au`, and `demodental.riveraftercare.com.au`. |
| Vantage                | This runner’s `x-vercel-id` was `iad1::iad1`. DNS and TLS were about 1ms and 20ms. The measured TTFB is server time from that edge, not a Sydney lab.                                                                             |
| Local production build | `next build` (Next.js 16.3.5, Turbopack) on Node 24.21.0. Route table and `.next/diagnostics/route-bundle-stats.json`.                                                                                                            |
| Local database         | PostgreSQL 18.6 in Docker (`postgres:18-alpine`), disposable database `care_guide_perf_audit`.                                                                                                                                    |
| Query counts           | Prisma query events for one loader call, then PostgreSQL `log_statement=all` around real `next start` requests. Logging was turned back off afterwards.                                                                           |
| Plans                  | `EXPLAIN (ANALYZE, BUFFERS)` after `ANALYZE`, on the audit fixture.                                                                                                                                                               |
| Not measured           | Lighthouse, LCP, CLS, INP, authenticated production pages, production `EXPLAIN`, production row counts. Chrome is installed. Lighthouse is not a project dependency, and a US lab score would not be Australian field data.       |

Web vital **targets** (not measurements): LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.

## 4. Production-safe baseline

All successful document responses were HTTP 200, Brotli, `age: 0`, `x-vercel-cache: MISS`, and `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`. `www.riveraftercare.com.au` returned 308 to the apex in 59ms.

| Surface            | URL                                                         |   n | TTFB median (min–max) | Compressed body |    Uncompressed HTML |
| ------------------ | ----------------------------------------------------------- | --: | --------------------- | --------------: | -------------------: |
| Marketing home     | `https://riveraftercare.com.au/`                            |   5 | 327ms (304–1626)      |          16,776 |              114,639 |
| Pricing            | `https://riveraftercare.com.au/pricing`                     |   5 | 290ms (284–311)       |          14,068 |               98,932 |
| Staff login        | `https://app.riveraftercare.com.au/login`                   |   5 | 80ms (69–112)         |           4,890 |               18,617 |
| Patient root home  | `https://demodental.riveraftercare.com.au/`                 |   5 | 1,304ms (1,285–2,642) |     6,499–7,153 |               34,350 |
| Patient root guide | `https://demodental.riveraftercare.com.au/extraction`       |   5 | 1,513ms (1,480–1,520) |     8,800–9,454 |               50,298 |
| Patient root print | `https://demodental.riveraftercare.com.au/extraction/print` |   5 | 1,504ms (1,484–1,572) |     8,053–8,694 |               44,570 |
| DB health          | `https://app.riveraftercare.com.au/api/health`              |   2 | 300ms and 2,581ms     |              21 | `{ "status": "ok" }` |

The first marketing hit and the first health hit were the slow outliers. Patient guide and print then stayed near 1.5s on every sample, so that figure is not a one-off cold start.

`demodental` publishes one root guide (`/extraction`) and no additional location link. Additional location production URLs were not probed.

Local warm requests on the production build, same process, loopback PostgreSQL:

| Request                             | HTTP |            TTFB | SQL executes |
| ----------------------------------- | ---: | --------------: | -----------: |
| Practice root home                  |  200 |            50ms |           12 |
| Practice root guide                 |  200 |            48ms |           27 |
| Practice root print                 |  200 |            30ms |           27 |
| Additional location home (`/bondi`) |  200 | 73ms, then 24ms |           41 |
| Additional location guide           |  200 |            34ms |           30 |
| Additional location print           |  200 |            19ms |           30 |
| Marketing home                      |  200 |            51ms |            2 |
| Pricing                             |  200 |            19ms |            2 |
| Staff login, logged out             |  200 |            46ms |            0 |

## 5. Route inventory

`next build` marks almost every app route `ƒ` (dynamic). Static (`○`): `/robots.txt`, `/sitemap.xml`, `/forgot-password`, `/reset-password`, `/accept-invitation`, `/confirm-email-change`, `/_not-found`. There is no `generateStaticParams` and no route `revalidate` export. `unstable_cache`, `cacheTag`, and `"use cache"` are not used.

`proxy.ts` is database-free. Apex rewrites to `/_marketing`. `app.{root}` is the staff host. `{siteSlug}.{root}` rewrites to `/_sites/{slug}`. `assets.{root}` is reserved for branding and platform SEO files.

| Group            | Public paths                                                                                         | Runtime                                                                                                    | Auth                      | Database                 |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------ |
| Marketing        | `/`, `/pricing`, `/contact`, `/about`, legal, verticals                                              | Dynamic server render. Client motion shell. `headers()` for public links. Two SEO reads.                   | No                        | Yes, platform SEO        |
| Patient root     | `/`, `/{publicSlug}`, `/{publicSlug}/print`                                                          | `force-dynamic` tenant layout. Mostly Server Components.                                                   | No                        | Yes                      |
| Patient location | `/{locationSlug}`, `/{locationSlug}/{publicSlug}`, `.../print`                                       | Same layout. `/{segment}` tries a root guide, then a location. Nested guide and print live in `[...rest]`. | No                        | Yes                      |
| Staff auth shell | `/login` and token pages                                                                             | Login is dynamic and does not query when logged out. Token pages are static shells.                        | Session on product routes | Login: no, until submit  |
| Clinic portal    | `/dashboard`, `/guides`, editor, `/practice`, `/practice/sites`, `/practice/sites/[siteId]`, billing | Dynamic. Layout loads session, activation gate, and portal overview. `PortalChrome` is a client boundary.  | Staff                     | Yes                      |
| Operator         | `/operator/clinics`, clinic detail, team, SEO                                                        | Dynamic. Operator layout checks the platform role.                                                         | Operator                  | Yes                      |
| API              | `/api/auth/*`, `/api/health`, `/api/billing/status`, `/api/stripe/webhook`, `/api/ui-theme`          | Dynamic. Health is `SELECT 1` on the pooled client, staff host only, `no-store`.                           | Mixed                     | Yes, except theme cookie |
| Assets           | `/clinics/{clinicId}/branding/{file}`, platform SEO files                                            | Dynamic route handlers. `Cache-Control` is one year, immutable.                                            | No                        | Object storage           |

## 6. Web and runtime findings

**Patient routes are dynamic on purpose today, and the response is uncacheable.** `app/(aftercare)/%5Fsites/[tenant]/layout.tsx` exports `dynamic = "force-dynamic"`. `getClinicBySlug` is not wrapped in React `cache()`. The layout calls it from `generateMetadata`, `generateViewport`, and the layout body. The page calls its loader from `generateMetadata` and again from the page. Production therefore never hits the Vercel cache.

**Metadata and the page run the same loader in parallel, not once.** On a local home request the placement list, revision read, guide read, and template read each appeared twice at the same millisecond. Prisma batched some repeated `findUnique` calls (`ClinicSite.slug IN (...)`, entitlement `clinicId IN (...)`). It did not collapse the placement query. Parallel duplicates cost database work and connections. They do not always double wall time.

**Additional location home does a failed guide read first.** `app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page.tsx` calls `getPublishedPracticeGuide` and, on a miss, `listPublishedLocationGuides`. That is the correct disambiguation (a root guide wins over a location slug). It is expensive because both steps are heavy and both run for metadata and the page. Measured: 41 executes.

**Print uses the same guide loader as the HTML guide.** Root print was 27 executes, the same count as the guide. It is not a cheaper document.

**Marketing is dynamic for a small reason.** Each marketing page calls `headers()` via `marketingPublicLinks()` and reads two SEO rows (`loadPlatformSeoIdentity`, `loadMarketingPageSeo`), which React `cache()` dedupes inside the request only. Local marketing home was 2 SQL statements. Production TTFB was about 300ms, far below patient pages. Operator SEO saves already call `revalidatePath`. The pages still cannot be static while `headers()` runs.

**Staff login does no database work until submit.** Auth.js uses database sessions (`auth.ts` `strategy: "database"`). With no cookie, `/login` issued 0 SQL statements. That matches the 80ms production TTFB.

**Authenticated layout work is already request-deduped.** `getCurrentUser`, `getCurrentClinicMembership`, `getAuthContext`, and `getClinicPortalOverview` use React `cache()`. The clinic-portal layout and the page share them. This audit did not record an authenticated HTTP trace. From code, a signed-in request still does Auth.js session plus user, then `getCurrentUser` reads the user again, then one membership read, the activation-gate entitlement read, and the overview read, before the page’s own loaders. Do not remove those checks.

## 7. Database findings

Fixture used for counts and plans (not production volumes):

| Account               | Shape                                                                          |                                                      Guides | Placements |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------: | ---------: |
| Practice `perfdental` | 1 site, 5 locations (1 root + 4)                                               | 8, each with draft + 2 published revisions, 6 sections each |         24 |
| Group                 | 3 sites, 5 locations, shared placements, one detached copy, one unplaced guide |                                                           8 |         20 |
| Larger                | 1 site, 8 locations                                                            |                                                          12 |         48 |

Single loader invocation (not a full Next.js request):

| Loader                           | SQL statements |             Local wall | Notes                                     |
| -------------------------------- | -------------: | ---------------------: | ----------------------------------------- |
| Root home                        |              8 | 33ms first, then ~10ms | Same 8 on the 8-location account          |
| Root guide or print loader       |             15 |                16–22ms | Relation graph, not one SQL join          |
| Additional location home loader  |              8 |                   12ms | Full request is 41, not 8                 |
| Additional location guide loader |             15 |                 7–16ms |                                           |
| `getClinicBySlug`                |              3 |                    1ms | Site, clinic, root location               |
| Sites & Locations list           |              5 |                  2–5ms | Same 5 for the 8-location account         |
| Site detail                      |              5 |                    2ms | Calls the full account list, then filters |
| Guide editor                     |              5 |                    3ms | JSON about 2KB on this fixture            |
| Placement board                  |              7 |                  4–6ms | Group JSON 1.4KB; 8 locations 1.6KB       |
| Operator clinic list             |              4 |                    3ms | 3 clinics, about 700 bytes                |
| Operator clinic detail           |              6 |                    5ms | One clinic query plus nested reads        |
| Operator capacity                |              5 |                    3ms | Counts plus allowance plus site list      |

No loader showed an N+1 loop. Home stayed at 8 statements when locations went from 5 to 8 and guides from 8 to 12. That is a **current** round-trip cost and a **future** payload cost, not an N+1.

`EXPLAIN (ANALYZE, BUFFERS)` after `ANALYZE`, all on the fixture:

| Query                                           | Plan                                    | Actual time |
| ----------------------------------------------- | --------------------------------------- | ----------- |
| `ClinicSite.slug = $1`                          | Seq Scan, 1 buffer, 4 rows filtered     | 0.006ms     |
| Location `(clinicSiteId, slug)` active non-root | Seq Scan, 17 rows filtered              | 0.014ms     |
| Root location for a site                        | Seq Scan                                | 0.009ms     |
| Placement `(locationId, publicSlug)` enabled    | Seq Scan, 91 rows filtered              | 0.020ms     |
| Placement `(clinicId, publicSlug)` enabled      | Seq Scan, **5 rows** (one per location) | 0.019ms     |
| Active site count                               | Seq Scan + aggregate                    | 0.017ms     |
| Active location count joined to active sites    | Hash join, seq scans                    | 0.078ms     |
| `Clinic ORDER BY name`                          | Seq Scan + quicksort of 3 rows          | 0.024ms     |

The unique indexes exist (`ClinicSite_slug_key`, `ClinicLocation_clinicSiteId_slug_key`, `PracticeGuidePlacement_locationId_publicSlug_key`, `PracticeGuidePlacement_clinicId_idx`, partial unique root-per-site). The planner ignored them because the tables are one to three pages. That is the correct plan at this size. A new index would not move the 1.5s production TTFB.

`(clinicId, publicSlug)` is not unique: the practice fixture returned 5 enabled rows for one slug, one per location. The root guide query adds location and site predicates in SQL (`LEFT JOIN` plus `servesSiteRoot`, site slug, and published-revision `EXISTS`). It does not use `locationId` as the access key, so the `(locationId, publicSlug)` unique index is not the access path for root reads. Still cheap here.

Guide editor `include`s every `contentRevisions` row and its sections (`loadPracticeGuideEditor`). Three revisions were about 2KB JSON. A guide with a long published history will grow that read. That is a scaling concern, not a current incident.

Operator listing loads every clinic, primary site, root location, and every guide’s status in one nested read, with no pagination (`listOperatorClinics`). Three clinics were trivial. Hundreds of accounts with full guide lists would not be.

## 8. Multi-location findings

Resolution order is hostname → `ClinicSite.slug` → root or additional `ClinicLocation` → enabled `PracticeGuidePlacement` → pinned `PracticeGuideRevision`, or the canonical template pin when the clinic pin is null. `Clinic.slug` is not a fallback.

| Path                                | What the request did locally                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Root home                           | 12 statements. Site lookup batched across the layout and the two list calls. Placement list executed twice. |
| Root guide and print                | 27 statements. Guide relation reads duplicated. Print is not shorter.                                       |
| Additional location home            | 41 statements. Failed root-guide resolution plus location list, duplicated.                                 |
| Additional location guide and print | 30 statements.                                                                                              |

Placement enable, “Use latest”, and detached copy were not timed. From code, `setGuideAvailableAtLocation` and `detachPlacementGuide` keep their writes inside a transaction. Detached copy reads the source placement with sections, creates a guide and two revisions, and moves one placement. It is staff-initiated and not on the patient path. No change recommended until patient render is cheaper.

`getAccountSite` loads every site and location for the account, then picks one in memory (`list-account-sites.ts`). At 3 sites that was the same 5 statements as the list. It becomes wasteful only as a group’s site tree grows.

The guide editor placement board loads the guide’s placements and then every site and location for the account (2 application queries, 7 SQL statements after Prisma splitting). It does not query per location. JSON stayed under 2KB at 8 locations. Re-render behaviour on one toggle was not profiled. The board is a client component; a toggle calls a server action and `revalidatePath`s the editor. That is correct and not a measured hotspot.

## 9. Client bundle findings

First-load JavaScript from the production build, uncompressed, with gzip -9 of the chunks summed (a lower bound, not the wire size of one request):

| Route                                |  Uncompressed | gzip -9 sum | Page-specific extra beyond the shared runtime |
| ------------------------------------ | ------------: | ----------: | --------------------------------------------: |
| Patient home                         |         666KB |      ~206KB |                                         ~44KB |
| Patient guide, location guide, print |         670KB |      ~207KB |                                         ~48KB |
| Marketing home                       |         830KB |      ~251KB |                      ~208KB, including motion |
| Marketing contact                    |         817KB |      ~248KB |                   motion plus Turnstile chunk |
| Staff login                          |       1,083KB |      ~305KB |                           **388KB Zod chunk** |
| Guide editor                         |         751KB |      ~233KB |              ~50KB editor chunk, no Zod chunk |
| Practice settings                    |       1,197KB |      ~340KB |              Zod chunk plus other form chunks |
| Sites list and site detail           | 1,094–1,121KB |  ~309–316KB |                     Zod chunk via slug helper |
| Operator clinic list                 |         695KB |      ~217KB |                                         small |
| Dashboard                            |         701KB |      ~218KB |                                         small |

The shared root files are about 622KB before any page code. Patient page code is not the bulk of the patient bundle. A large root chunk (`1iaha0zb6-kf9.js`, 371KB) contains the Sentry browser SDK. Stripe and Turnstile strings in that file are the Sentry denylist, not those SDKs.

Zod reaches the browser through value imports:

- `app/(staff)/login/login-form.tsx` imports `loginSchema` from `login-schema.ts`, which imports `zod`. The same pattern is on forgot-password, reset-password, and accept-invitation.
- `lib/aftercare/slug.ts` constructs `careGuideSlugSchema` with Zod at module scope. `lib/clinics/slug-suggestion.ts` imports `isValidCareGuideSlug` from that module. `create-site-form.tsx` and `site-manager.tsx` import the suggester, so Sites & Locations ship Zod.
- `practice-members-section.tsx` imports `INVITED_NAME_MAX_LENGTH` from `lib/operator/clinic-invitation-input.ts`, which also imports Zod and builds a schema. Practice settings picks up that module.

`@prisma/client` enums imported from client components (`ClinicMembershipRole` in `practice-members-section.tsx`) pull generated field names, including `stripeCustomerId`, into a ~57KB practice chunk. Those are names, not secrets. They do not belong in the browser bundle.

Guide editor JavaScript is modest next to the shared runtime. QR code (`qrcode`) is server-only (`render-guide-qr.ts`) and is not in the client graph. Stripe (`stripe` package) is server-only and is not in patient or staff client graphs.

Patient interactive leaves are small: theme control (only when the site allows it), demo tabs, and print’s `window.print()` button. Branding CSS variables are server-rendered in the layout. Theme does not require a client component unless the toggle is on.

## 10. Asset and font findings

**Fonts.** Geist is on every root layout. Staff also loads Geist Mono. Clinic typefaces (Open Sans, Roboto, Montserrat, Lato, Poppins, Inter) use `next/font` with `preload: false` and `display: "swap"`. The patient CSS chunk that contains them had **112 `@font-face` rules** and was about **59KB** in this build. Production patient HTML preloaded stylesheets and did not preload a clinic WOFF2. Unused family files are not downloaded. The CSS catalogue for all six families is still sent to every patient page. Marketing and staff production responses preloaded Geist WOFF2 on login; patient responses did not.

**Images.** Application code uses `<img>`, not `next/image`. Marketing images in `public/` are small (phone frame WebP 20KB, wordmark SVG 15KB). The production `demodental` logo is an SVG of **420 bytes** at `assets.riveraftercare.com.au`, `content-type: image/svg+xml`, `cache-control: public, max-age=31536000, immutable`. Two sequential requests both returned `x-vercel-cache: MISS` and `age: 0`. The handler reads the request, so it is dynamic, and the CDN did not store it. The demo file is tiny. A 2MB PNG logo would repeat that origin fetch. The object key is `clinics/{clinicId}/branding/{uuid}.{ext}`, which is a safe cache key if the CDN is allowed to store it later. Do not change R2 keys.

Patient documents set no OG image. Marketing OG is a separate platform asset.

## 11. Third-party findings

| Library                             | Where it runs                                                                                                             | Patient browser?                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sentry `@sentry/nextjs`             | Server instrumentation and the shared client chunk. `tracesSampleRate: 0`, `maxBreadcrumbs: 0`, replay off, PII stripped. | SDK ships. Tracing does not.                                                                                  |
| Vercel Analytics and Speed Insights | All three root layouts, client.                                                                                           | Yes.                                                                                                          |
| Cloudflare Turnstile                | Marketing contact form only. Script is the explicit-render API.                                                           | No.                                                                                                           |
| Stripe SDK                          | `lib/billing/*`, `server-only`. Checkout and portal are redirects.                                                        | No.                                                                                                           |
| Resend                              | Server mailers, `serverExternalPackages`.                                                                                 | No.                                                                                                           |
| `qrcode`                            | Staff QR route, server-only.                                                                                              | No.                                                                                                           |
| `motion`                            | Marketing client components, `LazyMotion` / `domAnimation`.                                                               | No. The practice chunk that matched the word “motion” is `prefers-reduced-motion` scrolling, not the library. |

Do not remove Sentry or Analytics to chase a lab score. A later change could load the Sentry browser SDK only from error boundaries. That is a monitoring tradeoff, not a quick win.

## 12. Caching analysis

Nothing in the patient, staff, or operator data path uses a shared data cache. `revalidatePath` after mutations only matters if a route was cached. Today those routes are dynamic, so the calls do not hide stale tenant data, and they also do not make the pages fast.

| Data                          | Current cache                                              | Safe shared cache?                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Hostname → site               | None. Per request. Layout repeats it.                      | Only with the site slug in the key, and only if inactive sites cannot be served from an old entry. Prefer request `cache()` first.             |
| Guide HTML                    | None. `no-store`.                                          | Only with host, location slug, public slug, placement enabled flag, and pinned revision id. A newer published revision must not replace a pin. |
| Branding and location contact | Read with the site/location on every request.              | Same identity key as the page. Contact details are tenant data.                                                                                |
| Staff and operator            | Dynamic, private. Auth uses database sessions.             | No. Do not put these in a shared or CDN cache.                                                                                                 |
| Auth session                  | Database strategy, request-deduped in River’s helpers.     | No.                                                                                                                                            |
| Marketing SEO                 | Two reads per request, deduped inside the request.         | Possible later as ISR, keyed by marketing path, not by tenant. `headers()` blocks that today.                                                  |
| Branding bytes                | `Cache-Control` immutable, CDN still MISS on two requests. | Path already contains `clinicId` and an immutable file name. CDN storage is reasonable after a cache-key check.                                |
| Health                        | `no-store`.                                                | Must stay uncached.                                                                                                                            |

React `cache()` is per request. It is not a cross-tenant store. Wrapping `getClinicBySlug`, `listPublishedPracticeGuides`, `listPublishedLocationGuides`, and `getPublishedPracticeGuide` is safe if every argument that changes the result is part of the call (site slug, location slug, public slug). It must not key only on public slug.

Rejected: one global `unstable_cache` for “the published guide”, any cache of staff or operator payloads, and caching a page by path alone on a shared host.

## 13. Current issues

### P1. Patient TTFB is about 1.5s from this vantage, on an uncached dynamic render

- **Severity:** High
- **Class:** Current performance issue for requests executed in `iad1`. Australian field impact is unconfirmed.
- **Evidence:** Production median TTFB 1,304ms home, 1,513ms guide, 1,504ms print, all `x-vercel-cache: MISS`. Local equivalents 19–73ms. Health `SELECT 1` was 300ms when warm from the same runner.
- **Surface:** patient, infrastructure
- **Impact:** TTFB, and therefore LCP on server-rendered HTML
- **Effort:** The region check is small. Query reduction is medium.
- **Risk:** Low for measurement. Medium if the function region is changed without a dashboard review.

### P2. Additional location home performs a failed guide lookup, twice

- **Severity:** High as query count. Not a local latency incident (73ms).
- **Class:** Current. It becomes user-visible when each statement pays a regional round trip.
- **Evidence:** 41 SQL executes for `/bondi`. Code in `[guideSlug]/page.tsx` calls `getPublishedPracticeGuide` then `listPublishedLocationGuides`, from both metadata and the page.
- **Surface:** patient, database
- **Impact:** query count, DB round trips, TTFB
- **Effort:** Small for request dedupe. Medium if the miss path is narrowed. The guide-versus-location order must stay.
- **Risk:** Medium if the miss path is removed. Low if the only change is request-level dedupe.

### P3. Guide and print duplicate a 15-statement loader

- **Severity:** Medium
- **Class:** Current query duplication. Local wall time still under 50ms.
- **Evidence:** One `getPublishedPracticeGuide` call is 15 statements. A full guide or print request is 27. Home is 8 per call and 12 per request, with four statement shapes doubled.
- **Surface:** patient, database
- **Impact:** query count, connection use, TTFB under latency
- **Effort:** Small (`cache()`).
- **Risk:** Low, with the keying rule in section 12.

### P4. Zod is in the staff client bundle

- **Severity:** Medium
- **Class:** Current, staff only.
- **Evidence:** 388KB chunk on `/login` (1,083KB first load), practice settings (1,197KB), and Sites & Locations. Import chain cited in section 9. Patient first load does not include that chunk. Guide editor does not either.
- **Surface:** staff
- **Impact:** JS size on login and practice admin
- **Effort:** Small
- **Risk:** Low if server-side validation stays

### P5. Immutable branding responses were not CDN-cached

- **Severity:** Low
- **Class:** Current, small for the 420-byte demo SVG. Relevant for larger logos.
- **Evidence:** Two GETs, both `x-vercel-cache: MISS`, `age: 0`, despite `public, max-age=31536000, immutable`.
- **Surface:** patient, infrastructure
- **Impact:** repeat origin and R2 reads for logos
- **Effort:** Small to investigate, medium to change cache behaviour safely
- **Risk:** Low if the URL stays `clinicId` + immutable file name

## 14. Scaling risks

These are not current incidents.

| Risk                                                           | Why it is not an incident now                            | When it matters                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Operator clinic list has no pagination and selects every guide | 3 clinics, 4 statements, ~700 bytes                      | Large customer counts                                             |
| Guide editor loads every revision and its sections             | 3 revisions, ~2KB                                        | Long publish history                                              |
| Site detail lists the whole account tree                       | 5 statements at 3 sites and at 8 locations               | Many sites per group                                              |
| Placement `(clinicId, publicSlug)` matches every location      | 5 rows, 0.02ms                                           | Large placement tables, if the root query cannot use `locationId` |
| Sequential scans                                               | Sub-millisecond at fixture size, indexes already present | Only after a production-sized `EXPLAIN` shows real cost           |
| Advisory lock scope                                            | One account, transaction-scoped, DB-only body            | Concurrent site/location creates in one account                   |
| Detached copy writes several rows in one transaction           | Staff action, not patient render                         | Very large guides                                                 |

## 15. Quick wins

Only items with direct evidence. Do not implement them in this branch.

1. **Request-scoped dedupe of patient loaders.** Wrap `getClinicBySlug`, `listPublishedPracticeGuides`, `listPublishedLocationGuides`, and `getPublishedPracticeGuide` in React `cache()`. Arguments must include every slug that changes the result. This removes the doubled placement and guide reads. It does not create a shared cache.
2. **Keep Zod out of client modules.** Move `isValidCareGuideSlug` to a module that does not import Zod. Stop importing schema modules from client components for a single constant (`INVITED_NAME_MAX_LENGTH`, login `safeParse`). Validate on the server, which already does. Expected drop is about 388KB uncompressed on login and site admin.
3. **Stop importing `@prisma/client` enums into client components.** Pass `'ADMIN' | 'STAFF'` from a tiny module so practice settings do not ship generated field names.

## 16. Structural improvements

1. **Confirm Vercel function region against Neon in Sydney.** The repo sets no `regions`. This probe executed in `iad1`. If production functions are pinned to `iad1`, moving them to `syd1` is the largest TTFB change available and should happen before query micro-optimisation. If they already follow the visitor, the 1.5s number is a US-visitor figure and Australian TTFB is closer to the local 20–70ms plus Sydney Neon latency. Use Vercel Speed Insights field data or one Sydney probe. Do not change region inside an application PR without that confirmation.
2. **Fewer SQL statements per guide read.** Prisma emitted separate statements for site, clinic, location, placement, revision, sections, guide, template, overrides, and additions. A narrower `select` or one SQL statement would cut round trips after dedupe. Do this only with the same predicates and the same pin rule (null pin stays on the canonical template; a newer clinic revision is not substituted).
3. **Location-home miss path.** After dedupe, `/bondi` still runs a full guide lookup that returns nothing. A cheaper existence check, still ordered so a real root guide wins, would cut the 41-statement request further. Slug collision rules in `lib/clinics/slug-collisions.ts` must keep working.
4. **Marketing ISR, separate from patient caching.** Remove the `headers()` dependency from marketing render, or pass the origin another way, and let the existing SEO `revalidatePath` flow apply. Do not reuse that strategy on tenant hosts.
5. **CDN storage for immutable branding URLs**, after proving the cache key is the path (clinic id + file name) and that a replaced logo uses a new file name. No R2 migration.
6. **Optional font CSS split** so a site using Inter does not download `@font-face` rules for the other five families. `preload: false` already avoids unused WOFF2 downloads. This is secondary.
7. **Operator pagination** when account count grows. Not justified by current data.

## 17. Recommended PR sequence

1. **PR 0 — confirm function region (no application change unless the dashboard is wrong).** Compare Vercel project region with Neon `ap-southeast-2`. If functions run in `iad1` for Australian patients, schedule a region change as its own change and remeasure `demodental` TTFB before writing more code.
2. **PR A — request-level patient loader dedupe.** React `cache()` only. No `unstable_cache`, no `Cache-Control` change, no removal of `force-dynamic`. Add a test that two calls in one request share one site lookup. Re-run the audit script’s HTTP counts and expect home below 12 and location home well below 41.
3. **PR B — staff client Zod and Prisma enum split.** Login, password forms, slug helper, invitation constants. No patient behaviour change. Compare `route-bundle-stats.json` for `/login`, `/practice`, and `/practice/sites`.
4. **PR C — reduce statements inside `getPublishedPracticeGuide` and the location-home miss path.** One PR if the miss path stays obviously correct; otherwise split. Keep pin and collision behaviour. Re-measure statement counts.
5. **PR D — branding CDN cache investigation.** Only if a repeated request still misses. Do not change object keys.
6. **PR E — marketing static or ISR.** Separate from patient caching. Re-measure marketing TTFB and confirm tenant hosts stay `no-store`.

Do not open an index PR from this audit.

## 18. Items deliberately not recommended

- Shared or CDN cache of patient HTML, staff HTML, or operator HTML.
- Caching by public slug, guide id, or path without site and location.
- Removing `force-dynamic` from the tenant layout in the same change as dedupe.
- New indexes on the current fixture evidence.
- Removing advisory locks, shortening them across R2 calls (R2 is already outside these transactions), or making capacity checks lock-free.
- Dropping Sentry, Analytics, or Speed Insights.
- Rewriting print onto a different document model before dedupe. Print’s extra cost is the shared loader, not a second renderer.
- Optimising detached copy, operator pagination, or editor revision history before patient round trips.
- `next/image` migration. Current marketing files are already small.
- Any Stripe, entitlement, or multi-location behaviour change.

## 19. Measurement limitations

- Production numbers are from one US runner (`iad1`), five sequential samples, one demo tenant. They are not CrUX or Speed Insights field data.
- No Lighthouse, LCP, CLS, or INP.
- No authenticated production session, and no local authenticated HTTP trace. Staff and operator figures are loader counts plus the client build.
- `demodental` has no additional location, so location routes were measured only locally.
- Bind parameters were not logged. The `IN ($1..$5)` site lookup is consistent with five concurrent calls for the request tenant. This audit did not print the parameter values.
- `EXPLAIN` used a small fixture. Sequential scans there do not describe a large production table. Production row counts were not queried.
- Local TTFB includes a warm Node server on the same machine as Postgres. It is a query-count instrument, not a hosting benchmark.
- Chunk hashes are from this build. Production hashes differ. Sizes are the comparison.

## 20. Appendix

### Reproduce the query baseline

Local PostgreSQL only. The script drops and recreates `care_guide_perf_audit`. It refuses a non-loopback host. It is not part of `pnpm test`.

```bash
pnpm exec vitest run --config scripts/audit/vitest.config.ts
```

### Production response notes

Patient and marketing `link` headers preloaded CSS only (patient) or CSS plus Geist WOFF2 (staff login). Patient HTML referenced 13–14 script files and 3 stylesheets. Marketing referenced 16 scripts and 4 stylesheets. `demodental` home linked only `/extraction`.

### Connection and locks

Runtime Prisma uses pooled `DATABASE_URL` through one `PrismaPg` client per process (`getPrisma`). `DIRECT_URL` is the Prisma CLI / trusted migration path only. Patient reads do not open a new client per call. This audit found no R2, fetch, or email inside `lockClinicSiteLocationCapacity` transactions. Publish attestations and capacity counts stay in the database transaction. Do not widen those transactions with network calls, and do not drop the lock.

### Auth

Database sessions. Logged-out `/login` is 0 SQL statements. Signed-in helpers are request-cached. Auth.js still loads the user for the session, and `getCurrentUser` loads the user again. That duplicate is one indexed primary-key read. Leave it until patient round trips are fixed.

### Build route table

`pnpm build` on this SHA: marketing, patient, staff product, operator, and API routes are dynamic. Robots and sitemap are static. Patient tenant layout is `force-dynamic`.
