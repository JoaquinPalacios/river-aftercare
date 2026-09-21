# River Aftercare runtime error inventory — 2026-09-21

Investigation only. No application source changes. No Production mutations. No deploy. No merge.

Clean browser: Playwright Chromium (`--disable-extensions`). No user profile, no password managers, no ad blockers, no React DevTools.

Artifacts in this directory. Temporary harnesses lived in `/tmp/pw-audit` and were **not** added to the application.

---

## A. Repository / environment

| Item                      | Value                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Repo                      | JoaquinPalacios/river-aftercare                                                              |
| Branch investigated       | `main`                                                                                       |
| SHA                       | `198bc2d22858cfec8d1f6943a070f63b9fbec7be` (`Make demo bootstrap tests parallel-safe (#75)`) |
| Working tree during audit | clean `main`; this report lives on `cursor/runtime-error-inventory-e82b` (docs only)         |
| Node                      | v24.21.0 (PATH forced off Cloud Agent default Node 22)                                       |
| pnpm                      | 11.24.0 (`packageManager`)                                                                   |
| Next.js                   | 16.3.5                                                                                       |
| React / react-dom         | 19.3.0                                                                                       |
| Prisma                    | 7.10.0 (`@prisma/client` + CLI)                                                              |
| Auth.js                   | `next-auth` 5.0.0-beta.32                                                                    |
| Validation                | `pnpm lint` exit 0; `pnpm exec tsc -b` exit 0; `pnpm build` exit 0                           |

Recent `main` (newest first): `198bc2d` #75 · `210aeed` #74 · `e780ee2` #73 · `a7164f1` #72 account/operator/STAFF · `04f17b3` #71 · `fda8607` #70 Dark branding + favicon.

### Production URLs tested (read-only)

| Surface          | Origin                                     |
| ---------------- | ------------------------------------------ |
| Marketing        | `https://riveraftercare.com.au`            |
| Staff / operator | `https://app.riveraftercare.com.au`        |
| Patient demo     | `https://demodental.riveraftercare.com.au` |
| Clinic assets    | `https://assets.riveraftercare.com.au`     |

Authenticated Production staff/operator was **not** exercised (no safe credentials; would require real account mutations or session). Unauthenticated staff routes and invalid-login 401 were tested.

### Local modes tested

| Mode            | Command                        | Origins                                                                                  |
| --------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| Dev             | `pnpm dev`                     | `http://localhost:3000`, `http://app.localhost:3000`, `http://demodental.localhost:3000` |
| Production-like | `pnpm build` then `pnpm start` | same hosts over HTTP                                                                     |

`*.localhost` required `/etc/hosts` loopback aliases in this Cloud VM (glibc does not resolve `*.localhost`).

### Runtime surface map

**Public / marketing (apex):** `/` `/pricing` `/about` `/contact` `/clinics` `/dental` `/physiotherapy` `/chiropractic` `/cosmetic-clinics` `/privacy` `/terms` plus crawl `/sitemap.xml` `/robots.txt` `/llms.txt`. Hostname proxy rewrites known pages to `/_marketing…` and unknown apex paths to `/_marketing/[...slug]` which calls `notFound()`.

**Auth (staff host):** `/login` `/forgot-password` `/reset-password` `/accept-invitation` `/confirm-email-change` and APIs under `/api/auth/*`. Apex and tenant 404 `/api/*`.

**Staff / clinic (staff host, authenticated):** `/dashboard` `/practice` `/guides` `/guides/[id]/edit` `/guides/[id]/preview` `/account` (`/account/security` → `/account#security`). Branding is on Practice, not a separate `/branding` route.

**Operator (staff host):** `/operator/clinics` `/operator/clinics/[clinicId]` `/operator/clinics/[clinicId]/team` `/operator/seo`. Support context: HttpOnly cookie `river_operator_support_clinic`.

**Patient (tenant host):** `/` guide index, `/[guideSlug]` (demo: `/extraction`), print variant. Theme cookie `aftercare-guide-ui-theme`. Clinic favicon/logo on `assets.` when configured.

**API / assets:** `/api/health` (staff only), `/api/ui-theme`, `/clinic-branding/…` (local), `/clinics/[clinicId]/branding/[filename]` (assets host), `/favicons/*` (public static).

---

## B. Executive summary

