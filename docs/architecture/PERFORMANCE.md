# Performance — patient aftercare surface

This is an engineering contract for the **patient** multi-tenant surface. Staff/admin and parked chairside may keep Tailwind.

Authoritative styling decision: [ADR 0011](../adr/0011-patient-styling-uses-css-modules-and-semantic-runtime-tokens.md).

## Rules

1. Patient UI defaults to React Server Components.
2. Tenant branding is applied with **server-rendered CSS custom properties** on the tenant wrapper. The first HTML document must already be branded.
3. Patient components use **CSS Modules** (`*.module.css`) against semantic tokens (`--cg-brand`, `--cg-on-brand`, …), not raw `primaryColor` field names.
4. No runtime CSS-in-JS (no styled-components, Emotion, runtime class generators).
5. No arbitrary tenant CSS. `ClinicProfile` must not grow `customCss`, `cssOverride`, `stylesheet`, or `headerHtml` fields. Future options (typography preset, corner style, logo placement) map to predefined tokens.
6. Tailwind is isolated to the staff/admin (and parked chairside) root layout. Do not `@import "tailwindcss"` from the aftercare root.
7. Route CSS payload is measured from a **production** `next build` + `next start`, not from `next dev`.
8. Custom fonts and other third-party assets require an explicit performance review. Clinic typefaces are a curated `next/font` allowlist, self-hosted, loaded from the patient tenant layout with `preload: false`. Marketing and staff keep Geist. Do not load `fonts.googleapis.com` / `fonts.gstatic.com` at runtime.
9. Performance regressions should be measured before acceptance. Do not optimise from assumptions alone.

Staff Tailwind `@theme` is **build-time**. Tenant tokens are **runtime CSS custom properties**. Do not put tenant colours in Tailwind `@theme`.

## How to measure

From a production server (`pnpm build && pnpm start`):

```bash
curl -sS "http://localhost:3000/"
curl -sS "http://demodental.localhost:3000/"
```

For each HTML response:

1. Collect `link[rel=stylesheet]` hrefs and `<script src>` values.
2. Fetch each CSS asset and record raw bytes, gzip (`gzip -9`), and Brotli (quality 11).
3. Confirm whether the CSS contains Tailwind markers (`--tw-`, `@import "tailwindcss"` output).
4. Confirm whether the HTML includes `--cg-*` custom properties (tenant only).
5. Confirm no client component exists solely to apply branding.

Do not add Lighthouse or other large audit dependencies for this check.

## Baseline (Phase 1B, before isolation)

Measured 2026-08-31 against `feature/aftercare-phase-1` at `5b7b09a`, Next.js 16.3.3 production (`next start`).

| Metric                    |               Staff `/` |                           Tenant `demodental/` |
| ------------------------- | ----------------------: | ---------------------------------------------: |
| CSS files                 | 1 (`0fqe2trrvf7__.css`) |                                  1 (same file) |
| CSS raw                   |                  26,928 |                                         26,928 |
| CSS gzip -9               |                   6,354 |                                          6,354 |
| CSS Brotli q11            |                   5,495 |                                          5,495 |
| Tailwind present          |                     yes |                                        **yes** |
| Theme vars in first HTML  |                      no |                                             no |
| Styling-related client JS |  no (framework JS only) |                         no (framework JS only) |
| Geist fonts preloaded     |                     yes | html class present; no woff2 preload on tenant |

The tenant skeleton loaded the staff Tailwind stylesheet because both surfaces shared `app/layout.tsx` → `globals.css`.

Staff `/login` used the same CSS file (26,928 raw). `/dashboard` redirects unauthenticated clients to `/login` (307). Unknown tenant `unknown.localhost` returns a generic 404. Tenant `/login` is blocked by the hostname proxy (empty 404).

## After isolation (Phase 1B.5)

Measured 2026-08-31 against the same branch after the staff/aftercare root-layout split. Production `next start` on port 3001 (port 3000 still held the previous Phase 1B process). Next.js 16.3.3 **did** emit separate CSS for the two root layouts.

Tenant `demodental/` CSS files:

- `3659kj8kv42ie.css` — aftercare base (621 raw)
- `428gkmsbthoaf.css` — `practice-brand-proof` CSS Module (332 raw)

| Metric                    |             Before (tenant) |                                             After (tenant) |              Delta |
| ------------------------- | --------------------------: | ---------------------------------------------------------: | -----------------: |
| CSS files                 |                           1 |                                                          2 | +1 (base + module) |
| CSS raw bytes             |                      26,928 |                                                        953 |     −25,975 (−96%) |
| CSS gzip -9               |                       6,354 |                                                        564 |             −5,790 |
| CSS Brotli q11            |                       5,495 |                                                        444 |             −5,051 |
| Tailwind on tenant        |                         yes |                                                     **no** |           isolated |
| `--cg-*` in first HTML    |                          no | **yes** (`--cg-brand:#0f766e`, `--cg-on-brand:#ffffff`, …) |    server-rendered |
| Styling-related client JS |                        none |                                                       none |          unchanged |
| Geist on tenant           | html class from shared root |                                                     **no** |           isolated |

Staff `/` still loads Tailwind (`3_zekvhor4rt9.css`, 27,165 raw / 6,382 gzip / 5,533 Brotli). Staff URLs, login copy, and `app.localhost` behaviour are unchanged. Unknown tenant remains a generic 404. Tenant `/login` and `/dashboard` remain proxy 404s.

Tenant routes still download Next.js App Router runtime JS. That is framework JS, not theme/styling JS. Theme application requires **0** Client Components.

## Phase 1C budget

Do not accept a patient-route CSS regression that:

- reintroduces the staff Tailwind stylesheet on a tenant hostname;
- requires client JavaScript to apply clinic branding;
- adds arbitrary tenant CSS or a runtime CSS-in-JS library.

Measured Phase 1B.5 tenant CSS is **953 raw / 564 gzip / 444 Brotli**. Phase 1C will add real CSS Modules. Review before merging if tenant CSS would exceed:

|                            |   Raw | gzip -9 | Brotli q11 |
| -------------------------- | ----: | ------: | ---------: |
| Phase 1C tenant CSS budget | 8,192 |   3,072 |      2,560 |

That ceiling is about 8× the 1B.5 proof and still about 70% smaller than the pre-isolation Tailwind payload. Exceeding it is not an automatic product fail, but it requires a measured review. Loading Tailwind on the tenant route **is** an automatic fail.

## After Phase 1C (public patient experience)

Measured 2026-08-31 against `cursor/aftercare-phase-1c-8cd6` after replacing the 1B.5 brand proof with the real homepage and guide. Production `next start` on port 3001. Next.js 16.3.3.

Tenant CSS files (same on `/` and `/extraction`):

- `111_azndupn_s.css` — aftercare base (639 raw)
- `43vuvrb7qr0jf.css` — `patient.module.css` (4,239 raw)

| Metric                             |         1B.5 tenant `/` |           1C tenant `/` | 1C tenant `/extraction` |
| ---------------------------------- | ----------------------: | ----------------------: | ----------------------: |
| CSS files                          |                       2 |                       2 |                       2 |
| CSS raw bytes                      |                     953 |                   4,878 |                   4,878 |
| CSS gzip -9                        |                     564 |                   1,431 |                   1,431 |
| CSS Brotli q11                     |                     444 |                   1,151 |                   1,151 |
| Tailwind on tenant                 |                      no |                      no |                      no |
| `--cg-*` in first HTML             |                     yes |                     yes |                     yes |
| Patient-specific Client Components |                       0 |                       0 |                       0 |
| Styling-related client JS          |                    none |                    none |                    none |
| Theme in first HTML                | `--cg-brand:#0f766e`, … | `--cg-brand:#0f766e`, … | `--cg-brand:#0f766e`, … |

Budget check (ceiling 8,192 raw / 3,072 gzip / 2,560 Brotli): **passed** on both tenant routes.

Tenant routes still download Next.js App Router runtime JS (framework chunks only). The tenant client-reference manifest lists Next internals (`error-boundary`, `http-access-fallback`, metadata, etc.) and **no** `app/(aftercare)` Client Components. Branding does not require client JavaScript.

Staff `/` still loads Tailwind (`3_zekvhor4rt9.css`, 27,165 raw / 6,356 gzip / 5,533 Brotli). Staff `/login`, `app.localhost`, unknown-tenant 404, and tenant `/login` + `/dashboard` proxy 404s are unchanged.

## Phase 1E acceptance (quality, performance, browser)

Measured 2026-09-01 against `cursor/aftercare-phase-1e-hardening` from `807a183`. Production `next start` on port 4173. Next.js 16.3.3.

Ongoing patient CSS budget (unchanged):

|                           |   Raw | gzip -9 | Brotli q11 |
| ------------------------- | ----: | ------: | ---------: |
| Phase 1 tenant CSS budget | 8,192 |   3,072 |      2,560 |

Tenant CSS files (same on `/` and `/extraction`):

