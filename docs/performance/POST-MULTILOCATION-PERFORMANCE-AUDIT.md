# Post-multi-location performance audit

Audit only. No product behaviour, schema, Stripe, caching, or multi-location changes are included in this branch.

Starting `main` SHA: `228f8568587ebe98af79c475e8e8d1f09fa45cef` (PR #100, multi-site and multi-location product).

Measured: 2026-09-25 (before the Sydney pin).

**Status, 2026-09-25, after production deploy of `9b028f1`:** Function execution region is `syd1`. Region mismatch: **RESOLVED**. Sections 1–16 and the production baseline in section 4 are the pre-change record. After numbers, the health comparison, and the revised sequence are in [Sydney Region Post-Deployment Measurement](#sydney-region-post-deployment-measurement).

**Status, staff JavaScript:** the Zod and Prisma client-import split is measured in [Staff client bundle split](#staff-client-bundle-split). Login first-load JavaScript fell from 1,082,709 bytes to 695,120 bytes. The 387,769-byte Zod chunk and the 57,465-byte Prisma field chunk are absent from the production client graph. Patient routes did not grow.

## 1. Executive summary

Patient pages are the performance problem. Marketing and logged-out staff login are not.

From a US runner, production `demodental` home, guide, and print returned in about **1.3–1.5 seconds to first byte**, every time, with `Cache-Control: private, no-store` and `x-vercel-cache: MISS`. The same route shapes on a local production build against PostgreSQL 18 were **20–70ms**. `EXPLAIN ANALYZE` on the lookup predicates finished in **under 0.1ms**. The database is not CPU-bound at a realistic multi-location size. The time is network round trips on an uncached dynamic render.

Each patient document loader issues many SQL statements because Prisma splits relation reads into separate queries (8 for a home list, 15 for one guide). Next.js then runs metadata and the page together, so those statements run again. An additional location home is the worst measured path: **41 SQL executes**, because `/{segment}` tries a root guide, misses, and then loads the location, and that whole sequence is duplicated.

Do not start with indexes or a shared cache. Indexes for slug and `(locationId, publicSlug)` already exist, and a shared cache can serve one account’s guide to another. The first change is infrastructure: production functions that served this audit executed in `iad1` (US East), and the production Neon database is recorded in AWS Asia Pacific 2 (Sydney). Colocate functions in a single `syd1` region, redeploy, and repeat these measurements before deduping loaders. Detail is in [Function / Database Region Investigation](#function--database-region-investigation).

Staff JavaScript is a separate, smaller issue. Login, password, and Sites & Locations pull Zod into the browser (about **388KB uncompressed**) because client components import modules that construct Zod schemas. Patient pages do not.

## 2. Scope

In scope: rendering, patient routes, staff portal, operator reads, Prisma/PostgreSQL behaviour, Neon connection use, tenant and placement resolution, client JavaScript, fonts, images, third parties, caching safety, and route waterfalls.

Out of scope, and not implemented here: Group/Practice split, operator-assisted account splitting, Stripe add-ons, annual Group pricing, downgrade UX, R2 key migration, slug redirects, new indexes, and any behaviour change.

## 3. Environment and method

| Source                 | What it is                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production HTTP        | 5 sequential requests per public route, plus 2 health probes and 1 `www` redirect. No concurrency, no writes, no tenant crawl. Only `riveraftercare.com.au`, `app.riveraftercare.com.au`, and `demodental.riveraftercare.com.au`. |
| Vantage                | This runner reached Vercel in `iad1`. The function region on the same header was also `iad1`. DNS and TLS were about 1ms and 20ms. See [Function / Database Region Investigation](#function--database-region-investigation).      |
| Local production build | `next build` (Next.js 16.3.5, Turbopack) on Node 24.21.0. Route table and `.next/diagnostics/route-bundle-stats.json`.                                                                                                            |
| Local database         | PostgreSQL 18.6 in Docker (`postgres:18-alpine`), disposable database `care_guide_perf_audit`.                                                                                                                                    |
| Query counts           | Prisma query events for one loader call, then PostgreSQL `log_statement=all` around real `next start` requests. Logging was turned back off afterwards.                                                                           |
| Plans                  | `EXPLAIN (ANALYZE, BUFFERS)` after `ANALYZE`, on the audit fixture.                                                                                                                                                               |
| Not measured           | Lighthouse, LCP, CLS, INP, authenticated production pages, production `EXPLAIN`, production row counts. Chrome is installed. Lighthouse is not a project dependency, and a US lab score would not be Australian field data.       |

Web vital **targets** (not measurements): LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.

## Function / Database Region Investigation

Checked 2026-09-25. No region setting, deployment, Neon project, or application code was changed. Vercel CLI was not installed and no `VERCEL_TOKEN` was present, so the project dashboard was not read. This environment’s `DATABASE_URL` is local PostgreSQL, so production Neon was not queried.

### What `iad1::iad1` means

Vercel documents `x-vercel-id` on both the request and the response as the list of regions the request hit, plus the region where the function executed, for Edge and Serverless. Source: [Request headers](https://vercel.com/docs/headers/request-headers) and [Response headers](https://vercel.com/docs/headers/response-headers).

Vercel’s `@vercel/functions` parser treats the value as `region::id` or `region1:region2:...::id`, and uses the first region as the edge that received the request (`geolocation().region`). Source: [`packages/functions/src/headers.ts`](https://github.com/vercel/vercel/blob/22ae14af/packages/functions/src/headers.ts).

Every production response in the follow-up probe had three `::` segments: `iad1`, `iad1`, and a request id. The request id is omitted here. `iad1` is Washington, D.C., USA (`us-east-1`) on the [region list](https://vercel.com/docs/regions). The first `iad1` is the edge that accepted this US probe. The second `iad1` is the function execution region: the documented header includes that region, and `syd1` does not appear. A public Vercel trace with the same shape pairs `fra1::iad1::<id>` with execution in `iad1` ([next.js#56447](https://github.com/vercel/next.js/issues/56447)). River Aftercare responses did not include `x-vercel-execution-region`.

`iad1` on the first segment describes where this probe entered the network. It does not describe an Australian visitor’s nearest edge. The second segment describes where the function ran for that request.

### Repository configuration

At audit time there was no `vercel.json`, `vercel.ts`, or `.vercel` project link. `next.config.ts` sets no region. No route exports `preferredRegion`, `regions`, or `runtime = "edge"`. The only `runtime = "nodejs"` exports are `app/api/stripe/webhook/route.ts` and `app/api/billing/status/route.ts`. Patient, marketing, staff, and operator routes have no region override. No Fluid Compute key is set in the repo. The later pin is [Function region pin](#function-region-pin). Route files stay without a region override.

With no `regions` key, function placement is the Vercel project setting, or the platform default when that setting was never changed. New projects default to a single region, `iad1` ([Configuring regions](https://vercel.com/docs/functions/configuring-functions/region)).

### Vercel project settings

Not readable from this environment. Joaquín can confirm the live value at:

**Vercel → River Aftercare project → Settings → Functions → Function Regions**

Also on that page: the Fluid Compute toggle, and whether Preview uses the same region. Fluid Compute has been the default for new projects since 23 April 2025 ([Fluid compute](https://vercel.com/docs/fluid-compute)). This audit did not read whether this project has it on. Fluid’s own defaults do not set a region. When Fluid is on, a `vercel.json` region overrides the dashboard, and the dashboard overrides Fluid defaults.

### Observed production execution

Two sequential GET passes, no concurrency, from the same US runner. `server-timing` was absent. `x-vercel-execution-region` was absent. Every `x-vercel-id` was `iad1::iad1::<request id>`.

| Surface        | URL                                                         | Pass | Status |    TTFB | `x-vercel-cache` | `cache-control`                                           |
| -------------- | ----------------------------------------------------------- | ---: | -----: | ------: | ---------------- | --------------------------------------------------------- |
| Marketing home | `https://riveraftercare.com.au/`                            |    1 |    200 | 1,764ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Patient home   | `https://demodental.riveraftercare.com.au/`                 |    1 |    200 | 2,575ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Patient guide  | `https://demodental.riveraftercare.com.au/extraction`       |    1 |    200 | 2,738ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Patient print  | `https://demodental.riveraftercare.com.au/extraction/print` |    1 |    200 | 2,837ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| DB health      | `https://app.riveraftercare.com.au/api/health`              |    1 |    200 | 1,525ms | `MISS`           | `no-store`                                                |
| Marketing home | same                                                        |    2 |    200 |   302ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Patient home   | same                                                        |    2 |    200 | 1,318ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Patient guide  | same                                                        |    2 |    200 | 1,502ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Patient print  | same                                                        |    2 |    200 | 1,513ms | `MISS`           | `private, no-cache, no-store, max-age=0, must-revalidate` |
| DB health      | same                                                        |    2 |    200 |   267ms | `MISS`           | `no-store`                                                |

Pass 2 matches the earlier five-sample patient medians (home 1,304ms, guide 1,513ms, print 1,504ms). The function region was `iad1` on marketing, patient, print, and health alike.

`/api/health` runs one pooled `SELECT 1` (`lib/health/ping-application-database.ts`) and returns `{ "status": "ok" }`. Its warm TTFB was 267ms. That is one database round trip plus function time, from `iad1`.

### Neon production region

Recorded production facts, from the live project and the 20 September 2026 recovery drill:

| Source                                                                   | Recorded region                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [docs/launch/NEON-RECOVERY.md](../launch/NEON-RECOVERY.md)               | PostgreSQL 18, AWS Asia Pacific 2 (Sydney)                                   |
| [docs/launch/PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md) | River Aftercare Production, branch `production`, AWS Asia Pacific 2 (Sydney) |

No Neon API credential was available, and this session did not open a production connection. Joaquín can confirm the console field: **Neon Console → project River Aftercare Production → branch `production` → region**, which the runbooks record as AWS Asia Pacific 2 (Sydney) / `ap-southeast-2`.

### Latency reference

Neon’s public regional benchmark times `SELECT 1` from a Vercel function pinned to each region, over HTTP, and publishes the 30-day mean. Read on 2026-09-25 from [neon.com/demos/regional-latency](https://neon.com/demos/regional-latency) ([method](https://github.com/neondatabase-labs/latency-benchmarks)):

| From          | To Neon `ap-southeast-2` | Hot mean | Cold mean |
| ------------- | ------------------------ | -------: | --------: |
| Vercel `iad1` | Sydney                   |  214.9ms | 1,352.5ms |
| Vercel `syd1` | Sydney                   |    9.9ms |   713.3ms |

These cells use Neon’s HTTP driver against empty benchmark databases. River Aftercare uses `PrismaPg` and `pg` over the pooled TCP connection. Treat the table as the shape of the network, not as a measurement of this app. Vercel’s own guidance is to run functions in the same region as the database ([regions](https://vercel.com/docs/regions), [configuring regions](https://vercel.com/docs/functions/configuring-functions/region)).

The warm health probe (267ms, one `SELECT 1`) sits next to the `iad1` → Sydney hot reference (214.9ms). The first health probe (1,525ms) sits next to that path’s cold reference (1,352.5ms). Local `EXPLAIN` still finishes in under 0.1ms, and a warm local patient render is 20–70ms. PostgreSQL CPU is not the production 1.5s.

### Why query count amplifies the gap

A guide loader issues 15 SQL statements. A full guide or print request logged 27 executes because metadata and the page both run the loader. On the local home trace, the duplicated reads appeared at the same millisecond, and Prisma batched some repeated `findUnique` calls. Those statements share a round trip. They do not each wait for the previous one.

27 serial trips at the 215ms reference would be several seconds. Production guide TTFB stayed near 1.5s, so the statements are grouped. The warm health check is one round trip at about 270ms. The guide page is about 1.2s slower than that, which fits a short chain of sequential groups plus render time. This audit did not trace production Prisma timing, so it does not assign a round-trip count to each statement.

Moving the function to `syd1` shrinks every group. Reducing the number of groups still matters afterwards, and should be remeasured on the colocated baseline.

### Australian visitors and a single region

Static files stay on Vercel’s CDN in the region closest to the visitor. Choosing a function region leaves that in place ([configuring regions](https://vercel.com/docs/functions/configuring-functions/region)). Dynamic HTML is `private, no-store` and `x-vercel-cache: MISS`, so the function runs on every patient document.

If Settings → Functions lists only `iad1`, Australian patients use that same function. Their nearest edge still accepts the connection, then forwards it to Washington before any SQL runs. The 1.3–1.5s figures above are from a runner already in `iad1`. An Australian visitor would add that extra hop. This audit did not measure from Australia.

With a single function region of `syd1`:

- The nearest edge still accepts the request.
- The function runs in Sydney.
- Database round trips stay inside `ap-southeast-2`.
- A visitor outside Australia reaches that same Sydney function. Their edge hop is longer. Their database hops become the short ones. Patient pages are dominated by those database hops.

A second active function region, such as `iad1` together with `syd1`, would run some requests far from the only database. That is a resilience question, not the latency fix. Hobby accounts can select one region. Pro can select more than one ([limits](https://vercel.com/docs/functions/configuring-functions/region)). `syd1` is in the public region list.

Fluid Compute fails over to another availability zone in the same region, and only leaves the region if that whole region is unavailable. That failover is separate from pinning an active second region.

### How to set Sydney later

Do not set it in this audit.

The dashboard Function Regions control is what production uses today, because the repository sets no `regions`. A `regions` entry in `vercel.json` overrides that dashboard value ([`vercel.json`](https://vercel.com/docs/project-configuration/vercel-json), Fluid precedence table). Per-function `functions` regions override the project list. `preferredRegion` is the Edge route-segment control; these patient routes are Node.js.

Prefer a reviewed `vercel.json` with `"regions": ["syd1"]` in a later change, so the region is visible in git and wins over a dashboard edit. Setting only the dashboard to Sydney (`syd1`) is enough while the repo stays silent. Either way, the running deployment keeps its current region until a new production deployment. This audit does not deploy.

Before that change, read the Function Regions accordion. If it already lists more than `iad1`, keep the follow-up to a single `syd1` rather than appending regions.

The reviewed `vercel.json` from this section is now the repository file. See [Function region pin](#function-region-pin). It still takes effect only on a new production deployment.

### Confidence and next action

| Claim                                                     | Confidence  | Why                                                                                                                  |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| These production requests executed the function in `iad1` | High        | Every probed route returned `iad1::iad1::<id>`, and the header includes the function region                          |
| Production Neon is AWS `ap-southeast-2` / Sydney          | High        | Launch and recovery runbooks record the live project. The Neon API was not re-read here                              |
| The project setting is a single region, `iad1`            | Medium      | Matches the default and the header. The dashboard list was not opened, so an extra region beside `iad1` is unchecked |
| Colocation removes most of the 1.3–1.5s patient TTFB      | Directional | Supported by the health probe and Neon’s reference. The after-change TTFB has to be measured                         |

**Measured:** function region `iad1`; patient warm TTFB 1.3–1.5s; health `SELECT 1` 1,525ms then 267ms; local SQL under 0.1ms; local warm render 20–70ms.

**Reference:** Neon HTTP `SELECT 1`, 30-day mean, `iad1` → Sydney 214.9ms hot / 1,352.5ms cold; `syd1` → Sydney 9.9ms hot / 713.3ms cold.

**Expected:** after a single-region move to `syd1` and a redeploy, repeat the same URLs. The warm health check is the cleanest comparison, because it is one pooled `SELECT 1`. Patient TTFB should fall by the cross-Pacific part of its sequential groups. This audit does not promise a replacement millisecond figure.

The region configuration for that change is [Function region pin](#function-region-pin). Application dedupe stays behind the post-deploy measurement.

## Function region pin

Recorded 2026-09-25. Root `vercel.json` pins normal Vercel Functions to Sydney. The measurements above stay the before state. This section does not replace them, and it does not record a predicted millisecond result.

### Before

| Piece            | State                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Functions | `iad1` (Washington, D.C., USA). Every probed production response used `x-vercel-id` `iad1::iad1::<request id>`.                                                                     |
| Neon             | AWS `ap-southeast-2` / Sydney. One production primary, recorded in [NEON-RECOVERY.md](../launch/NEON-RECOVERY.md) and [PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md). |

### Change

Normal Vercel Functions are pinned to one region, Sydney `syd1`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["syd1"]
}
```

That file is the whole configuration for this change. It does not set `iad1`, a second primary region, `functionFailoverRegions`, per-function `functions` regions, `fluid`, `memory`, `maxDuration`, redirects, or headers. No route file sets `preferredRegion` or a region override.

`syd1` is Sydney, Australia (`ap-southeast-2`) on the [region list](https://vercel.com/docs/regions). Vercel’s project [`regions` key](https://vercel.com/docs/functions/configuring-functions/region) is the default for the deployment’s Serverless Functions. The [schema](https://openapi.vercel.sh/vercel.json) describes `regions` as the regions those functions should be deployed to. A `vercel.json` region overrides the dashboard and Fluid defaults ([precedence](https://vercel.com/docs/fluid-compute)).

The running production deployment keeps `iad1` until a new production deployment includes this file. This change does not deploy.

### Why one region

River Aftercare has one production PostgreSQL primary, in AWS `ap-southeast-2` / Sydney. Patient rendering is database-heavy. Using several active Function regions against that single primary could send some requests on long-distance database round trips again. The Function region is therefore one region, `syd1`. This is a latency and data-locality decision. It is not a multi-region resilience redesign.

### Static and CDN behaviour

Checked against Vercel’s region docs on 2026-09-25.

[Configuring regions](https://vercel.com/docs/functions/configuring-functions/region) says the platform caches static content in the CDN by default, so static files such as HTML, CSS, and JavaScript are served from the region closest to the user. Choosing a Function region leaves that cache in place. [Regions](https://vercel.com/docs/regions) describes the CDN as a global network: points of presence are the first contact for a request, and compute runs in a smaller set of regions.

For this project that means:

- Static JS, CSS, and images remain globally distributed. This change does not alter static caching.
- Requests may enter through a nearby Vercel edge location. The first segment of `x-vercel-id` is that entry, not the Function region.
- Dynamic Node.js Function execution is pinned to `syd1`.
- Database communication from those Functions is therefore colocated with Sydney Neon.

Patient and marketing HTML in this audit was `private, no-store` with `x-vercel-cache: MISS`, so those documents still execute a Function on each request. Only the Function moves to Sydney. Prerendered static files stay on the CDN.

Vercel also deploys Routing Middleware to all regions by default, regardless of the Function `regions` setting (fewer regions on Hobby). `proxy.ts` does not query the database, so that default does not add a Sydney database round trip. This change does not configure middleware regions.

### Fluid Compute

The dashboard Fluid Compute toggle was not read. No Vercel token, Vercel CLI, or `.vercel` project link was available, which is the same limit as the audit.

Fluid Compute is orthogonal to this region change. The repo-level `regions` setting is authoritative for Function placement: Vercel’s precedence table puts a `vercel.json` region above the dashboard and above Fluid defaults. `"fluid"` is not in `vercel.json`. This change does not enable or disable Fluid Compute.

### Expected

Remove cross-Pacific database round trips between Function execution and the Sydney primary.

No expected final millisecond figure is recorded. The warm health probe and the patient TTFB have to be measured again after deployment.

### Measurement plan

After the production deployment that includes this `vercel.json`, and before any application-level optimisation (React `cache()`, Prisma query changes, indexes, or caching), rerun exactly the same production probes as this audit:

- The method in [Environment and method](#3-environment-and-method): sequential requests, no concurrency, no writes, only `riveraftercare.com.au`, `app.riveraftercare.com.au`, and `demodental.riveraftercare.com.au`.
- The two-pass table in [Observed production execution](#observed-production-execution): marketing home, `demodental` home, `/extraction`, `/extraction/print`, and `GET https://app.riveraftercare.com.au/api/health`.
- The five-sample table in [Production-safe baseline](#4-production-safe-baseline), including pricing and logged-out staff login.

Record status, TTFB, `x-vercel-id`, `x-vercel-cache`, and `cache-control`. The Function segment of `x-vercel-id` should be `syd1`. The first segment may still be the edge that accepted the probe. Do not start the later pull requests in [Recommended PR sequence](#17-recommended-pr-sequence) from the pre-change 1.3–1.5s figures.

That rerun is recorded in [Sydney Region Post-Deployment Measurement](#sydney-region-post-deployment-measurement).

## Sydney Region Post-Deployment Measurement

Measurement only. No application code, Prisma query, React `cache()`, cache header, Vercel setting, Neon project, or deployment was changed in this pass.

Measured 2026-09-25, 06:53–06:55 UTC, after the production deployment of `main` `9b028f192482287b1282c24c363660651d0074fe` (PR #102, commit time 2026-09-25 16:51:06 +1000).

### Deployed configuration

| Item                    | Value                                             |
| ----------------------- | ------------------------------------------------- |
| `main` SHA              | `9b028f192482287b1282c24c363660651d0074fe`        |
| PR #102 commit          | `9b028f1` — Pin Vercel functions to Sydney (#102) |
| `vercel.json` on `main` | Present                                           |
| Configured region       | `syd1` only                                       |

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["syd1"]
}
```

PR #102 changes `vercel.json` and documentation only (`docs/launch/PRODUCTION-READINESS.md`, this audit, `docs/product/WORKING-MEMORY.md`). It does not change application code, Prisma queries, or cache behaviour.

### Runner

New Cursor cloud agent VM in AWS `us-east-1` (Ashburn). It is not the same process as the pre-change audit. It is the same class of vantage: the Vercel edge segment is `iad1`, DNS on the warmed requests was about 1ms, and TLS was about 19ms. The pre-change audit recorded DNS and TLS at about 1ms and 20ms from a runner that also entered at `iad1`.

`x-vercel-id` is read the same way as [What `iad1::iad1` means](#what-iad1iad1-means). The first segment is the edge that accepted this probe. The second segment is the Function execution region. `x-vercel-execution-region` and `server-timing` were absent, as before.

### Region check

One GET, before the five-sample series:

`https://demodental.riveraftercare.com.au/extraction`

| Field            | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| HTTP status      | 200                                                       |
| TTFB             | 1,735.9ms                                                 |
| Total            | 1,737.6ms                                                 |
| `x-vercel-id`    | `iad1::syd1::n5spd-1790319224438-0b87fad09cb8`            |
| `x-vercel-cache` | `MISS`                                                    |
| `cache-control`  | `private, no-cache, no-store, max-age=0, must-revalidate` |

Function segment: **`syd1`**. Edge segment: `iad1`, which matches this US runner. This request is the cold first touch of the guide route in this session. It is kept as evidence and is not folded into the five-sample median below.

Region mismatch: **RESOLVED**. The five-sample series ran because the Function segment was `syd1`.

### Five sequential samples

Five requests per surface, one after another, no concurrency, no writes, no query-string cache busting. Every response was HTTP 200. Every `x-vercel-id` was `iad1::syd1::<id>`. Every `x-vercel-cache` was `MISS`. `age` was `0`. TTFB is curl `time_starttransfer`. Total is curl `time_total`. The median is the middle value of the five sorted TTFB samples. Cold-looking first hits stay in the median.

Document `cache-control` on marketing, pricing, login, and every `demodental` page: `private, no-cache, no-store, max-age=0, must-revalidate`. Health: `no-store`.

#### Marketing home — `https://riveraftercare.com.au/`

|   # | Status |      TTFB |     Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | --------: | --------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 1,006.9ms | 1,008.6ms | `iad1::syd1::bsm5m-1790319293599-89069b3381e1` | `MISS`           |
|   2 |    200 |   327.8ms |   524.8ms | `iad1::syd1::cfx45-1790319294608-f684a2e9e48c` | `MISS`           |
|   3 |    200 |   301.3ms |   499.3ms | `iad1::syd1::qggbc-1790319295137-dfc258e06c5f` | `MISS`           |
|   4 |    200 |   300.9ms |   502.2ms | `iad1::syd1::x98hc-1790319295644-bd25d206c511` | `MISS`           |
|   5 |    200 |   300.8ms |   500.1ms | `iad1::syd1::vgxbj-1790319296148-8d4e24e80fbc` | `MISS`           |

Sample 1 is a cold first hit. Median 301.3ms. Min 300.8ms. Max 1,006.9ms.

#### Pricing — `https://riveraftercare.com.au/pricing`

|   # | Status |    TTFB |   Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | ------: | ------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 660.8ms | 661.7ms | `iad1::syd1::qm8ck-1790319296653-28874e87fa42` | `MISS`           |
|   2 |    200 | 297.5ms | 497.6ms | `iad1::syd1::kj7z5-1790319297320-cfe07d831767` | `MISS`           |
|   3 |    200 | 317.7ms | 517.7ms | `iad1::syd1::wkstl-1790319297823-edb1ae62132b` | `MISS`           |
|   4 |    200 | 311.8ms | 510.2ms | `iad1::syd1::qggbc-1790319298344-f87217656c9c` | `MISS`           |
|   5 |    200 | 294.0ms | 494.3ms | `iad1::syd1::nvt6s-1790319298860-4196d75ca07b` | `MISS`           |

Sample 1 is a cold first hit. Median 311.8ms. Min 294.0ms. Max 660.8ms.

#### Logged-out staff login — `https://app.riveraftercare.com.au/login`

|   # | Status |    TTFB |   Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | ------: | ------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 401.6ms | 402.4ms | `iad1::syd1::628pd-1790319299365-9373bfd8e0e4` | `MISS`           |
|   2 |    200 | 325.0ms | 325.1ms | `iad1::syd1::cqbq7-1790319299771-1a07ada270bd` | `MISS`           |
|   3 |    200 | 284.5ms | 284.7ms | `iad1::syd1::n6cwx-1790319300098-1d926defdaf9` | `MISS`           |
|   4 |    200 | 306.5ms | 307.7ms | `iad1::syd1::bxmfm-1790319300384-536bb687a3e8` | `MISS`           |
|   5 |    200 | 285.3ms | 285.8ms | `iad1::syd1::4zhc9-1790319300697-3dc0d0488e08` | `MISS`           |

Sample 1 is the slowest. Samples 2–5 stay in the same band, so this is not a single cold outlier. Median 306.5ms. Min 284.5ms. Max 401.6ms.

#### Demo patient home — `https://demodental.riveraftercare.com.au/`

|   # | Status |    TTFB |   Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | ------: | ------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 354.6ms | 355.0ms | `iad1::syd1::jnmps-1790319300986-c7f0b98c26bf` | `MISS`           |
|   2 |    200 | 305.2ms | 308.6ms | `iad1::syd1::6q455-1790319301346-afe9f6fc455e` | `MISS`           |
|   3 |    200 | 291.4ms | 292.3ms | `iad1::syd1::44kkb-1790319301659-aa3a54b8ac93` | `MISS`           |
|   4 |    200 | 296.3ms | 297.6ms | `iad1::syd1::jvdk2-1790319301955-919595c65621` | `MISS`           |
|   5 |    200 | 296.6ms | 297.3ms | `iad1::syd1::545jf-1790319302257-c23b2d7c6814` | `MISS`           |

Sample 1 is mildly slower than the rest. Median 296.6ms. Min 291.4ms. Max 354.6ms.

#### Demo guide — `https://demodental.riveraftercare.com.au/extraction`

The region-check GET above (1,735.9ms) already touched this URL. These five samples are the benchmark series. They do not include that cold request.

|   # | Status |    TTFB |   Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | ------: | ------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 333.2ms | 334.1ms | `iad1::syd1::2stm6-1790319302561-0f55dda6af3d` | `MISS`           |
|   2 |    200 | 311.5ms | 430.5ms | `iad1::syd1::65vkt-1790319302898-a9badc25526c` | `MISS`           |
|   3 |    200 | 345.9ms | 346.8ms | `iad1::syd1::nh5fh-1790319303332-25f30bcaf859` | `MISS`           |
|   4 |    200 | 331.0ms | 332.7ms | `iad1::syd1::m8v2n-1790319303683-0384bed7ccd1` | `MISS`           |
|   5 |    200 | 313.9ms | 315.3ms | `iad1::syd1::h4pcc-1790319304026-9cd97020f163` | `MISS`           |

No sample in this series looks cold. Median 331.0ms. Min 311.5ms. Max 345.9ms.

#### Demo print — `https://demodental.riveraftercare.com.au/extraction/print`

|   # | Status |    TTFB |   Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | ------: | ------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 315.7ms | 316.9ms | `iad1::syd1::lklwz-1790319304341-708b5004f05b` | `MISS`           |
|   2 |    200 | 312.8ms | 314.3ms | `iad1::syd1::h4kj7-1790319304663-292a12ee5da3` | `MISS`           |
|   3 |    200 | 520.2ms | 523.2ms | `iad1::syd1::5h28f-1790319305095-a901eb0902a9` | `MISS`           |
|   4 |    200 | 340.4ms | 341.9ms | `iad1::syd1::2kdnx-1790319305508-83123d6307d1` | `MISS`           |
|   5 |    200 | 360.0ms | 362.3ms | `iad1::syd1::xhwjk-1790319305854-64848f12bea7` | `MISS`           |

Sample 3 is slower and is not the first request. Median 340.4ms. Min 312.8ms. Max 520.2ms.

#### Health — `https://app.riveraftercare.com.au/api/health`

|   # | Status |      TTFB |     Total | `x-vercel-id`                                  | `x-vercel-cache` |
| --: | -----: | --------: | --------: | ---------------------------------------------- | ---------------- |
|   1 |    200 | 1,775.8ms | 1,775.9ms | `iad1::syd1::4hfnh-1790319306224-15ccf71b9750` | `MISS`           |
|   2 |    200 | 2,174.4ms | 2,174.5ms | `iad1::syd1::hkcf6-1790319308003-6d22558d9e83` | `MISS`           |
|   3 |    200 |   266.5ms |   266.7ms | `iad1::syd1::pfgz8-1790319310183-6df9e596d492` | `MISS`           |
|   4 |    200 |   333.9ms |   360.5ms | `iad1::syd1::wn5ng-1790319310454-caa27b735667` | `MISS`           |
|   5 |    200 |   289.7ms |   289.9ms | `iad1::syd1::h49gm-1790319310820-7bd976faedb2` | `MISS`           |

Body on every sample: `{ "status": "ok" }`. Samples 1 and 2 are cold. They stay in the all-five median. Median 333.9ms. Min 266.5ms. Max 2,174.4ms. Samples 3–5, the warm samples, are 266.5ms, 333.9ms, and 289.7ms. Their median is 289.7ms.

The patient print request immediately before health sample 1 returned in 360.0ms and had already queried Neon. A fully asleep database is a weak explanation for the two slow health samples. They match the earlier audit’s cold health hits (1,525ms and 2,581ms) more than they match a colocated hot `SELECT 1`.

### Before / after

Before medians are the five-sample production baseline in section 4. Absolute change is after median minus before median. Percent change is that difference divided by the before median. A negative change is faster.

| Surface                    | Before median | After median | Absolute change | Percent change |
| -------------------------- | ------------: | -----------: | --------------: | -------------: |
| Marketing home             |         327ms |      301.3ms |         −25.7ms |          −7.9% |
| Pricing                    |         290ms |      311.8ms |         +21.8ms |          +7.5% |
| Logged-out login           |          80ms |      306.5ms |        +226.5ms |        +283.1% |
| `demodental` home          |       1,304ms |      296.6ms |      −1,007.4ms |         −77.3% |
| `demodental` `/extraction` |       1,513ms |      331.0ms |      −1,182.0ms |         −78.1% |
| `demodental` print         |       1,504ms |      340.4ms |      −1,163.6ms |         −77.4% |

Health has no five-sample before median. The recorded warm samples were 267ms (region pass 2) and 300ms (section 4). The recorded cold samples were 1,525ms and 2,581ms.

| Health comparison    | Before |   After | Absolute change | Percent change |
| -------------------- | -----: | ------: | --------------: | -------------: |
| All five, this run   |      — | 333.9ms |               — |              — |
| Warm sample vs 267ms |  267ms | 289.7ms |         +22.7ms |          +8.5% |
| Warm sample vs 300ms |  300ms | 289.7ms |         −10.3ms |          −3.4% |

The 289.7ms figure is the median of health samples 3–5 only. It is the warm comparison, not a replacement for the all-five median of 333.9ms.

### Health interpretation

Warm `/api/health` did not drop substantially. From this US runner it stayed in the same band as the `iad1` warm samples (about 267–334ms versus 267–300ms).

That is what a single round trip looks like once the long hop has moved. Before, the edge and the Function were both in `iad1`, and the long hop was Function to Sydney Neon. After, the Function is in `syd1`, and the long hop is this probe’s edge (`iad1`) to the Sydney Function. One pooled `SELECT 1` still pays about one US-to-Sydney trip. Neon’s public hot reference (214.9ms from `iad1`, 9.9ms from `syd1`) describes the database leg, not this probe’s full TTFB. This run did not separate those legs with server timing.

Cold health samples remain above 1.5s (1,775.8ms and 2,174.4ms).

### Patient interpretation

Directional only. Warm health is the infrastructure floor visible from this runner. Patient median minus that floor is an estimate of remaining application and database work. It is not a profiler.

Using the warm-health median of 289.7ms:

| Surface      | After median | Minus 289.7ms |
| ------------ | -----------: | ------------: |
| Patient home |      296.6ms |         6.9ms |
| Guide        |      331.0ms |        41.3ms |
| Print        |      340.4ms |        50.7ms |

Using the fastest warm health sample, 266.5ms, as an alternate floor: home 30.1ms, guide 64.5ms, print 73.9ms.

The all-five health median (333.9ms) sits above patient home because it includes two cold health starts. Subtracting it from the patient medians is not the application gap.

Local production-build TTFB on loopback PostgreSQL was 50ms for home, 48ms for the guide, and 30ms for print. The remaining production gap is in that range. The earlier trace already showed the duplicated loader statements running together, so they do not each add a full round trip to wall time.

### What the region move resolved

About 1.0–1.2 seconds of patient TTFB, 77–78% of the previous medians. From this runner the pages sit on the same one-hop floor as warm health, plus a few tens of milliseconds.

Logged-out login moved the other way on this runner: 80ms to 306.5ms. That page issues no SQL. The previous 80ms was an `iad1` Function next to the probe. The new samples are the trip to `syd1`. This is the expected cost for a US client of a Sydney Function. It is not a reason to add `iad1` back. Australian staff do not pay this probe’s edge hop. This run did not measure from Australia, and it does not invent an Australian millisecond figure.

Marketing (−7.9%) and pricing (+7.5%) stayed near their previous medians. Both still render dynamically in `syd1` with `x-vercel-cache: MISS`.

### Cache behaviour

Unchanged, and consistent with the pre-change audit.

- Patient, marketing, and login documents remain `private, no-cache, no-store, max-age=0, must-revalidate`.
- Health remains `no-store`.
- Every sample was `x-vercel-cache: MISS` and `age: 0`.
- No CDN page cache appeared.
- Compressed sizes stayed in the previous bands (marketing about 16.8KB, pricing about 14.1KB, login 4,889 bytes, health 21 bytes on the wire, `{ "status": "ok" }` in the body).

The experiment isolates Function placement.

### Remaining bottlenecks

1. **One US-to-Sydney hop on every dynamic request from this vantage.** Warm health at about 267–334ms is that floor. Patient pages have joined it. Further patient SQL work cannot remove this probe’s edge-to-Function trip.
2. **A small patient gap above that floor.** Guide and print are about 40–75ms slower than warm health, depending on which warm health sample is the floor. Home is within about 7–30ms. That is real work, and it is no longer the 1.2s gap.
3. **Cold starts.** Health samples 1 and 2 were still above 1.5s, and the pre-benchmark guide touch was 1,735.9ms. Warm samples are the comparison that matches the earlier warm baseline.
4. **Staff JavaScript.** At the time of this probe, the Zod chunk (about 388KB uncompressed) and the Prisma enum import were unchanged. They do not explain the login TTFB change. The later split is in [Staff client bundle split](#staff-client-bundle-split).
5. **Additional-location home.** Still 41 SQL executes on the local trace. `demodental` publishes no additional location, so production did not remeasure `/bondi`. Keep that miss path in a later query change. It is not the next change: root patient TTFB is no longer dominated by cross-Pacific groups.
6. **Marketing is still dynamic.** ISR would change edge caching for marketing HTML. It was not part of this deploy, and the US marketing median barely moved.

### Revised optimisation order

Do not open a patient backend pull request next only because the statement counts are large. Guide and print do not still have a substantial avoidable gap above health.

1. **Done in source — staff client Zod and Prisma enum split.** Former PR B. Measured in [Staff client bundle split](#staff-client-bundle-split). Login, password forms, the slug helper, and invitation constants. No patient behaviour change.
2. **Later — request-level React `cache()` for patient loaders.** Former PR A. The measured remainder is about 40–75ms on guide and print, and the duplicates already overlap. Revisit only if a later probe, preferably from Australia or on an additional-location URL, shows a larger gap.
3. **Later — fewer statements in the guide loader, including the location-home miss path.** Former PR C. Retain the miss-path work in that pull request. Root guide versus location order stays. `demodental` still cannot show the production cost.
4. **Later — branding CDN cache investigation.** Former PR D. Unchanged by this measurement.
5. **Later — marketing ISR.** Former PR E. Separate from patient caching. Tenant hosts stay `no-store`.

No index pull request. No second Function region.

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

These sizes are the audit build, before the staff client bundle split. The measured result is in [Staff client bundle split](#staff-client-bundle-split).

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

- **Status:** Region mismatch **RESOLVED** on 2026-09-25. Production Functions now execute in `syd1`. The 1.3–1.5s medians below are the before evidence. See [Sydney Region Post-Deployment Measurement](#sydney-region-post-deployment-measurement).
- **Severity:** High
- **Class:** Current at audit time. Functions that served these requests ran in `iad1` while Neon is in Sydney. If the project has only that one region, Australian visitors use the same function region and add the trip from their edge to `iad1` on top of the database round trips already in this US measurement.
- **Evidence:** Production median TTFB 1,304ms home, 1,513ms guide, 1,504ms print, all `x-vercel-cache: MISS` and `x-vercel-id` `iad1::iad1`. Local equivalents 19–73ms. Warm health `SELECT 1` was 267ms from the same runner. See [Function / Database Region Investigation](#function--database-region-investigation).
- **Surface:** patient, infrastructure
- **Impact:** TTFB, and therefore LCP on server-rendered HTML
- **Effort:** One region setting and a redeploy. Query reduction comes after the remeasure.
- **Risk:** Low if the follow-up sets a single `syd1` and repeats these probes. Read the Function Regions list before changing it.

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

- **Status:** Addressed by the staff client bundle split. The evidence below is the pre-split audit. After sizes are in [Staff client bundle split](#staff-client-bundle-split).
- **Severity:** Medium
- **Class:** Current at audit time, staff only.
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

1. **Move the single function region to `syd1`.** Configured in [Function region pin](#function-region-pin): root `vercel.json` is `"regions": ["syd1"]` only. These production functions ran in `iad1`, and Neon is in Sydney. After the production deployment that includes the file, repeat the `demodental` and `/api/health` probes before editing loaders.
2. **Fewer SQL statements per guide read.** Prisma emitted separate statements for site, clinic, location, placement, revision, sections, guide, template, overrides, and additions. A narrower `select` or one SQL statement would cut round trips after dedupe. Do this only with the same predicates and the same pin rule (null pin stays on the canonical template; a newer clinic revision is not substituted).
3. **Location-home miss path.** After dedupe, `/bondi` still runs a full guide lookup that returns nothing. A cheaper existence check, still ordered so a real root guide wins, would cut the 41-statement request further. Slug collision rules in `lib/clinics/slug-collisions.ts` must keep working.
4. **Marketing ISR, separate from patient caching.** Remove the `headers()` dependency from marketing render, or pass the origin another way, and let the existing SEO `revalidatePath` flow apply. Do not reuse that strategy on tenant hosts.
5. **CDN storage for immutable branding URLs**, after proving the cache key is the path (clinic id + file name) and that a replaced logo uses a new file name. No R2 migration.
6. **Optional font CSS split** so a site using Inter does not download `@font-face` rules for the other five families. `preload: false` already avoids unused WOFF2 downloads. This is secondary.
7. **Operator pagination** when account count grows. Not justified by current data.

## 17. Recommended PR sequence

1. **PR 0 — single function region `syd1`.** The region file is in place. See [Function region pin](#function-region-pin). No application code. Redeploy production through the normal `main` deployment. Repeat the patient and `/api/health` probes from this audit. Leave React `cache()` and query changes until those numbers exist.
2. **PR A — request-level patient loader dedupe.** React `cache()` only. No `unstable_cache`, no `Cache-Control` change, no removal of `force-dynamic`. Add a test that two calls in one request share one site lookup. Re-run the audit script’s HTTP counts and expect home below 12 and location home well below 41.
3. **PR B — staff client Zod and Prisma enum split.** Done and measured in [Staff client bundle split](#staff-client-bundle-split). Login, password forms, slug helper, invitation constants. No patient behaviour change.
4. **PR C — reduce statements inside `getPublishedPracticeGuide` and the location-home miss path.** One PR if the miss path stays obviously correct; otherwise split. Keep pin and collision behaviour. Re-measure statement counts.
5. **PR D — branding CDN cache investigation.** Only if a repeated request still misses. Do not change object keys.
6. **PR E — marketing static or ISR.** Separate from patient caching. Re-measure marketing TTFB and confirm tenant hosts stay `no-store`.

### Revised after the Sydney measurement

PR 0 is done and measured. Follow [Sydney Region Post-Deployment Measurement](#sydney-region-post-deployment-measurement), not the 1.3–1.5s figures, for anything after this point.

The staff client Zod and Prisma enum split (former PR B) is measured in [Staff client bundle split](#staff-client-bundle-split). Patient loader dedupe and the location-home query reduction stay later. Guide and print are within about 40–75ms of warm `/api/health` from the same US runner, so statement count alone is not the next incident. The additional-location miss path stays inside that later query pull request. `demodental` has no additional location, so that path was not remeasured in production. The remaining first-load weight on every route is the shared Sentry browser chunk (about 371KB). Leave that SDK in place.

Do not open an index PR from this audit.

## Staff client bundle split

Measured 2026-09-25 on Node 24.21.0 with `next build` (Next.js 16.3.5, Turbopack). Before is `main` `0714c51ca02465ed755cd6d6fe578dcc4284c09b` (PR #103). After is this branch. The metric is `firstLoadUncompressedJsBytes` in `.next/diagnostics/route-bundle-stats.json`. The audit’s “KB” figures are those bytes divided by 1,000. This change moves module boundaries. Authentication, passwords, validation rules, multi-location, entitlements, Stripe, patient pages, the Prisma schema, queries, caching, Vercel, R2, and Sentry are unchanged. Server Zod schemas remain the authoritative check. Client checks are UX only.

### Import chains that pulled Zod into the browser

A static walk of Client Components on `main` found these value-import chains. The guide editor was not among them, and its first-load set did not include the Zod chunk.

- `app/(staff)/login/login-form.tsx` → `login-schema.ts` → `zod` (`loginSchema.safeParse` for UX).
- `forgot-password-form.tsx` → `forgot-password-schema.ts` → `zod`.
- `reset-password-form.tsx` and `accept-invitation-form.tsx` → `password-form-schema.ts` → `zod`.
- `profile-form.tsx` and `confirm-email-change-form.tsx` → `lib/auth/account-profile-schema.ts` for message constants. That module also built a Zod schema.
- `create-site-form.tsx` and `site-manager.tsx` → `lib/clinics/slug-suggestion.ts` → `lib/aftercare/slug.ts`, which constructed `careGuideSlugSchema` with Zod at module scope in order to export `isValidCareGuideSlug`.
- `practice-members-section.tsx` and `invite-user-form.tsx` → `lib/operator/clinic-invitation-input.ts` for `INVITED_NAME_MAX_LENGTH`. That module also imported Zod and built `inviteClinicUserFormSchema`.

`app/(staff)/login`’s API route does not use `loginSchema`. It keeps its existing length and normalisation checks. Adding Zod there would change the unauthenticated failure response, so this split leaves that route as it was.

### Import chains that pulled Prisma into the browser

- `practice-members-section.tsx` and the operator `team-table.tsx` imported `ClinicMembershipRole` from `@prisma/client`.
- Those components, plus `invite-user-form.tsx`, also reached the generated client through `lib/clinic-portal/role-labels.ts`.
- The guide editor, status pills, lifecycle actions, and staff preview imported `lib/clinic-portal/guide-status.ts`, which imports `GuideRevisionStatus` and `PracticeGuideStatus`. Turbopack had already tree-shaken the unused enum imports out of the editor bundle. The split still removes that import so a later edit cannot pull the runtime back in.

The practice client chunk that contained `stripeCustomerId` and `ClinicMembershipRole` was `1w4ormvuu0z-z.js`, 57,465 bytes, on `/practice`, operator team, and the invite route.

### Modules split

Browser-safe modules, with no Zod and no `@prisma/client`:

- `lib/aftercare/slug-rules.ts` — canonical slug pattern, length 3–32, and `isValidCareGuideSlug`.
- `lib/clinic-portal/membership-role.ts` — `CLINIC_MEMBERSHIP_ROLE` (`ADMIN`, `STAFF`) and the derived union.
- `lib/operator/clinic-invitation-fields.ts` — invitation messages, name length 80, normalisation, and the role re-export.
- `lib/auth/account-profile-fields.ts` — profile and email-change message constants.
- `lib/auth/login-input.ts` — login and email field messages, the same practical email pattern the server schema uses, and the client field helpers.
- `lib/clinic-portal/guide-status-view.ts` — lifecycle labels, pills, and publication mode. No Prisma enums.

Server modules keep Zod (or Prisma) and start with `import "server-only"`: `slug.ts`, both login and forgot-password schemas, `password-form-schema.ts`, `account-profile-schema.ts`, `clinic-invitation-input.ts`, `practice-settings-schema.ts`, `site-location-schemas.ts`, `guide-schemas.ts`, and `guide-status.ts`. `slug.ts` and the login schemas import the shared constants, so the client helper and the server schema are not two independently maintained rules. `lib/tenancy/parse-hostname.ts` imports `slug-rules.ts`, because the proxy stays database-free and must not load the server-only slug module.

`newPasswordFieldErrors` matches Zod object `.refine`, which still reports a confirmation error when the password field itself fails. Reset and accept server actions still use `confirmNewPasswordError`. That single-string helper was already the server boundary, and it is unchanged.

### Before and after

| Route                                 | Before (bytes) | After (bytes) | Absolute | Percent |
| ------------------------------------- | -------------: | ------------: | -------: | ------: |
| `/login`                              |      1,082,709 |       695,120 | −387,589 |  −35.8% |
| `/forgot-password`                    |      1,071,451 |       683,837 | −387,614 |  −36.2% |
| `/reset-password`                     |      1,084,905 |       696,500 | −388,405 |  −35.8% |
| `/accept-invitation`                  |      1,076,497 |       688,089 | −388,408 |  −36.1% |
| `/confirm-email-change`               |      1,072,440 |       684,100 | −388,340 |  −36.2% |
| `/practice`                           |      1,197,455 |       753,077 | −444,378 |  −37.1% |
| `/practice/sites`                     |      1,093,745 |       705,944 | −387,801 |  −35.5% |
| `/practice/sites/[siteId]`            |      1,121,247 |       733,446 | −387,801 |  −34.6% |
| `/account`                            |      1,101,400 |       713,859 | −387,541 |  −35.2% |
| Operator team                         |        765,586 |       708,536 |  −57,050 |   −7.5% |
| Operator invite                       |      1,144,390 |       700,010 | −444,380 |  −38.8% |
| Guide editor `/guides/[guideId]/edit` |        751,392 |       751,390 |       −2 |     ~0% |
| Guide preview                         |        702,896 |       702,894 |       −2 |     ~0% |
| Patient home `/_sites/[tenant]`       |        665,672 |       665,670 |       −2 |     ~0% |
| Patient guide                         |        670,788 |       670,786 |       −2 |     ~0% |
| Patient print                         |        669,583 |       669,581 |       −2 |     ~0% |

Practice settings and the operator invite route dropped both the Zod chunk and the Prisma field chunk. Operator team had the Prisma chunk only. Sites & Locations had the Zod chunk via the slug helper. The guide editor is the comparison route: it never included the Zod chunk, and its −2 bytes is the same shared-chunk delta as the patient routes.

### Zod chunk and Prisma client chunk

Before, `233mxg4ahbcl8.js` was 387,769 bytes and was on login, the password routes, practice settings, Sites & Locations, account, and invite. After, no client chunk contains `$ZodError`, `invalid_format`, or `stripeCustomerId`. The large Zod chunk is gone from those routes. The Prisma field chunk is gone from `/practice`, operator team, and invite.

The shared Sentry chunk remains: `3vo_j02_umy86.js`, 371,079 bytes (before: `1iaha0zb6-kf9.js`, 371,081 bytes). Strings that mention Prisma in that file are the Sentry denylist, not the Prisma client. That chunk is now the dominant first-load file on staff and patient routes. Do not remove Sentry to chase it. A later change could load the browser SDK from error boundaries only. That is a monitoring tradeoff.

The −2 byte movement on patient routes, the guide editor, the dashboard, account security, and marketing home is that shared chunk (371,081 → 371,079). Patient bundles did not grow. Patient source was not edited for this split.

### What stays later

1. Optional Sentry browser-SDK loading, only as a monitoring decision.
2. Request-level React `cache()` for patient loaders, if a later probe shows a larger gap than the current 40–75ms on guide and print.
3. Fewer statements in the guide loader, including the location-home miss path.
4. Branding CDN cache investigation, then marketing ISR.

No index pull request. No patient loader edit in this change.

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