| Class                                                      | Count                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| P0 critical                                                | **0**                                                                                            |
| P1 high                                                    | **0**                                                                                            |
| P2 medium (real application defects)                       | **2**                                                                                            |
| P3 low (warnings / expected local noise / hardening notes) | **6** grouped                                                                                    |
| Extension / third-party-only                               | Turnstile headless (contact); Vercel insights on local `pnpm start`                              |
| Expected framework / negative-test                         | RSC `?_rsc=` `ERR_ABORTED`; invalid login 401; unauth `/dashboard` → `/login`; operator-exit 307 |

The deployed site is usable. Tab favicons, fonts, patient clinic PNG, logos, login, marketing pages, and `/api/health` work. The two real defects are: (1) `/favicons/site.webmanifest` 404 on marketing and tenant hosts; (2) marketing Motion reveal SSR/client mismatch (`useReducedMotion()` is `null` on the server). Production Chromium did not log the hydration warning; `pnpm dev` did. Production HTML still has the same server/client branch.

**No security/data issue was found that required stopping the investigation.**

---

## C. Production browser findings

26 Playwright pages (desktop 1280×800 + mobile 390×844 on home/login/extraction). `pageerror` = 0. CSP violations = 0. Service-worker registrations = 0.

| Observation                                                                                                                                                             | Classification                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Public marketing, auth shells, patient home + `/extraction` Light/Dark/System, internal nav + Back/Forward                                                              | HTTP 200, no app `console.error` except listed noise                         |
| Contact page Turnstile in headless Chromium: “No available adapters.”, OTS WOFF parse, `%c%d … NaN`, WebGL GPU stall, PAT 401, `brunhild.challenges.cloudflare.com` DNS | Third-party / headless (D)                                                   |
| Invalid login `POST /api/auth/login` 401 `{"error":"Invalid credentials."}`                                                                                             | Expected (B)                                                                 |
| Many `?_rsc=` `net::ERR_ABORTED` during Link prefetch / cancelled navigations                                                                                           | Expected Next.js (B)                                                         |
| Theme toggle on marketing + patient                                                                                                                                     | succeeded; cookie `aftercare-guide-ui-theme`                                 |
| Staff login / forgot / reset / invitation / confirm-email-change                                                                                                        | 200 shells; no in-page theme button (html `themeMode=system`) — not an error |
| Unauth `/` `/dashboard` `/account` on staff host                                                                                                                        | 200 login page (redirect)                                                    |
| Manifest GET 404 on apex + tenant (curl + HTML still links it)                                                                                                          | **E1 P2**                                                                    |
| River PNG/ICO pack 200; clinic favicon PNG on assets 200 `CORP: same-site`                                                                                              | OK                                                                           |
| No Chromium request for `/favicon.ico` at site root when metadata icons present                                                                                         | OK vs contract; root URL 404s if requested (**E6 P3**)                       |

---

## D. Local dev browser findings

| Observation                                                                                                                                 | Classification                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Marketing home: React 19 hydration mismatch on `MarketingRevealItem` / `MarketingRevealCard` (`opacity`/`transform` + `data-mk-pending`)    | **E2 P2** — also printed in `pnpm dev` terminal `[browser]`                                                          |
| Invalid login 401                                                                                                                           | Expected                                                                                                             |
| Patient Geist-only: 1 Geist WOFF2 200                                                                                                       | OK                                                                                                                   |
| Patient after local Inter probe: Inter WOFF2 + Geist WOFF2 200; unused catalogue WOFF2s not fetched                                         | OK (matches PERFORMANCE.md)                                                                                          |
| First Playwright staff/operator pass timed out waiting for `load` after login                                                               | Harness (Next.js never fired `load` in that wait). **Server still served authenticated 200s** (see terminal excerpt) |
| Authenticated `GET /dashboard` `/practice` `/guides` `/account` `/guides/…/edit` `/operator/clinics` 200                                    | OK                                                                                                                   |
| `startOperatorClinicSupportAction` 200; later `stopOperatorClinicSupportAction` 200; `GET /guides` and `/practice` **307** back to operator | Expected support-exit redirects (B)                                                                                  |
| No Prisma / 500 / server-action failures in the `pnpm dev` log for those flows                                                              | OK                                                                                                                   |

---

## E. Local production-mode findings (`pnpm start`)