- `25lyr2n1eceye.css` — aftercare base (720 raw)
- `2xee_qhb8ibf4.css` — `patient.module.css` (4,285 raw)

| Metric                             |                         Home `/` |     Guide `/extraction` |
| ---------------------------------- | -------------------------------: | ----------------------: |
| CSS requests                       |                                2 |                       2 |
| CSS raw bytes                      |                            5,005 |                   5,005 |
| CSS gzip -9                        |                            1,529 |                   1,529 |
| CSS Brotli q11                     |                            1,214 |                   1,214 |
| Tailwind on tenant                 |                               no |                      no |
| `--cg-*` in first HTML             |                              yes |                     yes |
| Patient-specific Client Components |                                0 |                       0 |
| Patient-specific client JS chunks  |                                0 |                       0 |
| Logo                               | 381 B `/demo/riverside-mark.svg` |                    same |
| Theme in first HTML                |          `--cg-brand:#0f766e`, … | `--cg-brand:#0f766e`, … |

Budget check: **passed**. The 1E delta versus 1C is overflow-wrap and a generic `.notFound` rule (~127 raw). No dead Phase 1B.5 proof CSS, no Tailwind, no staff styles, no duplicate rule cleanup worth doing.

### JavaScript

Patient routes still download Next.js App Router / Turbopack **framework** runtime. HTML lists several `_next/static/chunks/*.js` files plus one `nomodule` polyfill for legacy browsers. Chromium E2E intercepts found **no** chunks attributable to `app/(aftercare)` or other Care Guide patient Client Components.

| JS (framework runtime, not a product budget) | Home | Guide |
| -------------------------------------------- | ---: | ----: |
| Script tags in HTML (incl. nomodule)         |    7 |     7 |
| Patient-specific Client Component JS         |    0 |     0 |

Do **not** set an aggressive framework-runtime JS budget from this baseline. Next/React/Turbopack own those bytes. The accepted Care Guide baseline remains:

```
Patient-specific Client Components = 0
```

### Logo

`/demo/riverside-mark.svg` is same-origin, 381 bytes, `image/svg+xml`, explicit `width=40` `height=40`, decorative `alt=""`. `Cache-Control: public, max-age=0` with `ETag` is the Next `public/` default; the file is small enough that hashed immutable caching is not required. Keep native `<img>`. Do not switch to `next/image` for this SVG. Raster logo optimization, if needed later, belongs in an asset pipeline.

### Native `<a>` decision

Keep native anchors on the patient surface. Homepage → extraction and extraction → homepage are full document navigations.

Evidence:

- Pages are small (5 KB CSS, no patient Client Components).
- Navigation frequency is low (a patient opens a guide, then may return home).
- `next/link` would introduce client JS and prefetch behaviour for no measured UX gain.
- Keyboard Enter on the Tooth Extraction link already activates the native anchor.
- Browser-native behaviour stays robust without a client router.

Revisit only if a later phase adds authenticated or highly interactive patient UI.

### 404 distinction

- **Security routing 404:** hostname proxy returns an empty 404 for invalid/reserved hosts, direct `/_sites` / `/_marketing`, staff paths on a tenant or marketing host, and `/api/health` off the staff host. Do not brand these.
- **Application marketing 404:** unknown apex pages rewrite to `/_marketing/...` and render `app/(marketing)/not-found.tsx`.
- **Application staff 404:** unknown app-host paths render `app/(staff)/not-found.tsx`.
- **Application tenant 404:** unknown tenant, unknown/draft/disabled guide, or pinned draft revision render the aftercare not-found surfaces (“Page not found” / “This aftercare page is not available.”). Generic, practice-neutral copy on unknown-tenant failures. Known-tenant layout may still apply CSS variables around a missing guide; visible chrome does not advertise another tenant.

## After Phase 1F (public experience and branding foundation)

Measured 2026-09-06 against `cursor/aftercare-phase-1e-hardening` after the Phase 1F UI/routing work. Production `next start` on port 3001. Next.js 16.3.3.

Ongoing patient CSS budget (unchanged):

|                           |   Raw | gzip -9 | Brotli q11 |
| ------------------------- | ----: | ------: | ---------: |
| Phase 1 tenant CSS budget | 8,192 |   3,072 |      2,560 |

Tenant CSS files (same on `/` and `/extraction`):

- `0864u-a0z2a9f.css` — aftercare base (1,592 raw)
- `1xgy9-pgjfsyz.css` — `patient.module.css` (5,626 raw)

| Metric                             | 1E tenant `/` | 1F tenant `/` | 1F tenant `/extraction` | 1F marketing `/` |
| ---------------------------------- | ------------: | ------------: | ----------------------: | ---------------: |
| CSS files                          |             2 |             2 |                       2 |                2 |
| CSS raw bytes                      |         5,005 |         7,218 |                   7,218 |            6,296 |
| CSS gzip -9                        |         1,529 |         1,883 |                   1,883 |            1,688 |
| CSS Brotli q11                     |         1,214 |         1,567 |                   1,567 |            1,429 |
| Tailwind                           |            no |            no |                      no |               no |
| `--cg-*` in first HTML             |           yes |           yes |                     yes |               no |
| `--cg-radius` / dark media query   |            no |           yes |                     yes |               no |
| Patient-specific Client Components |             0 |             0 |                       0 |  n/a (marketing) |

Budget check (patient): **passed**. The 1F delta is the homepage/guide visual uplift plus radius and dark-scheme tokens. No Tailwind on tenant or marketing. Staff `app.localhost/` still loads Tailwind (27,330 raw / 6,408 gzip / 5,555 Brotli).

Dark/light: tenant tokens are server-emitted on `.aftercareTheme`, with `@media (prefers-color-scheme: dark)` overrides. Brand/accent colours are not inverted. There is **no** patient theme-toggle Client Component.

Marketing CSS is a separate root layout and stays lean (6,296 raw). It uses `next/link` for same-origin anchors only; that is marketing JS, not patient-specific Client Components.

Apex `/login` is a proxy 404. Staff login remains on `app.localhost/login`. Direct `/_marketing` is blocked like `/_sites`.

## After Phase 1F.1 (premium product experience)

Measured 2026-09-06 against `cursor/aftercare-phase-1e-hardening` after the Phase 1F.1 brand, presentation-settings, and theme-control work. Production `next build` (Next.js 16.3.3 / Turbopack).

The Phase 1 tenant CSS ceiling is **unchanged**:

|                           |   Raw | gzip -9 | Brotli q11 |
| ------------------------- | ----: | ------: | ---------: |
| Phase 1 tenant CSS budget | 8,192 |   3,072 |      2,560 |

Richer marketing and tenant design was not an excuse to raise that ceiling. Tenant CSS first exceeded 8,192 because theme-control rules lived in the hashed CSS Module and because the client island imported that module (pulling the class map into JS). The fix:

1. Keep patient chrome in CSS Modules against `--cg-*` tokens.
2. Put the optional theme control on short global classes in `aftercare.css` (`.ptc`, `.patientThemeSlot`).
3. Do **not** import CSS Modules from the theme-control Client Components.

The original 8,192 raw threshold remains reasonable. Do not raise it without a new measured review.

Dark/light no longer uses `@media (prefers-color-scheme: dark)` token overrides. Clinic `themeMode` serializes `html { color-scheme }`; semantic tokens use `light-dark()`. `html[data-theme-mode]` lets an optional patient preference override without a ThemeProvider. Clinic brand/accent colours are still not inverted.

### Tenant CSS (same on `/` and `/extraction`)

- `18kzypcy7h8-t.css` — aftercare base, including `.ptc` (2,913 raw / 924 gzip / 788 Brotli)
- `0d16u7jokxcm_.css` — `patient.module.css` (5,235 raw / 1,268 gzip / 1,039 Brotli)

| Metric                         | 1F tenant | 1F.1 tenant |
| ------------------------------ | --------: | ----------: |
| CSS files                      |         2 |           2 |
| CSS raw                        |     7,218 |   **8,148** |
| CSS gzip -9                    |     1,883 |   **2,192** |
| CSS Brotli q11                 |     1,567 |   **1,827** |
| Tailwind                       |        no |          no |
| `--cg-*` in first HTML         |       yes |         yes |
| Budget (8,192 / 3,072 / 2,560) |      pass |    **pass** |

### Tenant JavaScript

| Surface                                      | Patient-specific Client Components rendered | Theme-control chunk                                      |
| -------------------------------------------- | ------------------------------------------: | -------------------------------------------------------- |
| Riverside (`allowPatientThemeToggle = true`) |                   1 (`PatientThemeControl`) | `1v4h_seuffrwc.js` **1,199 raw / 631 gzip / 510 Brotli** |
| Harbor (`allowPatientThemeToggle = false`)   |                                           0 | Control not rendered; no ThemeProvider                   |

The shared tenant layout lists `patient-theme-control.tsx` in the client-reference manifest because the layout file contains a conditional `import()`. Harbor still must not show the control. Next/React framework runtime is unchanged and is not a product budget.

The accepted patient baseline is now:

```
Patient-specific Client Components rendered = 0 when allowPatientThemeToggle is false
Patient-specific Client Components rendered = 1 when allowPatientThemeToggle is true
```

### Marketing CSS

- `27c0zuqdpwg3t.css` — marketing base, including `.mtc` (2,499 raw / 795 gzip / 676 Brotli)
- `2-nr0h8xmodx-.css` — `marketing.module.css` (7,586 raw / 1,802 gzip / 1,552 Brotli)

| Metric         | 1F marketing | 1F.1 marketing |
| -------------- | -----------: | -------------: |
| CSS files      |            2 |              2 |
| CSS raw        |        6,296 |     **10,085** |
| CSS gzip -9    |        1,688 |      **2,597** |
| CSS Brotli q11 |        1,429 |      **2,228** |
| Tailwind       |           no |             no |

Marketing CSS is allowed to be larger than tenant CSS. It is still far below staff Tailwind (27,330 raw). No marketing CSS-in-JS.

### Marketing JavaScript

Isolated `MarketingThemeControl` Client Component. Production currently emits it in the same client chunk as `next/link`:

- `1sx-e9toe047y.js` — **9,962 raw / 4,047 gzip / 3,528 Brotli** (Link + theme control; not theme-only)

Do not treat that chunk as a theme-toggle budget. Comparable isolated theme-control size is the patient chunk above (~1.2 KB raw). No theme library.

Staff `app.localhost/` still loads Tailwind (`1d4zsgjtjjx9r.css`, 27,330 raw / 6,408 gzip / 5,555 Brotli).

Apex `/login` remains a proxy 404. Staff login remains on `app.localhost/login`.

## After Phase 1F.2 (recovery timeline and compact theme control)

Measured 2026-09-07 against `cursor/aftercare-phase-1e-hardening` after the Phase 1F.2 polish. Production `next build` (Next.js 16.3.3 / Turbopack).

The 8,192 raw ceiling had 44 bytes of headroom after 1F.1. Compact theme-control CSS replaced the segmented control, but the recovery timeline is real additional CSS. Duplicate timeline title/body rules were removed first. Remaining tenant CSS:

- `3x2sst5om57qc.css` — aftercare base, including compact `.ptc` popover (3,168 raw / 1,024 gzip / 866 Brotli)
- `27tw0ygq7mx2s.css` — `patient.module.css` with timeline (5,855 raw / 1,385 gzip / 1,131 Brotli)

| Metric         |  1F.1 |      1F.2 |    Delta |
| -------------- | ----: | --------: | -------: |
| CSS raw        | 8,148 | **9,023** | **+875** |
| CSS gzip -9    | 2,192 | **2,409** | **+217** |
| CSS Brotli q11 | 1,827 | **1,997** | **+170** |
| Tailwind       |    no |        no |        — |

gzip and Brotli remain under the previous 3,072 / 2,560 ceilings. Raw does not. Proposed tenant CSS budget after this review:

|                               |    Raw | gzip -9 | Brotli q11 |
| ----------------------------- | -----: | ------: | ---------: |
| Previous Phase 1 ceiling      |  8,192 |   3,072 |      2,560 |
| Phase 1F.2 tenant CSS ceiling | 10,240 |   3,072 |      2,560 |

Reason: data-driven recovery timeline (~0.9 KB raw after dedupe) plus a compact native popover. Still far below pre-isolation Tailwind (26,928 raw). Do not treat 10,240 as a target; prefer smaller.

### Tenant JavaScript

| Surface                                      | Patient-specific Client Components rendered | Theme-control chunk                                          |
| -------------------------------------------- | ------------------------------------------: | ------------------------------------------------------------ |
| Riverside (`allowPatientThemeToggle = true`) |                   1 (`PatientThemeControl`) | `3gup781hok6po.js` **2,885 raw / 1,272 gzip / 1,089 Brotli** |
| Harbor (`allowPatientThemeToggle = false`)   |                                           0 | Control not rendered                                         |

1F.1 isolated theme JS was 1,199 raw. The 1F.2 delta is the native popover plus three inline SVG glyphs in the shared `AppearanceMenu`. No theme library.

### Marketing theme JS

Marketing still shares a chunk with `next/link` (`0hq91uq9ps6t6.js`, 11,644 raw / 4,656 gzip / 4,059 Brotli). Do not treat that as theme-only. Comparable isolated size is the patient chunk above.

Marketing CSS (section surfaces + footer): 2,822 + 8,722 = **11,544** raw. Still far below staff Tailwind. No Tailwind on marketing.

## After Phase 1F.3 (visual simplification)

Measured 2026-09-07 against `cursor/aftercare-phase-1e-hardening` after the Phase 1F.3 document-led pass. Production `next build` (Next.js 16.3.3 / Turbopack).

Simplifying the visual system reduced tenant CSS instead of raising the budget. The 1F.2 10,240 raw review ceiling is no longer needed. Playwright enforces **≤ 9,023 raw** (the 1F.2 measured total). Actual 1F.3 tenant CSS is under 8,500.

Tenant CSS files (same on `/` and `/extraction`):

- `2m5gc51ajgv8t.css` — aftercare base, including compact `.ptc` popover (3,025 raw / 991 gzip / 829 Brotli)
- `1k9ytogdhntg9.css` — `patient.module.css` (5,457 raw / 1,372 gzip / 1,123 Brotli)

| Metric         |  1F.2 |      1F.3 |    Delta |
| -------------- | ----: | --------: | -------: |
| CSS raw        | 9,023 | **8,482** | **−541** |
| CSS gzip -9    | 2,409 | **2,363** |  **−46** |
| CSS Brotli q11 | 1,997 | **1,952** |  **−45** |
| Tailwind       |    no |        no |        — |

Light patient `--cg-surface` is `#ffffff`. Dark patient `--cg-surface` is `#111318`. Clinic `neutralColor` no longer paints the page canvas.

### Marketing CSS

Four chapter surfaces (`marketingBase` / `marketingSoft` / `marketingShowcase` / `marketingClosing`) replaced the 1F.2 band matrix.

- `2-5ujxf8om7f6.css` — marketing base, including `.mtc` (2,949 raw / 946 gzip / 798 Brotli)
- `30txgx-3cr1g_.css` — `marketing.module.css` (8,478 raw / 1,826 gzip / 1,577 Brotli)

| Metric   |   1F.2 |       1F.3 |    Delta |
| -------- | -----: | ---------: | -------: |
| CSS raw  | 11,544 | **11,427** | **−117** |
| Tailwind |     no |         no |        — |

Staff still loads Tailwind. No Tailwind on tenant or marketing.

## After Phase 1F.4 (marketing Motion + patient card/timeline polish)

Measured 2026-09-07 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.4. Production `next build` (Next.js 16.3.3 / Turbopack). Motion **13.2.0** (`motion` / `motion/react` / `motion/react-m`). No direct `framer-motion` import.

### Reduced-motion policy

Marketing bootstrap sets `html[data-mk-motion]=enhance|reduce` from `prefers-reduced-motion` before paint. Pending reveals are hidden with CSS only when `enhance`. A 1.6s `mk-fail-open` animation and a `<noscript>` override keep copy visible if JS never runs. `MotionConfig reducedMotion="user"` plus `initial={false}` when reduced skip entrance motion. Patient pages do not load Motion; the homepage card’s hover transform is CSS-only and disabled under `prefers-reduced-motion`.

### Tenant CSS

Guide-card hover/focus and the recovery-timeline surface added CSS. Aftercare base is unchanged from 1F.3 (`2m5gc51ajgv8t.css`, 3,025 raw / 985 gzip / 829 Brotli). `patient.module.css` grew (`1_n81f590gcs4.css`, 6,513 raw / 1,625 gzip / 1,370 Brotli).

| Metric           |  1F.3 |      1F.4 |      Delta |
| ---------------- | ----: | --------: | ---------: |
| CSS raw          | 8,482 | **9,538** | **+1,056** |
| CSS gzip -9      | 2,363 | **2,610** |   **+247** |
| CSS Brotli q11   | 1,952 | **2,199** |   **+247** |
| Tailwind         |    no |        no |          — |
| Motion on tenant |    no |        no |          — |

gzip and Brotli remain under 3,072 / 2,560. Raw exceeds the 1F.3 ceiling of 9,023. Playwright now enforces **≤ 9,538 raw** (this measured total). Do not treat 9,538 as a target; prefer smaller.

### Tenant JavaScript

Unchanged from 1F.2/1F.3. Riverside still loads `PatientThemeControl` (`3gup781hok6po.js`, **2,885 raw / 1,272 gzip / 1,089 Brotli**). Harbor does not. No Motion chunks on tenant home or `/extraction`.

### Marketing CSS

Chapter wash, fail-open reveal CSS, and the SVG wave added a little over 1 KB.

- `36u94vb-a_vkf.css` — marketing base, including `.mtc` and fail-open (3,495 raw / 1,141 gzip / 970 Brotli)
- `2x9cf5xfkz7rm.css` — `marketing.module.css` (9,208 raw / 1,983 gzip / 1,716 Brotli)