| Observation                                                                                                                                                        | Classification                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Same 26-page public/auth/patient matrix: **no hydration `console.error`**                                                                                          | E2 is dev-logged; mismatch may still exist without the warning                            |
| `GET /_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` **404** on every host                                                                    | **E3 P3** — Vercel injects these only on the platform; layouts still mount the components |
| RSC `ERR_ABORTED` same as Production                                                                                                                               | Expected                                                                                  |
| Authenticated cookie injection failed: `NODE_ENV=production` sets `Secure` `__Secure-authjs.session-token`; Chromium will not persist it on `http://app.localhost` | Expected localhost vs Production cookie split (**E5 P3** diagnostic limitation)           |
| `staff-operator-local.json` records that failed cookie pass (stayed on Sign in) — **not** an application 401 on a valid password                                   | Limitation, not a login defect                                                            |

---

## F. Terminal findings

**`pnpm dev`:** Next.js 16.3.5 Turbopack ready. Notice `Experiments … serverActions` (**E4 P3**). Meaningful lines: `HEAD /favicons/site.webmanifest 404` (twice); `[browser]` hydration dump for marketing home; `POST /api/auth/login 401` (invalid) and `200` (valid); authenticated GETs 200; operator support actions 200; post-exit 307. No Prisma connection/query errors. No stack traces on those flows.

**`pnpm start`:** Ready in 84ms. No runtime errors while serving the public/auth/patient audit.

**`pnpm build`:** exit 0. Prisma Client 7.10.0 generated. Schema gate skipped (not Vercel production). Only notice: experimental `serverActions`. No metadata/dynamic-rendering/source-map/bundle warnings.

---

## G. Network / HTTP findings

### Unexpected

| Status   | URL                          | Hosts                  | Why                                                                                                                                                   |
| -------- | ---------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404 HTML | `/favicons/site.webmanifest` | Marketing apex, tenant | Proxy matcher does not exclude `webmanifest`; rewrite hits catch-all `notFound()`. File exists at `public/favicons/site.webmanifest`. Staff host 200. |

### Expected

| Status                                        | When                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| 401 POST `/api/auth/login`                    | Invalid credentials test                                                      |
| 404 `/api/health` on marketing                | Staff-host-only health                                                        |
| 404 `/favicon.ico` at site root               | No `app/favicon.ico` by contract; metadata uses `/favicons/favicon.ico` (200) |
| 307 `/guides` `/practice` after operator exit | Lost clinic workspace context                                                 |
| 404 `/_vercel/insights                        | speed-insights/script.js`                                                     | Local `pnpm start` only |
| `ERR_ABORTED` `?_rsc=`                        | Cancelled App Router prefetch                                                 |

### Clinic / font assets

- Demo clinic favicon PNG 200, `content-type: image/png`, `Cross-Origin-Resource-Policy: same-site` (correct for `demodental.` → `assets.` same site `riveraftercare.com.au`).
- Geist WOFF2 200 `font/woff2` on all surfaces. Staff also loads Geist Mono. Inter binary only when that family is selected.

---

## H. React / hydration findings

**One root cause, marketing only, grouped.**

`motion/react` `useReducedMotion()` returns `null` during SSR and `false` (motion OK) or `true` (reduced) on the client.

- `MarketingRevealCard`: `motionOn = reduced === false` → **false on SSR**, **true on client** (normal preference). SSR: `initial={false}`, `data-mk-pending={null}`. Client: `initial="hidden"` → inline `opacity: 0; transform: translateY(14px)`, `data-mk-pending=""`.
- `MarketingRevealItem`: always sets `data-mk-pending=""`; client still applies hidden `style` that SSR omitted.

React 19 message (dev only): “A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.” Diff shows `+ opacity/transform` and `data-mk-pending="" vs {null}`.

Production Playwright: **not logged**. That does not prove the DOM matched; production often omits this warning. CSS `html[data-mk-motion="enhance"] .mkReveal[data-mk-pending]` can only hide cards that have the attribute; SSR cards without it can flash visible.

No duplicate-key, controlled/uncontrolled, “Cannot update while rendering”, or nesting warnings on audited staff/patient/auth routes.

Staff/patient `html` uses `suppressHydrationWarning` for theme class — no mismatch logged.

---

## I. Next.js findings