| Metric         |   1F.3 |       1F.4 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 11,427 | **12,703** | **+1,276** |
| CSS gzip -9    |  2,772 |  **3,124** |   **+352** |
| CSS Brotli q11 |  2,375 |  **2,686** |   **+311** |
| Tailwind       |     no |         no |          — |

### Marketing JavaScript

1F.3 marketing JS was theme control plus `next/link` (shared chunk ~11.6 KB raw). 1F.4 adds a LazyMotion island (`domAnimation` loaded async). Production Chromium captured three Motion-attributed chunks that tenant does not download:

| Chunk                       | Role                                            |         Raw |    gzip -9 | Brotli q11 |
| --------------------------- | ----------------------------------------------- | ----------: | ---------: | ---------: |
| `2nc761jkoferc.js`          | Marketing experience + theme menu               |      22,702 |      8,670 |      7,727 |
| `01t426ne8zhgx.js`          | Motion runtime (`motion/react-m`, `LazyMotion`) |      39,519 |     13,611 |     12,298 |
| `0xel--zsolmq6.js`          | Async `domAnimation` features                   |      37,896 |     13,973 |     12,677 |
| **Motion-attributed total** |                                                 | **100,117** | **36,254** | **32,702** |

Marketing page JS total (including Next/React runtime shared with tenant): 554,987 raw / 170,489 gzip / 147,944 Brotli. Tenant home: 457,540 raw / 135,309 gzip / 116,157 Brotli. The delta is the Motion island, not a leak onto patient routes.

Staff still loads Tailwind. No Tailwind on tenant or marketing.

## After Phase 1F.5 (hero composition)

Measured 2026-09-07 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.5. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion change. No marketing Client Component added for the hero or wave.

### Marketing CSS

Device-stage HTML/CSS and the light-hero token/wave work grew the marketing stylesheets.

- `0avfdld9pd1em.css` — marketing base, including `.mtc`, fail-open, and wave (3,990 raw / 1,282 gzip / 1,091 Brotli)
- `0-ow7zon09p8z.css` — `marketing.module.css` (12,348 raw / 2,708 gzip / 2,324 Brotli)

| Metric         |   1F.4 |       1F.5 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 12,703 | **16,338** | **+3,635** |
| CSS gzip -9    |  3,124 |  **3,990** |   **+866** |
| CSS Brotli q11 |  2,686 |  **3,415** |   **+729** |
| Tailwind       |     no |         no |          — |

Source CSS before this pass: `marketing.css` 3,300 + `marketing.module.css` 8,199 = **11,499**. After: 4,011 + 11,533 = **15,544** (**+4,045**).

### Marketing JavaScript

Hero and wave remain Server Components. Marketing client JS is unchanged from 1F.4 (theme control + existing LazyMotion island). **Hero-attributed client JS added: 0.**

Motion chunks on marketing, unchanged:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2nc761jkoferc.js` | Marketing experience + theme menu               | 22,702 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

No `marketing-product-preview` client chunk.

### Tenant CSS / JS

Unchanged from 1F.4. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.6 (premium mobile hero)

Measured 2026-09-07 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.6. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion change. No marketing Client Component added for the phone shell or separator.

### Marketing CSS

Removing the desktop mockup offset the larger phone shell and layered SVG separator. Built CSS is slightly smaller than 1F.5.

- `11pjz_niocr-h.css` — marketing base, including `.mtc`, fail-open, and wave (4,172 raw / 1,326 gzip / 1,154 Brotli)
- `3z74oeid3l3yh.css` — `marketing.module.css` (12,085 raw / 2,706 gzip / 2,337 Brotli)

| Metric         |   1F.5 |       1F.6 |   Delta |
| -------------- | -----: | ---------: | ------: |
| CSS raw        | 16,338 | **16,257** | **−81** |
| CSS gzip -9    |  3,990 |  **4,032** | **+42** |
| CSS Brotli q11 |  3,415 |  **3,491** | **+76** |
| Tailwind       |     no |         no |       — |

Source CSS before this pass: `marketing.css` 4,011 + `marketing.module.css` 11,533 = **15,544**. After: 4,051 + 11,461 = **15,512** (**−32**).

### Marketing JavaScript

Phone preview and wave remain Server Components. Marketing client JS is unchanged from 1F.5 (theme control + existing LazyMotion island). **Hero-attributed client JS added: 0.**

Motion chunks on marketing, unchanged:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2nc761jkoferc.js` | Marketing experience + theme menu               | 22,702 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

No `marketing-product-preview` client chunk.

### Tenant CSS / JS

Unchanged from 1F.5. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.7 (hero spacing and CSS interactions)

Measured 2026-09-07 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.7. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion change. No marketing Client Component added for the phone shell, CTA states, or planned demo video.

### Future product-preview media

The hero phone stays a static Server Component. A later pass may play a short loop **inside** `PhoneScreen`:

- Preferred: WebM + MP4 fallback, `autoplay muted loop playsInline`, poster / static fallback
- Rejected: GIF (larger, worse quality, no playback control)

Do not add the video, a video dependency, or a Client Component until that pass.

### Marketing CSS

Interaction tokens, CTA/nav/theme states, a larger phone shell, and hero spacing grew the marketing stylesheets.

- `00m6kwx3do-7f.css` — marketing base, including `.mtc` and `--mk-interact-duration` (5,295 raw / 1,497 gzip / 1,328 Brotli)
- `3wlgpaj9etdp8.css` — `marketing.module.css` (15,076 raw / 3,171 gzip / 2,743 Brotli)

| Metric         |   1F.6 |       1F.7 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 16,257 | **20,371** | **+4,114** |
| CSS gzip -9    |  4,032 |  **4,668** |   **+636** |
| CSS Brotli q11 |  3,491 |  **4,071** |   **+580** |
| Tailwind       |     no |         no |          — |

Source CSS before this pass: `marketing.css` 4,051 + `marketing.module.css` 11,461 = **15,512**. After: 5,319 + 14,579 = **19,898** (**+4,386**).

### Marketing JavaScript

Phone preview, wave, and CTA states remain Server Components / CSS. Marketing client JS is unchanged from 1F.6 (theme control + existing LazyMotion island). **Hero-attributed client JS added: 0.**

Motion chunks on marketing, unchanged:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2nc761jkoferc.js` | Marketing experience + theme menu               | 22,702 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

No `marketing-product-preview` client chunk.

### Tenant CSS / JS

Unchanged from 1F.6. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.8 (real iPhone frame and hero atmosphere)

Measured 2026-09-08 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.8. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion change. No marketing Client Component added for the device frame or atmosphere.

### Device asset

`public/marketing/iphone-frame.webp` — punched-screen hardware overlay from the Rivers Digital Catión Sanity mockup (`cationBlue.png`, 1450×2936 PNG, 456,339 bytes). Optimized to 800×1620 WebP with alpha.

| Form            |   Bytes |
| --------------- | ------: |
| Source PNG      | 456,339 |
| WebP raw        |  19,492 |
| WebP gzip -9    |  17,748 |
| WebP Brotli q11 |  17,672 |

Native `<img width="800" height="1620" fetchPriority="low">`. Not preloaded. Decorative (`alt=""`, ancestor `aria-hidden`). H1 remains the intended LCP text.

### Marketing CSS

Removing the CSS bezel/island/glass system offset the new atmosphere layers. Built CSS is essentially unchanged from 1F.7.

- `3vf215wy71yja.css` — marketing base, including `.mtc` and atmosphere tokens (5,369 raw / 1,529 gzip / 1,354 Brotli)
- `2gc2lszibarnp.css` — `marketing.module.css` (14,969 raw / 3,192 gzip / 2,752 Brotli)

| Metric         |   1F.7 |       1F.8 |       Delta |
| -------------- | -----: | ---------: | ----------: |
| CSS raw        | 20,371 | **20,338** |     **−33** |
| CSS gzip -9    |  4,668 |  **4,721** |     **+53** |
| CSS Brotli q11 |  4,071 |  **4,106** |     **+35** |
| Tailwind       |     no |         no |           — |
| Phone asset    |      0 | **19,492** | **+19,492** |

Source CSS before this pass: `marketing.css` 5,319 + `marketing.module.css` 14,579 = **19,898**. After: 5,450 + 14,361 = **19,811** (**−87**).

### Marketing JavaScript

Phone preview, wave, atmosphere, and CTA states remain Server Components / CSS. Marketing client JS is unchanged from 1F.7 (theme control + existing LazyMotion island). **Hero-attributed client JS added: 0.** Native `<img>` is used instead of `next/image` so the frame does not introduce a Client Component.

No `marketing-product-preview` client chunk.

### Tenant CSS / JS

Unchanged from 1F.7. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.9 (mobile preview and responsive rhythm)

Measured 2026-09-08 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.9. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion change. No marketing Client Component added for mobile nav, section tokens, or phone-screen content.

### Marketing CSS

Richer phone-screen hierarchy, mobile nav hide rules, and spacing tokens grew the marketing stylesheets.

- `2_6c602dehogx.css` — marketing base, including `.mtc` 44px trigger and `--mk-section-pad-y` (5,454 raw / 1,571 gzip / 1,389 Brotli)
- `355uh364b7iq8.css` — `marketing.module.css` (17,150 raw / 3,587 gzip / 3,088 Brotli)

| Metric         |   1F.8 |       1F.9 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 20,338 | **22,604** | **+2,266** |
| CSS gzip -9    |  4,721 |  **5,158** |   **+437** |
| CSS Brotli q11 |  4,106 |  **4,477** |   **+371** |
| Tailwind       |     no |         no |          — |
| Phone asset    | 19,492 | **19,492** |      **0** |

Source CSS before this pass: `marketing.css` 5,450 + `marketing.module.css` 14,361 = **19,811**. After: 5,543 + 16,394 = **21,937** (**+2,126**).

### Marketing JavaScript

Phone preview and mobile nav remain Server Components / CSS. Marketing client JS is unchanged from 1F.8 (theme control + existing LazyMotion island). **Hero-attributed client JS added: 0.** Chunk hashes unchanged:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2nc761jkoferc.js` | Marketing experience + theme menu               | 22,702 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