- Hostname proxy (`proxy.ts`) + marketing/tenant catch-alls: unmatched static-looking paths that are **not** in the matcher exclusion become HTML 404 pages. That is why `webmanifest` 404s while `png`/`ico`/`svg` 200.
- RSC aborted fetches: framework navigation, not failed pages (`navStatus` 200).
- `experimental.serverActions.bodySizeLimit: "2mb"` in `next.config.ts` prints the experiments notice. Not a functional error.
- Layouts mount `@vercel/analytics` + `@vercel/speed-insights`. 200 on Vercel; 404 locally.
- No Next.js Image / Link / metadata API warnings in build output.
- Source maps: Playwright recorded **0** `.map` failures. `/_next/static/not-found.txt` is 200 text (not a DevTools 403 in this pass).

---

## J. Auth / cookie findings

| Cookie           | Production                                                                                                | Local HTTP `pnpm start`                             | Local `pnpm dev`                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Session          | `__Secure-authjs.session-token` when `NODE_ENV==='production'` (`Secure`, HttpOnly, SameSite=Lax, Path=/) | Chromium will not store Secure cookies on `http://` | `authjs.session-token` Secure=false — session injection works |
| Theme            | `aftercare-guide-ui-theme` (not HttpOnly, SameSite=Lax, Domain `.riveraftercare.com.au`)                  | `.localhost`, Secure=false                          | same                                                          |
| Operator support | `river_operator_support_clinic` same flags as session                                                     | not fully cookie-audited on `pnpm start`            | set/cleared; exit 307                                         |

No SameSite console warnings in Playwright. No third-party cookie warnings for River cookies. Do not treat localhost Secure-cookie refusal as a Production defect.

Invalid login is JSON 401 with UI “Invalid email or password.” — expected.

Confirm-email-change / accept-invitation / reset-password were loaded as **empty-token shells** only (200). Token consumption was not run (would mutate).

---

## K. Asset / favicon / font findings

### Favicon / manifest

| Resource                     | Marketing                                  | Staff                           | Tenant (clinic favicon configured)                              |
| ---------------------------- | ------------------------------------------ | ------------------------------- | --------------------------------------------------------------- |
| River PNG/ICO pack           | 200                                        | 200                             | 200 (matcher excludes png/ico)                                  |
| `/favicons/site.webmanifest` | **404 HTML**                               | 200 `application/manifest+json` | **404 HTML**                                                    |
| HTML `rel=manifest`          | present                                    | present                         | present (from `PRODUCT_HEAD_METADATA` on aftercare root layout) |
| Tab icons                    | River pack                                 | River pack                      | clinic PNG on `assets.` 200                                     |
| Root `/favicon.ico`          | 404 if requested; Chromium did not request | n/a                             | n/a                                                             |

Manifest icons `/favicons/android-chrome-192x192.png` and `512` are 200 **when the manifest itself loads** (staff). On marketing/tenant the manifest never loads, so PWA/add-to-home-screen naming is broken there.

### Fonts

- Default Geist: one latin WOFF2, `font/woff2`, 200. MIME correct. No decode warnings except Turnstile’s third-party OTS on contact.
- Inter selected locally: Inter WOFF2 + Geist (layout variable still present). Catalogue unused files **not** downloaded.
- No preload-unused warnings captured.

---

## L. Prisma / database findings

No connection, pool, schema-mismatch, unique-constraint, or transaction errors in local terminals during this audit. Production `/api/health` returned `{"status":"ok"}` (pooled `SELECT 1`). Migrations were **not** run. Production DB was **not** touched. Client 7.10.0 generated cleanly at build.

---

## M. CSP / security findings

Playwright: **0** CSP violations, **0** mixed-content, **0** CORP failures on audited pages. Clinic PNG uses `CORP: same-site` and loads from tenant (same registrable domain).

HTML document responses from Vercel currently expose **HSTS** and little else (no document `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` on marketing/staff/tenant HTML). Asset routes set `CSP: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`. Absence of document CSP is a **hardening observation**, not a console error, and was **not** treated as a P0/P1 — do not relax CSP; adding one is a separate security task.

---

## N. Client / server logging findings

Grep of `console.*` in `app/` and `lib/`:

| Location                                                                                       | Class                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/auth/account-security-log.ts`, `password-lifecycle-log.ts`, `invitation-lifecycle-log.ts` | Intentional server audit (`userId`, event names). No passwords/tokens. `server-only`. |
| `lib/clinic-assets/*`, `lib/platform-assets/*`                                                 | Server warn on R2/delivery failure                                                    |
| `lib/realtime/*`, parked `lib/sessions/*`                                                      | Server warn/debug for broadcast                                                       |
| `app/api/health/route.ts`                                                                      | `console.info` when DB unavailable                                                    |
| `tests/change-password.test.ts`                                                                | Asserts source does **not** log tokens                                                |
| `scripts/*`, `prisma/seed.mjs`                                                                 | CLI / seed only                                                                       |

No accidental client `console.log` in audited UI. Do not strip the structured auth logs.

Production Vercel / Better Stack **application logs were not available** in this environment (no Vercel log CLI credentials). Not invented.

---

## O. Expected / noise findings

**A. Real defects:** E1 manifest 404; E2 marketing reveal hydration.

**B. Expected framework:** RSC abort; Auth.js 401 on bad password; unauth redirect to login; operator-exit 307; health 404 off staff host; `Secure` cookies on HTTP localhost.

**C. Dev-only:** React hydration dump; Next telemetry blurb; Turbopack compile; `serverActions` experiment notice.

**D. Third-party:** Cloudflare Turnstile in headless Chromium (adapters, PAT 401, OTS, WebGL, `brunhild` DNS). Not River JS.

**E. Stale cache / SW:** **No service worker is registered.** Fresh Playwright context. Findings persist without cache (curl 404 on production manifest).

**F. Needs more evidence:** Production authenticated staff/operator console (no prod session). Token-bearing `/confirm-email-change` and `/reset-password`. Vercel/Better Stack request logs. Whether Safari/Firefox still request `/favicon.ico`. Whether production users see a marketing reveal flash despite no console warning.

---

## P. Full error inventory

| ID  | Severity | Environment                                                    | Route(s)                                                                                                        | Type                | Exact message summary                                                                                                                            | Root cause                                                                                                                                                                                                                             | User impact                                                                                                                       | Reproducible?                              | Recommended action                                                                                                                                                                     |
| --- | -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | P2       | Production + local all modes                                   | Marketing `rel=manifest`; tenant `rel=manifest`; `HEAD/GET /favicons/site.webmanifest` on apex and `demodental` | Network 404         | `HEAD /favicons/site.webmanifest 404`; curl `x-matched-path: /_marketing/[...slug]` / `/_sites/[tenant]/[guideSlug]/[...rest]`; HTML `text/html` | `proxy.ts` matcher excludes `svg\|png\|…\|ico` but **not** `webmanifest`. Unknown extensions rewrite into catch-alls that `notFound()`. File is in `public/favicons/site.webmanifest`. Staff host skips marketing/tenant rewrite → 200 | Tab icons still work. PWA/manifest consumers get an HTML 404. Tenant still advertises River manifest while using clinic PNG icons | Yes (curl)                                 | Add `webmanifest` (and consider `json`/`txt` already handled via crawl paths) to the proxy exclusion; e2e GET 200 on all three hosts                                                   |
| E2  | P2       | `pnpm dev` console; likely silent on Production / `pnpm start` | Marketing pages using reveal (`/` and any page with `MarketingRevealCard`/`Item`)                               | React hydration     | “A tree hydrated but some attributes… didn't match”; `+ opacity: 0; transform: translateY(14px)`; `data-mk-pending="" vs {null}`                 | `useReducedMotion()` is `null` on SSR so `motionOn` is false; client `false` means motion on                                                                                                                                           | DevTools noise in development; possible visible flash before reveal CSS/motion apply. Does not block clicks in audit              | Yes locally in dev; Production did not log | SSR-safe reduced-motion snapshot (treat `null` as “motion pending/off” consistently)                                                                                                   |
| E3  | P3       | Local `pnpm start` only                                        | All layouts that mount Analytics/Speed Insights                                                                 | Network 404         | `Failed to load resource: 404` `/_vercel/insights/script.js` and `speed-insights/script.js`                                                      | Platform scripts exist on Vercel (200); local `next start` has no injector                                                                                                                                                             | None in Production. Noisy local prod-mode console                                                                                 | Yes locally                                | Optional: skip injecting those scripts when `VERCEL_ENV` unset. Do not change Production                                                                                               |
| E4  | P3       | Build + `next dev` + `next start`                              | n/a                                                                                                             | Next.js notice      | `Experiments (use with caution): serverActions`                                                                                                  | `next.config.ts` `experimental.serverActions.bodySizeLimit`                                                                                                                                                                            | None                                                                                                                              | Yes                                        | Leave until Next documents a non-experimental body size API                                                                                                                            |
| E5  | P3       | Local HTTP `pnpm start`                                        | Staff session                                                                                                   | Cookie              | Session cookie not stored; Playwright stayed on `/login` after cookie inject                                                                     | `Secure` + `__Secure-` prefix require HTTPS                                                                                                                                                                                            | None in Production HTTPS                                                                                                          | Yes on HTTP localhost                      | Document; use `pnpm dev` or HTTPS for local prod-mode auth. Not an app bug                                                                                                             |
| E6  | P3       | Production if a client requests it                             | Apex `/favicon.ico`                                                                                             | Network 404         | `x-matched-path: /[...slug]`                                                                                                                     | Product contract: no root `app/favicon.ico`; pack lives at `/favicons/favicon.ico`                                                                                                                                                     | Chromium with metadata did not request it. Legacy clients might                                                                   | Curl 404                                   | Do **not** add `app/favicon.ico`. Optional: proxy exclusion already has `favicon.ico` — still 404s because the **file is not at `/favicon.ico`**. Only fix if real browsers request it |
| E7  | P3       | Production `/contact` headless                                 | `/contact`                                                                                                      | Third-party console | Turnstile “No available adapters”, OTS WOFF, WebGL stall, PAT 401, `brunhild` DNS                                                                | Cloudflare widget in headless Chromium                                                                                                                                                                                                 | Real browsers with Turnstile adapters: contact form is the supported path. Do not change CSP to “fix” headless                    | Headless yes                               | Ignore unless a real-browser contact report appears                                                                                                                                    |
| E8  | P3       | All                                                            | Any App Router Link nav                                                                                         | `requestfailed`     | `net::ERR_ABORTED` on `?_rsc=`                                                                                                                   | Cancelled RSC prefetch                                                                                                                                                                                                                 | None; pages still 200                                                                                                             | Yes                                        | Ignore                                                                                                                                                                                 |

---

## Q. Root-cause analysis (real issues)

### E1 — manifest 404 on marketing and tenant

- **Symptom:** `GET/HEAD /favicons/site.webmanifest` returns HTML 404. Metadata still emits `rel="manifest"`.
- **Exact:** Production `x-matched-path: /_marketing/[...slug]` (apex) and `/_sites/[tenant]/[guideSlug]/[...rest]` (tenant). Local `pnpm dev`: `HEAD /favicons/site.webmanifest 404`.
- **Reproduction:** `curl -sI https://riveraftercare.com.au/favicons/site.webmanifest` → 404. Same path on `app.` → 200.
- **Source:** `proxy.ts` `config.matcher`; `lib/tenancy/paths.ts` `marketingRewritePath` catch-all; `app/(marketing)/%5Fmarketing/[...slug]/page.tsx` `notFound()`; tenant `[...rest]` catch-all; `lib/seo/icons.ts` `PRODUCT_HEAD_METADATA.manifest`; `app/(marketing)/layout.tsx`, `app/(staff)/layout.tsx`, `app/(aftercare)/layout.tsx`.
- **Why staff works:** Staff classification does not rewrite unknown files into `/_marketing` or `/_sites`.
- **Why PNG works:** matcher already skips `png|…|ico`.
- **Impact:** Manifest-aware browsers / install prompts fail on apex and patient hosts. Tab favicon OK.
- **Fix:** Extend matcher: `webmanifest` (and any other static suffix still rewritten). Add Playwright GET 200 for marketing + tenant + staff. Do not remove tenant `rel=manifest` in the same change unless product wants clinic-specific manifests (explicitly out of scope today).
- **Confidence:** high.

### E2 — marketing reveal hydration

- **Symptom:** Dev console + `pnpm dev` `[browser]` hydration dump on marketing home (and any reveal tree).
- **Exact:** React 19 hydration-mismatch URL; client adds `opacity: 0` / `translateY(14px)`; `MarketingRevealCard` `data-mk-pending` `""` vs `{null}`.
- **Reproduction:** `pnpm dev`, open `http://localhost:3000/` in Playwright Chromium without extensions.
- **Source:** `app/(marketing)/components/marketing-reveal.tsx` — `useReducedMotion()` from `motion/react`; `motionOn = reduced === false`; `MarketingRevealItem` always pending; `MarketingRevealCard` pending only when `motionOn`.
- **SSR vs client:** Server `reduced === null`; client `reduced === false` under default OS motion.
- **Impact:** Development noise; possible first-paint flash. Production audit did not log it; UI remained interactive.
- **Fix:** Treat `null` as a defined SSR value (e.g. `useSyncExternalStore` getServerSnapshot `true` to skip motion until mount, or default `motionOn` false until `reduced !== null`). Keep CSS hide aligned with the same snapshot. Do not suppress the console.
- **Confidence:** high for cause; medium for Production user-visible flash (not captured on video).

---

## R. Recommended fix sequence (do not implement in this PR)

### PHASE 1 — genuine errors / broken requests

1. **E1 webmanifest 404**
   - Files: `proxy.ts`; likely `e2e` icon/manifest helper (`e2e/helpers/head-icons.ts`, `e2e/clinic-favicon.spec.ts` or a small GET spec).
   - Risk: low (static file already in `public/`).
   - Migration: none.
   - Production behavior: marketing + tenant manifest 200 instead of HTML 404.
   - Tests: GET 200 + `content-type` includes `manifest` or `json` on apex, staff, tenant; existing favicon e2e still green.

### PHASE 2 — React/Next runtime correctness

2. **E2 SSR-safe `useReducedMotion`**
   - Files: `app/(marketing)/components/marketing-reveal.tsx`; possibly `app/(marketing)/marketing.css` if pending attribute semantics change.
   - Risk: medium (motion timing / reduced-motion a11y).
   - Migration: none.
   - Production: should remove silent mismatch; may slightly change first-frame animation.
   - Tests: marketing Playwright that pageerror/console has no hydration; reduced-motion still skips animation.

### PHASE 3 — warnings / deprecations

3. **E4** leave `serverActions` notice until a stable config exists.
4. **E6** only if analytics show real `/favicon.ico` traffic — do not violate the no-root-favicon contract.

### PHASE 4 — cleanup / noise

5. **E3** optionally gate Vercel Analytics/Speed Insights on `VERCEL_ENV`.
6. **E5/E7/E8** documentation / ignore.

---

## S. Files likely to change (future fix PRs)

- `proxy.ts`
- `app/(marketing)/components/marketing-reveal.tsx`
- e2e specs/helpers for manifest + hydration
- optionally `lib/telemetry/vercel-web-analytics.tsx` / layout SpeedInsights mounts
- this inventory is **not** an application change

---

## T. Tests required for each fix

| Fix | Tests                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Playwright GET `/favicons/site.webmanifest` 200 on marketing, staff, tenant hosts; `content-type` not `text/html`; existing `e2e/clinic-favicon.spec.ts` / head-icon helpers |
| E2  | Marketing e2e: no hydration `console.error` / `pageerror`; smoke `/` `/pricing` `/clinics`; `prefers-reduced-motion` still usable                                            |
| E3  | Optional unit: analytics component returns null off Vercel; e2e should not require it                                                                                        |
| E4  | none                                                                                                                                                                         |

Do not run a full e2e suite solely to land this **investigation** PR.

---

## U. Follow-up PR shape

**Split:**

1. Small PR: proxy matcher + manifest e2e (Phase 1). Low risk, Production-visible 404 fix.
2. Separate PR: marketing reveal SSR (Phase 2). Needs visual/a11y care.
3. Optional later: local Analytics 404 gate.

Do not combine with account/branding/operator work. Do not mix CSP hardening into the manifest PR.

---

## Limitations (honest)

- Production staff/operator **authenticated** DevTools were not captured (no safe Production session).
- Local `pnpm start` authenticated Playwright failed on Secure cookies over HTTP.
- Local `pnpm dev` **did** serve authenticated dashboard/practice/guides/account/operator support (200/307) with no 500s; first harness `waitForURL(load)` timed out so some JSON buckets are incomplete. Terminal excerpt is the source of truth for those statuses.
- Vercel dashboard / Better Stack error streams: **unavailable** here.
- No application code was changed; no diagnostic logging was left in the product.

---

**ACTIONABLE ERRORS FOUND — FIX PLAN READY**