No `marketing-product-preview` client chunk.

### Tenant CSS / JS

Unchanged from 1F.8. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.10 (process rail, feature bento, theme popover)

Measured 2026-09-08 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.10. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion change. No new marketing Client Component.

### Marketing CSS

Process rail, step/bento card surfaces, and product-native micro-visuals grew the marketing stylesheets. Shared `--mk-card*` / `--mk-rail*` tokens keep the new surfaces from becoming six bespoke card implementations.

- `0iro1ii8bt4zl.css` — marketing base, including restored `.mtc` popover (6,880 raw / 1,903 gzip / 1,704 Brotli)
- `0um3lkhos3n5j.css` — `marketing.module.css` (25,522 raw / 4,960 gzip / 4,317 Brotli)

| Metric         |   1F.9 |      1F.10 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 22,604 | **32,402** | **+9,798** |
| CSS gzip -9    |  5,158 |  **6,863** | **+1,705** |
| CSS Brotli q11 |  4,477 |  **6,021** | **+1,544** |
| Tailwind       |     no |         no |          — |

Source CSS before this pass: `marketing.css` 5,543 + `marketing.module.css` 16,394 = **21,937**. After: 7,082 + 24,228 = **31,310** (**+9,373**).

### Marketing JavaScript

Process and bento remain Server Components. Theme popover still uses the existing `AppearanceMenu` client boundary (icons + checkmark markup only). **New marketing client JS added: 0.** Motion chunk hash unchanged:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `3uq-mei83ku8e.js` | Marketing experience + theme menu               | 23,381 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

Theme-menu chunk delta vs 1F.9 (`22,702`): **+679** from inline SVG option glyphs. No `marketing-process` or `marketing-bento` client chunk.

### Tenant CSS / JS

Unchanged from 1F.9. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.11 (story clarity and interaction rhythm)

Measured 2026-09-08 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.11. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion entrance choreography. Chapter-wash observer removed. No new marketing Client Component.

### Marketing CSS

Replaced the six-item bento, blend gradients, and `--mk-chapter-bg` scroll wash with three benefit pillars, an editorial problem/product pair, a connected process rail, and a theme-aware light closing. Shared card/rail tokens kept the new surfaces from becoming one-off implementations.

- `0bw7doqwpg1ub.css` — marketing base (6,596 raw / 1,867 gzip / 1,652 Brotli)
- `2yo61e4ccybri.css` — `marketing.module.css` (26,252 raw / 5,032 gzip / 4,375 Brotli)

| Metric         |  1F.10 |      1F.11 |    Delta |
| -------------- | -----: | ---------: | -------: |
| CSS raw        | 32,402 | **32,848** | **+446** |
| CSS gzip -9    |  6,863 |  **6,899** |  **+36** |
| CSS Brotli q11 |  6,021 |  **6,027** |   **+6** |
| Tailwind       |     no |         no |        — |

Source CSS: `marketing.css` 6,794 + `marketing.module.css` 25,148 = **31,942** vs 1F.10 **31,310** (**+632**). The compiled payload grew slightly because the three-pillar + equation + underline work replaced more CSS than the bento/blend/wash removal saved. No Tailwind. No CSS-in-JS.

### Marketing JavaScript

Process, pillars, problem/product, and closing remain Server Components. **New marketing client JS added: 0.** Removing the chapter-wash `IntersectionObserver` slightly reduced the existing marketing experience chunk. Motion chunk hash unchanged:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2i-nz_vmh463e.js` | Marketing experience + theme menu               | 22,829 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

Experience+theme chunk delta vs 1F.10 (`23,381`): **−552**. No `marketing-process` or `marketing-pillars` client chunk.

## After Phase 1F.12 (design coherence and closing bookend)

Measured 2026-09-08 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.12. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion entrance choreography. No scroll-linked background. No new marketing Client Component.

### Marketing CSS

Replaced the product equation pills and disconnected Clinic Preview copy with a product assembly canvas, a patient-home preview, a four-column customisation strip, and a complementary closing atmosphere (top hairline + bottom-centre glow).

- `3sxa93kgoqe6-.css` — marketing base (6,939 raw / 1,920 gzip / 1,701 Brotli)
- `090-a5g4tk6p-.css` — `marketing.module.css` (31,803 raw / 5,818 gzip / 5,080 Brotli)

| Metric         |  1F.11 |      1F.12 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 32,848 | **38,742** | **+5,894** |
| CSS gzip -9    |  6,899 |  **7,738** |   **+839** |
| CSS Brotli q11 |  6,027 |  **6,781** |   **+754** |
| Tailwind       |     no |         no |          — |

Source CSS: `marketing.css` 7,167 + `marketing.module.css` 30,602 = **37,769** vs 1F.11 **31,942** (**+5,827**). Compiled payload grew because the assembly canvas, patient-home preview, and closing atmosphere added more CSS than the equation-pill removal saved. No Tailwind. No CSS-in-JS.

### Marketing JavaScript

Product assembly, patient preview, customisation strip, and closing atmosphere remain Server Components / static CSS. **New marketing client JS added: 0.** Experience and Motion chunk hashes unchanged from 1F.11:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2i-nz_vmh463e.js` | Marketing experience + theme menu               | 22,829 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

### Tenant CSS / JS

Unchanged from 1F.11. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.13 (early access composition and footer separator light)

Measured 2026-09-08 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.13. Production `next start` on port 4173. Next.js 16.3.3 / Turbopack. No new dependency. No Motion entrance choreography. No scroll-linked background. No new marketing Client Component.

### Marketing CSS

Replaced the Early Access one-column close and the bottom-centre footer glow with a ~58/42 conversion / design-partner layout, a centre-out secondary CTA fill, and a right-biased separator light source. Old footer `::after` bloom rules were removed.

- `13ryw6c_uwla7.css` — marketing base, including secondary-fill and closing-light tokens (7,208 raw / 1,957 gzip / 1,739 Brotli)
- `21qumm2dexteh.css` — `marketing.module.css` (34,217 raw / 6,157 gzip / 5,384 Brotli)

| Metric         |  1F.12 |      1F.13 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 38,742 | **41,425** | **+2,683** |
| CSS gzip -9    |  7,738 |  **8,114** |   **+376** |
| CSS Brotli q11 |  6,781 |  **7,123** |   **+342** |
| Tailwind       |     no |         no |          — |

Source CSS: `marketing.css` 7,550 + `marketing.module.css` 32,947 = **40,497** vs 1F.12 **37,769** (**+2,728**). Compiled payload grew with the design-partner column and separator atmosphere; removing the duplicated bottom-centre footer glow kept the increase modest. No Tailwind. No CSS-in-JS.

### Marketing JavaScript

Early Access markup, secondary fill, and footer atmosphere remain Server Components / static CSS. **New marketing client JS added: 0.** Experience and Motion chunk hashes unchanged from 1F.12:

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `2i-nz_vmh463e.js` | Marketing experience + theme menu               | 22,829 |
| `01t426ne8zhgx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

### Tenant CSS / JS

Unchanged from 1F.12. Tenant CSS files remain `2m5gc51ajgv8t.css` (3,025 raw) and `1_n81f590gcs4.css` (6,513 raw), **9,538** raw total. Playwright still enforces ≤ 9,538. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.14 (brand flexibility, theme radial fill, footer spacing)

Measured 2026-09-09 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.14. Production `next start` on port 4173. Next.js 16.3.4 / Turbopack. Direct stable dependency refresh. No Motion entrance choreography. No scroll-linked background. No new marketing Client Component. No font files added.

### Marketing CSS

Brand Flexibility cards, theme-trigger radial fill tokens, and footer atmosphere containment added a small amount of CSS. Public copy changes are markup-only.

- `1qfjnjfd-d6cs.css` — marketing base, including theme-fill and brand-card radius tokens (7,498 raw / 2,079 gzip / 1,863 Brotli)
- `0oox5e3si80fi.css` — `marketing.module.css` (34,519 raw / 6,237 gzip / 5,455 Brotli)

| Metric         |  1F.13 |      1F.14 |    Delta |
| -------------- | -----: | ---------: | -------: |
| CSS raw        | 41,425 | **42,017** | **+592** |
| CSS gzip -9    |  8,114 |  **8,316** | **+202** |
| CSS Brotli q11 |  7,123 |  **7,318** | **+195** |
| Tailwind       |     no |         no |        — |

Source CSS: `marketing.css` 7,959 + `marketing.module.css` 33,287 = **41,246** vs 1F.13 **40,497** (**+749**). No Tailwind. No CSS-in-JS. **0 font bytes.**

### Marketing JavaScript

Theme trigger hover is CSS on the existing AppearanceMenu island. **New marketing client JS added: 0.**

| Chunk              | Role                                            |    Raw |
| ------------------ | ----------------------------------------------- | -----: |
| `1slkl-e5d1g1x.js` | Marketing experience + theme menu               | 22,831 |
| `23ezo7tr8pa6u.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,519 |

### Tenant CSS / JS

Tenant CSS source was not modified in 1F.14. Playwright still enforces ≤ 9,538 raw on tenant routes when the local database is reachable. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.15 (mobile storytelling)

Measured 2026-09-09 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.15. Production `next start` on port 4173. Next.js 16.3.4 / Turbopack. No Motion entrance choreography. No new marketing Client Component.

### Marketing CSS

Product grid areas, stacked-card process connectors (replacing the unused mobile left rail), and 64px mobile top padding on Brand Flexibility / Early Access.

- `1qfjnjfd-d6cs.css` — marketing base, unchanged from 1F.14 (7,498 raw / 2,079 gzip / 1,863 Brotli)
- `3cs149tpt5hh3.css` — `marketing.module.css` (35,171 raw / 6,306 gzip / 5,501 Brotli)

| Metric         |  1F.14 |      1F.15 |    Delta |
| -------------- | -----: | ---------: | -------: |
| CSS raw        | 42,017 | **42,669** | **+652** |
| CSS gzip -9    |  8,316 |  **8,385** |  **+69** |
| CSS Brotli q11 |  7,318 |  **7,364** |  **+46** |
| Tailwind       |     no |         no |        — |

Source CSS: `marketing.css` 7,959 + `marketing.module.css` 33,868 = **41,827** vs 1F.14 **41,246** (**+581**). No Tailwind. No CSS-in-JS. **0 font bytes.** **New marketing client JS added: 0.**

### Tenant CSS / JS

Tenant CSS source was not modified in 1F.15. Playwright still enforces ≤ 9,538 raw on tenant routes when the local database is reachable. No Motion on tenant. Staff still loads Tailwind.

## After Phase 1F.16 (one-shot choreography)

Measured 2026-09-09 against `cursor/aftercare-phase-1e-hardening` after Phase 1F.16. Production `next start` on port 4173. Next.js 16.3.4 / Turbopack. Marketing Motion island now includes section-specific reveal items (process / pillars / assembly are marketing Client Components). Tenant still has no Motion.

### Marketing CSS

Loaded on `http://localhost:4173/`:

- `2c40otwjue16n.css` — marketing base (7,820 raw / 2,107 gzip / 1,874 Brotli)
- `32up745po2vku.css` — `marketing.module.css` (34,888 raw / 6,266 gzip / 5,468 Brotli)

| Metric         |  1F.15 |      1F.16 |   Delta |
| -------------- | -----: | ---------: | ------: |
| CSS raw        | 42,669 | **42,708** | **+39** |
| CSS gzip -9    |  8,385 |  **8,373** | **−12** |
| CSS Brotli q11 |  7,364 |  **7,342** | **−22** |
| Tailwind       |     no |         no |       — |

Source CSS: `marketing.css` 8,349 + `marketing.module.css` 33,440 = **41,789** vs 1F.15 **41,827** (**−38**). Fail-open keyframes and Early Access layout CSS were removed; compact closing CTA CSS was added. No Tailwind. No CSS-in-JS. **0 font bytes.**

### Marketing JavaScript

Loaded Motion-related chunks on the marketing homepage:

| Chunk              | Role                                            |    Raw | gzip -9 | Brotli |
| ------------------ | ----------------------------------------------- | -----: | ------: | -----: |
| `0cu7wbjz9hbf3.js` | Marketing experience + section reveals          | 35,418 |   8,915 |  7,833 |
| `290cfjrz3sdlx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,965 |  13,751 | 12,392 |

| Metric             |  1F.15 |      1F.16 |       Delta |
| ------------------ | -----: | ---------: | ----------: |
| Experience island  | 22,831 | **35,418** | **+12,587** |
| Motion runtime     | 39,519 | **39,965** |    **+446** |
| Motion-related raw | 62,350 | **75,383** | **+13,033** |

Theme control is now a separate 12,219-byte chunk (`17qg50x_rufn5.js`), split out of the old combined experience island. Process / pillars / product-assembly Client Components account for the experience-island increase. `domAnimation` remains a lazy `LazyMotion` feature import and is not in the initial `load` capture.

### Tenant CSS / JS

Tenant CSS source was not modified in 1F.16. A demodental request returned 500 in this session because Postgres credentials failed; the error-page scripts still contained **no Motion**. Source boundary tests continue to forbid `from "motion"` under `app/(aftercare)`. Staff still loads Tailwind.

## After Phase 1F.10 reveal timing (viewport + card-by-card)

Measured 2026-09-09 against `cursor/aftercare-phase-1e-hardening` after the viewport/card reveal pass. Production `next start` on port 4173. Next.js 16.3.4 / Turbopack. No new dependency. Motion remains `motion@13.2.0`. No Motion on tenant.

### Marketing JavaScript

Loaded Motion-related chunks on the marketing homepage:

| Chunk              | Role                                            |    Raw | gzip -9 | Brotli |
| ------------------ | ----------------------------------------------- | -----: | ------: | -----: |
| `3x1t_2e5thtrd.js` | Marketing experience + section/card reveals     | 35,865 |   9,112 |  7,985 |
| `290cfjrz3sdlx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,965 |  13,751 | 12,392 |

| Metric             |  1F.16 |    1F.10vt |    Delta |
| ------------------ | -----: | ---------: | -------: |
| Experience island  | 35,418 | **35,865** | **+447** |
| Motion runtime     | 39,965 | **39,965** |    **0** |
| Motion-related raw | 75,383 | **75,830** | **+447** |

The increase is the independent `MarketingRevealCard` observer, not a new library. `domAnimation` remains a lazy `LazyMotion` feature import.

### Tenant CSS / JS

Tenant source was not modified. Boundary tests still forbid `from "motion"` under `app/(aftercare)`.

## After Phase 1G (interactive recovery demo + responsive reveal threshold)

Measured 2026-09-09 against `cursor/aftercare-phase-1e-hardening` after Phase 1G. Production `next start` on port 4173. Next.js 16.3.4 / Turbopack. No new production dependency. No PDF library. No Motion on tenant.

### Marketing reveal JavaScript

Responsive Intersection Observer margin only. Duration remains 520ms.

| Chunk              | Role                                            |    Raw | gzip -9 | Brotli |
| ------------------ | ----------------------------------------------- | -----: | ------: | -----: |
| `2_tz0inlnt8w7.js` | Marketing experience + responsive reveal margin | 36,194 |   9,263 |  8,122 |
| `290cfjrz3sdlx.js` | Motion runtime (`motion/react-m`, `LazyMotion`) | 39,965 |  13,751 | 12,392 |

| Metric             | 1F.10vt |         1G |    Delta |
| ------------------ | ------: | ---------: | -------: |
| Experience island  |  35,865 | **36,194** | **+329** |
| Motion runtime     |  39,965 | **39,965** |    **0** |
| Motion-related raw |  75,830 | **76,159** | **+329** |

The increase is `useMarketingRevealViewport` (`useSyncExternalStore` + memoized margin). No new Motion features.

### Tenant CSS

Loaded on `http://demodental.localhost:4173/` and `/extraction`:

- `3kllwafy7q76u.css` — aftercare base (3,195 raw / 1,042 gzip / 885 Brotli)
- `2_0yz5dcat0lb.css` — `patient.module.css` (11,919 raw / 2,453 gzip / 2,084 Brotli)

| Metric         | 1F.10vt |         1G |      Delta |
| -------------- | ------: | ---------: | ---------: |
| CSS raw        |   9,538 | **15,114** | **+5,576** |
| CSS gzip -9    |   ~2.5k |  **3,495** |          — |
| CSS Brotli q11 |   ~2.2k |  **2,969** |          — |
| Tailwind       |      no |         no |          — |

Source CSS: `aftercare.css` 3,119 + `patient.module.css` 10,814 = **13,933**. Extra payload is demo navigation, Today/Timeline/Check-in, and print styles. Playwright now enforces **≤ 16,384 raw / 4,500 gzip / 4,000 Brotli**. No Tailwind. No CSS-in-JS. **0 font bytes.**

### Tenant JavaScript (patient-specific islands)

| Route       | Island                  | Chunk              |   Raw | gzip -9 | Brotli |
| ----------- | ----------------------- | ------------------ | ----: | ------: | -----: |
| Tenant home | `PatientThemeControl`   | `2ibiesqh06nb6.js` | 3,564 |   1,421 |  1,226 |
| Guide       | `PatientDemoExperience` | `1mp69n0tu-fwn.js` | 6,768 |   1,981 |  1,732 |
| Print       | `PrintTrigger`          | `0ni5wwxckjh5j.js` | 3,531 |     862 |    736 |

The demo island loads on the extraction guide only, not the tenant homepage. Guide body (Today copy, timeline stages, print document) stays Server Components. **No Motion on tenant.** Check-in is React state in that island; it does not add fetch or storage code.

## After Phase 1G.1 (launch-scope cleanup)

Measured 2026-09-09 against `cursor/aftercare-phase-1e-hardening` after Phase 1G.1. Production `next start` / Turbopack. No new production dependency. No PDF library. No Motion on tenant. No Tailwind on tenant.

### Marketing reveal JavaScript

Viewport thresholds unchanged (mobile ~-80px, desktop ~-200px). Duration/stagger constants only.

| Chunk              | Role                        |    Raw | gzip -9 | Brotli |
| ------------------ | --------------------------- | -----: | ------: | -----: |
| `2i_mql2g3r9k3.js` | Marketing experience island | 36,142 |   9,248 |  8,100 |

| Metric            |     1G |       1G.1 |   Delta |
| ----------------- | -----: | ---------: | ------: |
| Experience island | 36,194 | **36,142** | **-52** |

Motion runtime is unchanged except shared timing constants (editorial 620ms / 90ms, cards 570ms / 80ms cap 280ms, cubic-bezier(.22, 1, .36, 1)).

### Tenant CSS

Loaded on tenant home and `/extraction`:

- `01omn9m33zwll.css` — aftercare base (3,214 raw / 1,055 gzip / 891 Brotli)
- `21zvuijpwgvvc.css` — `patient.module.css` (12,990 raw / 2,619 gzip / 2,244 Brotli)

| Metric         |     1G |       1G.1 |      Delta |
| -------------- | -----: | ---------: | ---------: |
| CSS raw        | 15,114 | **16,204** | **+1,090** |
| CSS gzip -9    |  3,495 |  **3,674** |   **+179** |
| CSS Brotli q11 |  2,969 |  **3,135** |   **+166** |
| Tailwind       |     no |         no |          — |

Source CSS: `aftercare.css` 3,147 + `patient.module.css` 11,715 = **14,862**. Extra payload is timeline rail/separators, centred footer, and print-document styles after Check-in CSS was removed. Playwright still enforces **≤ 16,384 raw / 4,500 gzip / 4,000 Brotli**. **0 font bytes.**

### Tenant JavaScript (patient-specific islands)

| Route       | Island                  | Chunk              |   Raw | gzip -9 | Brotli |
| ----------- | ----------------------- | ------------------ | ----: | ------: | -----: |
| Tenant home | `PatientThemeControl`   | `2ibiesqh06nb6.js` | 3,564 |   1,421 |  1,226 |
| Guide       | `PatientDemoExperience` | `34ktv_zrm9y9y.js` | 4,818 |   1,352 |  1,189 |
| Print       | `PrintTrigger`          | `33b_s4j7mlbl9.js` | 3,613 |     867 |    742 |

| Metric                    |    1G |      1G.1 |      Delta |
| ------------------------- | ----: | --------: | ---------: |
| Patient demo island raw   | 6,768 | **4,818** | **-1,950** |
| Patient client components |     3 |     **3** |      **0** |

Client islands remain theme control, Today/Timeline demo nav, and print trigger. Check-in form/state was removed from `PatientDemoExperience`. Guide body stays Server Components. **No Motion on tenant.**

## After marketing completion (pricing + contact)

Measured 2026-09-09 against `cursor/aftercare-marketing-completion-ebe8` on production `next start` / port 4173. Next.js 16.3.4 / Turbopack. No new UI library. No billing or form-delivery JavaScript. Pricing and contact are Server Components; client JS is shared marketing chrome (theme popover, compact site menu, existing Motion).

### Shared marketing CSS

Loaded on `/`, `/pricing`, and `/contact`:

- `43ou1to094gs_.css` — marketing base (7,917 raw / 2,131 gzip / 1,891 Brotli)
- `2nlk4igi9hlfu.css` — `marketing.module.css` including plan/contact layout (41,884 raw / 7,270 gzip / 6,348 Brotli)

| Metric         | Marketing completion |
| -------------- | -------------------: |
| CSS raw        |           **49,801** |
| CSS gzip -9    |            **9,401** |
| CSS Brotli q11 |            **8,239** |
| Tailwind       |                   no |

### Product client islands

| Chunk              | Role                                       |    Raw | gzip -9 | Brotli |
| ------------------ | ------------------------------------------ | -----: | ------: | -----: |
| `3ahnw7t54-ocv.js` | Motion experience + compact site menu      | 29,378 |   8,371 |  7,410 |
| `17qg50x_rufn5.js` | Theme popover on `/pricing` and `/contact` | 12,219 |   4,802 |  4,215 |

Pricing and contact do not add a second animation system. Contact adds a narrow form island. **No Motion on tenant.** Tenant `/pricing` and `/contact` remain 404.

## After marketing conversion polish

Measured 2026-09-09 against `cursor/marketing-conversion-polish-7f34` on production `next start` / port 4173. Next.js 16.3.4 / Turbopack. Motion remains `motion@13.2.0`. Contact is a Server Component page plus a narrow `ContactForm` client island. Zod stays server-only (`contact-enquiry.ts`); the client validates with `contact-fields.ts`. Delivery is now a server-only Resend adapter (nodemailer/SMTP was removed).

Viewport thresholds are unchanged (mobile ~-80px, desktop ~-200px, tablet interpolated). Editorial reveal is **720ms / 110ms**. Cards are **650ms / 95ms**, cap **320ms**.

### Shared marketing CSS

Loaded on `/`, `/pricing`, and `/contact`:

- `3krtqjbqgsf2y.css` — marketing base (8,531 raw / 2,235 gzip / 1,957 Brotli)
- `2qt8ofonnis4z.css` — `marketing.module.css` including page heroes, spacing tokens, and the enquiry form (45,965 raw / 7,979 gzip / 6,889 Brotli)

| Metric         | Marketing completion | Conversion polish |     Delta |
| -------------- | -------------------: | ----------------: | --------: |
| CSS raw        |               49,801 |        **54,496** |    +4,695 |
| CSS gzip -9    |                9,401 |        **10,214** |      +813 |
| CSS Brotli q11 |                8,239 |         **8,846** |      +607 |
| Tailwind       |                   no |                no | unchanged |

### Product client islands

| Chunk              | Role                                        |    Raw | gzip -9 | Brotli |
| ------------------ | ------------------------------------------- | -----: | ------: | -----: |
| `00k0i2nogwbhn.js` | Motion experience + compact site menu       | 30,435 |   8,539 |  7,527 |
| `17qg50x_rufn5.js` | Theme popover                               | 12,219 |   4,818 |  4,215 |
| `0-i9vkpe7y6f8.js` | Contact form island (`useActionState` + UX) | 18,939 |   6,823 |  5,948 |

Contact does **not** load the Zod runtime. Framework/React chunks are shared with other App Router routes and are not counted as product islands. Pricing and contact do not add a second animation library. **No Motion on tenant.** Tenant `/pricing` and `/contact` remain 404.

See [MARKETING-CONTACT.md](MARKETING-CONTACT.md) for delivery configuration.

## After marketing final polish

Measured 2026-09-10 against `cursor/marketing-final-polish-7bf5`. Production payload is captured by conversion e2e (`measurePageAssets` on `/`, `/pricing`, `/contact`) into `test-results/artifacts/marketing-conversion-performance.json`. Motion remains `motion@13.2.0`. No new UI, form, or animation library. Tailwind still absent from marketing.

Viewport thresholds are unchanged (mobile ~-80px, desktop ~-200px, tablet interpolated). Editorial reveal is **900ms / 150ms**. Cards are **800ms / 120ms**, cap **400ms**. Tune `MARKETING_MOTION_TIMING` in `lib/marketing/reveal-timing.ts`.

The contact client island stayed the same size or shrank: locations `<select>` was removed, Zod remains server-only (`contact-enquiry.ts`), and the client still validates with `contact-fields.ts`.

### Shared marketing CSS

Loaded on `/`, `/pricing`, and `/contact`:

- `28s6mnkpjj310.css` — marketing base (8,552 raw / 2,241 gzip / 1,970 Brotli)
- `0t5xg984946yj.css` — `marketing.module.css` including hero-bottom / footer tokens, primary lift, and the enquiry form (46,818 raw / 8,116 gzip / 7,013 Brotli)

| Metric         | Conversion polish | Final polish | Delta |
| -------------- | ----------------: | -----------: | ----: |
| CSS raw        |            54,496 |   **55,370** |  +874 |
| CSS gzip -9    |            10,214 |   **10,357** |  +143 |
| CSS Brotli q11 |             8,846 |    **8,983** |  +137 |
| Tailwind       |                no |           no |    no |

### Product client islands

| Chunk              | Role                                            |    Raw | gzip -9 | Brotli |
| ------------------ | ----------------------------------------------- | -----: | ------: | -----: |
| `17qg50x_rufn5.js` | Theme popover (`/pricing`, `/contact`)          | 12,219 |   4,818 |  4,215 |
| `0v06gx-7n9bju.js` | Contact form island (`useActionState` + UX)     | 18,748 |   6,763 |  5,934 |
| `3pgpyvqtbrp3l.js` | Motion (contact form sits in `MarketingReveal`) | 37,727 |  13,921 | 12,620 |

Contact island vs conversion polish `0-i9vkpe7y6f8.js` (18,939 / 6,823 / 5,948): **−191 raw / −60 gzip / −14 Brotli**. Motion on `/contact` is the existing marketing Motion library, not a second animation system. Framework/React chunks are shared with other App Router routes and are not counted as product islands. **No Motion on tenant.** Tenant `/pricing` and `/contact` remain 404. No new UI or form library.

## UX polish + clinic portal foundation

No new UI or animation library. Motion remains marketing-only (`motion@13.2.0`). Tenant still has no Tailwind and no Motion. Staff/admin continues to load the isolated Tailwind stylesheet.

Clinic Overview (`/dashboard`) and Guides (`/guides`) are server-rendered from membership-scoped loaders. `PortalChrome` is a small client shell for navigation, the mobile menu, and sign-out; page bodies are not client components.

Tenant CSS grew slightly for restrained guide-card and inactive-tab hover. Playwright now allows **≤ 17,408 raw** (gzip/Brotli ceilings unchanged). Measured raw on this revision: **16,734**.

## Phase 2A clinic self-service (staff client islands)

No new UI, rich-text, or drag-and-drop library. Tenant still has no Tailwind and no Motion. Staff/admin continues to load the isolated Tailwind stylesheet.

New staff Client Components (not on the patient tenant):

- `PasswordVisibilityField` on `/login`
- `GuideEditor` / `CreateGuideForm` on clinic guide routes
- `PracticeSettingsForm` + `ColorField` on `/practice`
- Existing `PortalChrome` shell, plus `PortalAppearanceControl`, dirty-state guard, and confirm dialogs
- Authenticated draft preview toolbar is a Server Component wrapping the real patient renderer

Portal appearance uses the same blocking `data-theme-mode` bootstrap as marketing/patient, with storage key `aftercare-guide-portal-theme`. It is not a ThemeProvider and does not load on tenant routes.

Measured 2026-09-10 against `cursor/clinic-self-service-ux-polish-eed5` production `next build` (Next.js 16.3.4 / Turbopack). Staff Client islands only; tenant still has no Tailwind and no Motion. No new UI, dialog, or theme library.

| Chunk              | Role                                             |    raw | gzip -9 | Brotli q11 |
| ------------------ | ------------------------------------------------ | -----: | ------: | ---------: |
| `322al9fglpbjk.js` | Guide editor (dirty/cancel/publish, breadcrumbs) | 16,289 |   5,116 |      4,405 |
| `3zn_kjw7_l50y.js` | Practice settings form                           | 15,612 |   4,559 |      3,935 |
| `3ezgriosqx2_q.js` | Portal appearance + logout                       | 11,306 |   4,548 |      3,972 |
| `42jbjdl7-dgw9.js` | Operator shell (logout + icons)                  | 17,029 |   6,159 |      5,420 |

Framework/React chunks are shared App Router runtime and are not counted as product islands. Authenticated preview toolbar is a Server Component.

## Phase 2A.2 portal workflow polish (staff client islands)

Measured 2026-09-11 against `cursor/portal-editor-practice-polish-57d2` production `next build` (Next.js 16.3.4 / Turbopack). No new npm dependency. No Motion. Tenant still has no Tailwind. Public patient routes remain server-first; the editor live preview reuses a presentational timeline list with staff-only CSS.

| Chunk              | Role                                                                      |    raw | gzip -9 | Brotli q11 | Δ raw vs 2A.1 |
| ------------------ | ------------------------------------------------------------------------- | -----: | ------: | ---------: | ------------: |
| `2dbnsa5c1qafu.js` | Guide editor (accordion + live preview rail, replaces `322al9fglpbjk.js`) | 23,986 |   7,310 |      6,377 |        +7,697 |
| `15_8_mnqu0xf3.js` | Practice settings form (replaces `3zn_kjw7_l50y.js`)                      | 15,905 |   4,779 |      4,133 |          +293 |
| `2ffi2y95klk0k.js` | Portal chrome (viewport-fixed shell + account)                            | 16,963 |   6,135 |      5,394 |             — |
| `3ezgriosqx2_q.js` | Operator appearance + logout                                              | 11,306 |   4,548 |      3,972 |             0 |

The guide-editor increase is the exclusive timeline accordion plus the compact live patient timeline preview. Playwright patient CSS budget still passed on this revision.

## Phase 2A.3 editor composition / practice overflow / operator polish — 2026-09-11

Staff-only islands. No new UI, dialog, or image-processing library. Native `<dialog>` styling only. Patient demo island **unchanged**.

Measured 2026-09-11 against `cursor/portal-editor-practice-polish-2a3-a53d` production `next build` (Next.js 16.3.4 / Turbopack), then reconciled onto rewritten Phase 2A.2 on `main`.

| Island       | Chunk              | raw    | gzip-9 | brotli-11 | vs Phase 2A.2 cloud lineage  |
| ------------ | ------------------ | ------ | ------ | --------- | ---------------------------- |
| Guide editor | `1kt9kssn1xh0d.js` | 26,321 | 7,776  | 6,820     | 26,533 → **−212**            |
| Practice     | `2_l5j804g3jw9.js` | 15,492 | 4,731  | 4,055     | 15,846 → **−354**            |
| Portal shell | `0bevipaj31uil.js` | 16,883 | 6,129  | 5,352     | chrome + logout + appearance |

Patient demo island `3u_l-4ffhn4i4.js` remains **4,818 raw**. Tenant still has no Tailwind.

## Phase 2A.4 overflow / preview theme / logo sanitizer — 2026-09-12

Staff-only islands plus a **server-only** SVG sanitizer (`jsdom` + `dompurify`). Those packages are listed in `serverExternalPackages` and are not imported from patient Client Components.

Patient CSS grew by about **126 raw bytes** for scoped `data-patient-theme` / `color-scheme` rules so authenticated preview can isolate clinic appearance. Playwright tenant CSS budget is **17,664** raw (was 17,408). Gzip and Brotli stay inside the previous ceilings.

DOMPurify/jsdom must not appear in tenant client JS. Preview appearance control is a tiny staff Client Component (`StaffPreviewShell`); the public tenant renderer remains server-first.

Measured 2026-09-11 against `cursor/phase-2a4-preview-storage-overflow-6c4f` production `next build` (Next.js 16.3.4 / Turbopack). Shared staff island `27vw0x32979dc.js` is ConfirmDialog / overflow-menu chrome used by Practice and the editor.

| Island                         | Chunk              | raw    | gzip-9 | brotli-11 |
| ------------------------------ | ------------------ | ------ | ------ | --------- |
| Practice form                  | `1p5mfpkuc8exa.js` | 17,506 | 5,367  | 4,708     |
| Guide editor                   | `0tie7a4rotfmx.js` | 28,373 | 8,386  | 7,373     |
| Authenticated preview shell    | `07crhvz1jlc3i.js` | 13,796 | 5,325  | 4,691     |
| Patient theme control (public) | `2ef363qg1cmz2.js` | 3,840  | 1,515  | 1,290     |
| Patient demo island            | `03-mjwqxpmrhc.js` | 4,818  | 1,350  | 1,187     |

Practice/editor grew from logo-upload UI and editor More actions. Patient demo island is **unchanged** at 4,818 raw. SVG sanitizer remains `serverExternalPackages` only.

## Phase 2A.5 brand + interaction system — 2026-09-12

No new UI library. Patient still does not import Tailwind. Shared `app/interaction.css` is a small duration/easing/focus token sheet imported by marketing, staff, and aftercare.

Patient CSS grew for hover/focus/active rules that match the staff/marketing interaction contract while keeping clinic `--cg-*` colours. Playwright tenant CSS budget is now **26,000** raw (was 22,500). Gzip ≤ 6,500 and Brotli ≤ 6,000 are unchanged.
