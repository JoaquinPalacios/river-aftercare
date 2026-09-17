# Working memory — Care Guide aftercare reset

This file helps later implementation sessions. It is **not** the product contract.

Authoritative requirements: [PRD.md](PRD.md)  
Decisions: [../adr/README.md](../adr/README.md)

Last updated: 2026-09-17 (demo-only Tooth Extraction sample template + production-safe bootstrap; Vercel Speed Insights)

---

## Product direction vs current implementation

|                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product direction**          | B2B aftercare SaaS: branded tenant hostnames, canonical guide library, practice enablement/overrides, durable URLs + QR, mobile-first anonymous patient pages, operator admin, basic anonymous analytics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Current implementation**     | Staff auth + parked chairside sessions + Phase 1A–1C aftercare + **Phase 1E browser/performance acceptance** + **Phase 1F public marketing face** through **1F.16 / reveal timing** + **Phase 1G interactive patient demo** + **Phase 1G.1 launch-scope cleanup** + **marketing completion** (`/`, `/pricing`, `/contact`, `/about` on the root host) + **marketing conversion polish** + **marketing final polish** + **UX polish + clinic portal foundation** + **Phase 2A clinic self-service foundation** + **Phase 2A.4** + **Phase 2A.5** (portal shell, launch SEO indexing policy, unpublish, Geist, River Aftercare brand pack) + **Phase 2B** (operator SEO & Discovery, structured SEO settings, JSON-LD, llms.txt, production-readiness audit) + **public UI + published-guide QR share** + **public legal copy rewrite** + **R2 clinic-asset application support** + **marketing master-brand repositioning** + **clinic vertical acquisition pages** (`/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics`). Motion is approved for marketing presentation only. Patient clinical content remains motion-light and document-first. Check-in is post-launch only — see [POST-LAUNCH-ROADMAP.md](POST-LAUNCH-ROADMAP.md). Logo **application** upload is implemented against Cloudflare R2; production still needs Joaquín to provision the bucket. A Cloudflare Turnstile challenge is HIGH PRIORITY before or immediately after launch and is **not implemented**. |
| **Aftercare MVP implemented?** | **No** — Phase 1 technical vertical slice is implemented and hardened. Commercial MVP is after Phase 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Published-guide QR sharing is implemented for clinic staff (durable public URL, SVG/PNG). Vercel Web Analytics (`@vercel/analytics`) and Speed Insights (`@vercel/speed-insights`) are installed as cookieless platform telemetry in the three root layouts. Do not claim the PRD operator anonymous-analytics dashboard, approved Privacy/Terms, or production infra exist until they are built. Public `/privacy` and `/terms` are production-facing drafts and still require legal review. Hostname routing (Phase 1B) and branded patient pages (Phase 1C) are implemented. Operator now has All Clinics plus SEO & Discovery; it still does not have a template CMS. Phase 1E added Playwright + axe browser acceptance; it did not add product features.

---

## Phase status

| Phase                     | Status                                                                    |
| ------------------------- | ------------------------------------------------------------------------- |
| 1A                        | COMPLETE / APPROVED                                                       |
| 1B                        | COMPLETE / APPROVED                                                       |
| 1B.5                      | COMPLETE / APPROVED                                                       |
| 1C                        | COMPLETE / APPROVED                                                       |
| 1D                        | ABSORBED INTO PHASE 1C / NO SEPARATE IMPLEMENTATION                       |
| 1E                        | COMPLETE — TECHNICALLY READY FOR LOCAL JOAQUÍN ACCEPTANCE                 |
| 1F                        | COMPLETE — READY FOR LOCAL JOAQUÍN REVIEW                                 |
| 1F.1                      | COMPLETE — PREMIUM PRODUCT EXPERIENCE READY FOR REVIEW                    |
| 1F.2                      | COMPLETE — READY FOR LOCAL JOAQUÍN REVIEW                                 |
| 1F.3                      | COMPLETE — VISUAL SIMPLIFICATION READY FOR JOAQUÍN REVIEW                 |
| 1F.4                      | COMPLETE — MARKETING MOTION READY FOR JOAQUÍN REVIEW                      |
| 1F.5                      | COMPLETE — HERO COMPOSITION READY FOR JOAQUÍN REVIEW                      |
| 1F.6                      | COMPLETE — PREMIUM MOBILE HERO READY FOR JOAQUÍN REVIEW                   |
| 1F.7                      | COMPLETE — HERO INTERACTION POLISH READY FOR JOAQUÍN REVIEW               |
| 1F.8                      | COMPLETE — PREMIUM HERO ATMOSPHERE READY FOR JOAQUÍN REVIEW               |
| 1F.9                      | COMPLETE — RESPONSIVE PRODUCT PREVIEW READY FOR JOAQUÍN REVIEW            |
| 1F.10                     | COMPLETE — PREMIUM STORYTELLING READY FOR JOAQUÍN REVIEW                  |
| 1F.11                     | COMPLETE — STORY CLARITY READY FOR JOAQUÍN REVIEW                         |
| 1F.12                     | COMPLETE — DESIGN COHERENCE READY FOR JOAQUÍN REVIEW                      |
| 1F.13                     | COMPLETE — CLOSING COMPOSITION READY FOR JOAQUÍN REVIEW                   |
| 1F.14                     | COMPLETE — FINAL MARKETING REFINEMENT READY FOR JOAQUÍN REVIEW            |
| 1F.15                     | COMPLETE — MOBILE STORYTELLING READY FOR JOAQUÍN REVIEW                   |
| 1F.16                     | COMPLETE — MOTION CHOREOGRAPHY READY FOR JOAQUÍN REVIEW                   |
| 1F.10vt                   | COMPLETE — VIEWPORT REVEAL TIMING READY FOR JOAQUÍN REVIEW                |
| 1G                        | COMPLETE — INTERACTIVE RECOVERY DEMO READY FOR JOAQUÍN REVIEW             |
| 1G.1                      | COMPLETE — LAUNCH-SCOPE CLEANUP                                           |
| Marketing completion      | COMPLETE — PRICING + CONTACT READY FOR JOAQUÍN REVIEW                     |
| Marketing polish          | COMPLETE — CONVERSION POLISH READY FOR JOAQUÍN REVIEW                     |
| Marketing final polish    | COMPLETE — READY FOR JOAQUÍN REVIEW                                       |
| UX polish + clinic portal | COMPLETE — READY FOR JOAQUÍN REVIEW                                       |
| 2A                        | LOCAL — CLINIC SELF-SERVICE FOUNDATION                                    |
| 2A.1                      | LOCAL — CLINIC PORTAL UX READY FOR JOAQUÍN REVIEW                         |
| 2A.2                      | LOCAL — PORTAL WORKFLOW POLISH READY FOR JOAQUÍN REVIEW                   |
| 2A.3                      | LOCAL — EDITOR / PRACTICE / OPERATOR POLISH                               |
| 2A.4                      | LOCAL — OVERFLOW / PREVIEW / GUIDE ACTIONS / LOGO READINESS               |
| 2A.5                      | LOCAL — VISUAL SYSTEM CORRECTIONS READY FOR JOAQUÍN REVIEW                |
| 2B                        | LOCAL — SEO / DISCOVERY / LAUNCH AUDIT READY FOR JOAQUÍN REVIEW           |
| Marketing + trust polish  | LOCAL — LISTS, PREVIEWS, LEGAL DRAFTS READY FOR JOAQUÍN REVIEW            |
| Public UI + share polish  | LOCAL — NAV, SPACING, CONTACT CTA, PUBLISHED QR READY FOR REVIEW          |
| Public legal copy rewrite | LOCAL — PRODUCTION-FACING PRIVACY/TERMS DRAFTS READY FOR REVIEW           |
| Clinic vertical pages     | LOCAL — `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics` |
| Marketing FAQ + copy QA   | LOCAL — vertical FAQ accordion + final pre-index copy                     |
| 2+ remainder              | Not started                                                               |

Phase 1D is not a missing slice. Phase 1C already shipped canonical composition, practice overrides, practice additions, semantic section rendering, warning/emergency rendering, and the real patient guide UI. A separate 1D implementation would have been artificial. Historical phase numbers are not renumbered.

---

## Phase 1A (implemented)

Data/domain foundation. Patient UI is not in 1A.

| Area                   | Location                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema / migration     | `prisma/schema.prisma`, `prisma/migrations/20260831120000_add_aftercare_phase_1a_domain`                                                                                                       |
| Composition            | `lib/aftercare/compose-guide-document.ts` (pure; no Prisma)                                                                                                                                    |
| Slug validation        | `lib/aftercare/slug.ts` — `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–32 chars                                                                                                                             |
| Public loaders         | `getClinicBySlug`, `getPublishedPracticeGuide`, `listPublishedPracticeGuides`                                                                                                                  |
| Publication predicates | `lib/aftercare/public-practice-guide-predicates.ts`                                                                                                                                            |
| Pin integrity          | Composite FK `PracticeGuide(pinnedRevisionId, guideTemplateId)` → `GuideTemplateRevision(id, guideTemplateId)` — [ADR 0010](../adr/0010-practice-guides-explicitly-pin-canonical-revisions.md) |

Public loaders require **all** of: `isEnabled === true`, `PracticeGuide.status === PUBLISHED`, `pinnedRevision.status === PUBLISHED`, clinic scope. No auth. No `ProcedureSession`.

`Clinic.slug` is unique and required. Existing rows were backfilled (demo clinic → `demodental`; other rows → `clinic-` + md5 prefix). Format CHECK is in the migration.

Caching: no `cacheComponents`, no `cacheTag()`. Request-level `React.cache()` was not added in 1A.

---

## Phase 1B (implemented)

Hostname tenant resolution. No branded patient UI.

| Area            | Location                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Root domain     | `CARE_GUIDE_ROOT_DOMAIN` (`lib/tenancy/root-domain.ts`)                                          |
| Parser          | `lib/tenancy/parse-hostname.ts` — apex/app staff, reserved (including `assets`), tenant, invalid |
| Reserved labels | `lib/tenancy/reserved-slugs.ts` — includes `assets` so `assets.<root>` is never a tenant         |
| Proxy           | `proxy.ts` — rewrite only; no Prisma/auth/tenant-existence lookup                                |
| Internal routes | `app/%5Fsites/[tenant]/**` (URL `/_sites/<slug>/…`, blocked from the public Host)                |
| Tenant check    | `requireTenantClinic` → `getClinicBySlug` → `notFound()`                                         |

Local URLs: `localhost:3000` is the public marketing homepage. `app.localhost:3000` stays staff/parked. `demodental.localhost:3000` rewrites internally. `unknown.localhost:3000` is a generic 404. Tenant hosts block `/login`, `/dashboard`, `/sessions`, `/session`, `/display`, `/api/auth`. Direct `/_sites` and `/_marketing` are 404.

Internal aftercare files now live at `app/(aftercare)/%5Fsites/[tenant]`. Public rewrite target remains `/_sites/<slug>/…`. The marketing homepage rewrites to `/_marketing`.

Next.js 16 writes both `.next/types` (decoded `/_sites`) and `.next/dev/types` (encoded `/%5Fsites`) during `next build`. `tsconfig.json` excludes `.next/dev` so production typecheck does not merge those conflicting `LayoutRoutes`. Do not type the tenant layout as `LayoutProps<"/_sites/[tenant]">` — `tsc -b` runs before `next build` generates that helper.

---

## Phase 1B.5 (implemented)

Patient styling + performance foundation. Replaced the Phase 1B.5 brand-proof header in 1C.

| Area              | Location                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Staff root        | `app/(staff)/layout.tsx` + `staff.css` (Tailwind)                                                                    |
| Aftercare root    | `app/(aftercare)/layout.tsx` + `aftercare.css` (no Tailwind)                                                         |
| Theme resolver    | `lib/branding/aftercare-theme.ts` — hex-only, contrast fallback, light/dark semantic `--cg-*` tokens, radius presets |
| Patient CSS       | `app/(aftercare)/patient.module.css`                                                                                 |
| Performance notes | [../architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md)                                                     |
| Styling ADR       | [ADR 0011](../adr/0011-patient-styling-uses-css-modules-and-semantic-runtime-tokens.md)                              |

Tenant branding is server-rendered CSS variables. No client ThemeProvider. No arbitrary ClinicProfile CSS fields. Dark/light follows clinic `themeMode` (`LIGHT` / `DARK` / `SYSTEM`) via `color-scheme` and `light-dark()` tokens. An optional patient theme-toggle Client Component is rendered only when `allowPatientThemeToggle` is true.

---

## Phase 1C (implemented)

Public patient experience on tenant hostnames. No patient login, no PII, no analytics, no QR, no operator CMS.

| Area               | Location                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant home        | `app/(aftercare)/%5Fsites/[tenant]/page.tsx`                                                                                                                                  |
| Public guide       | `app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page.tsx`                                                                                                                      |
| Patient components | `app/(aftercare)/components/*` — Server Components; optional `PatientThemeControl` only when a clinic enables it (Phase 1F.1)                                                 |
| Chrome resolver    | `lib/aftercare/practice-chrome.ts` + `safe-href.ts`                                                                                                                           |
| Demo notice        | `lib/aftercare/demo-tenant.ts` — `demodental` only; easy to remove                                                                                                            |
| Metadata           | `lib/aftercare/tenant-metadata.ts` — `{Guide} {instruction noun} \| {Practice}` / `{Practice} — {instruction label}`, launch `noindex, follow`, public canonical + Open Graph |
| Section tone       | `lib/aftercare/guide-section-tone.ts` — kind-driven, not section-key-driven                                                                                                   |
| Demo mark          | `public/demo/riverside-mark.svg` (`ClinicProfile.logoUrl`)                                                                                                                    |

Patient-specific Client Components: theme toggle when enabled, plus the Phase 1G `PatientDemoExperience` island and print trigger on demo guide/print routes. Native `<a>` / `<img>` (no `next/link` or `next/image` on the patient surface).

Local URLs:

- `http://demodental.localhost:3000/` — practice aftercare home
- `http://demodental.localhost:3000/extraction` — Tooth Extraction composed guide

Homepage lists only enabled + published PracticeGuides pinned to a published revision, ordered by `sortOrder` then `publicSlug`. Unknown tenant, unknown/draft/disabled guides → generic 404.

Emergency rule: guide `EMERGENCY` / `WARNING_SIGNS` sections explain condition/context; `ClinicProfile` contact/emergency copy is chrome (“how to reach this practice”). They are not merged.

---

## Phase 1E (implemented)

Quality, performance, and acceptance hardening for the Phase 1 vertical slice. No Phase 2 features.

| Area              | Location                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Browser E2E       | `e2e/*.spec.ts`, `playwright.config.ts` — production `next start` on port 4173, `*.localhost`   |
| Accessibility     | `@axe-core/playwright` 4.13.0 on tenant home and Tooth Extraction                               |
| Fixtures          | `e2e/fixtures/phase1e-data.ts` — Harbor Family Dental + draft/disabled/pinned-draft, cleaned up |
| Composition edges | `tests/compose-guide-document.test.ts`                                                          |
| Performance notes | [../architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md)                                |

Patient-specific Client Components remain **0**. Native `<a>` / `<img>` kept. Playwright and axe are **devDependencies** only.

---

## Phase 1F (implemented)

Public marketing face, patient UX/UI uplift, and branding-token foundation. No Phase 2 operator admin.

| Area               | Location                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Apex routing       | `parseHostname` `marketing` kind; `proxy.ts` rewrites `/` to `/_marketing`               |
| Marketing homepage | `app/(marketing)/%5Fmarketing/page.tsx` + `marketing.css` / `marketing.module.css`       |
| Staff host         | `app.localhost` continues to serve `/`, `/login`, dashboard, and parked chairside        |
| Patient home/guide | Clinic-first post-operative copy and refined CSS Modules                                 |
| Branding fields    | `ClinicProfile.neutralColor`, `ClinicProfile.radiusPreset` (`SHARP` / `MEDIUM` / `SOFT`) |
| Theme              | `lib/branding/aftercare-theme.ts` — light/dark semantic tokens, radius, no arbitrary CSS |
| Routing ADR        | [ADR 0012](../adr/0012-apex-host-is-the-public-marketing-face.md)                        |

Patient-specific Client Components remain **0** unless a clinic enables the optional patient theme toggle. Dark/light follows `prefers-color-scheme` unless the clinic locks `LIGHT` or `DARK`.

Local URLs:

- `http://localhost:3000/` — public marketing homepage
- `http://app.localhost:3000/` — internal staff workspace
- `http://demodental.localhost:3000/` — Riverside Dental Demo aftercare home
- `http://demodental.localhost:3000/extraction` — Tooth Extraction guide

---

## Phase 1F.1 (implemented)

Premium Aftercare Guide marketing identity, tenant presentation settings, and optional patient theme control. No Phase 2 operator admin.

**River Aftercare** is the current commercial/product name. The GitHub repository and npm package are `river-aftercare`. `CARE_GUIDE_*` environment prefixes remain technical.

| Area                 | Location                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Product name         | `lib/branding/product-name.ts`                                                                                  |
| Marketing            | `app/(marketing)/%5Fmarketing/page.tsx` — cobalt/periwinkle platform palette, 80rem container, editorial layout |
| Marketing theme      | Isolated `MarketingThemeControl` Client Component; `SYSTEM` default; localStorage persistence                   |
| Terminology          | `ClinicProfile.instructionTerminology` → `lib/aftercare/instruction-terminology.ts`                             |
| Clinic theme policy  | `ClinicProfile.themeMode` (`LIGHT` / `DARK` / `SYSTEM`) serialized as `html { color-scheme }`                   |
| Patient theme toggle | `ClinicProfile.allowPatientThemeToggle`; isolated `PatientThemeControl` only when true                          |
| Attribution          | “Powered by River Aftercare”                                                                                    |
| Presentation ADR     | [ADR 0013](../adr/0013-provisional-aftercare-guide-presentation-controls.md)                                    |

Riverside Dental Demo seed: `POST_TREATMENT`, `SYSTEM`, `allowPatientThemeToggle = true`.

Future `typographyPreset` (`CLINICAL` / `MODERN` / `EDITORIAL`) is documented, not implemented. Arbitrary tenant CSS remains prohibited. Marketing brand colour is intentionally separate from tenant clinic colours.

---

## Phase 1F.2 (implemented)

Premium polish, recovery timeline, and local login DX. No Phase 2 operator admin.

| Area              | Location                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Marketing eyebrow | `AFTERCARE PLATFORM` (category language, not a branded claim)                                  |
| Section surfaces  | Reusable `surfaceBase` / `surfaceSubtle` / `surfaceContrast` / `surfaceBrand` full-bleed bands |
| Marketing footer  | Product name, short tagline, in-page links, year copyright                                     |
| Theme control     | Compact icon + native popover (`AppearanceMenu`); System / Light / Dark; same persistence      |
| Recovery timeline | `GuideTemplateSection.periodLabel` + consecutive `RECOVERY_TIMELINE` grouping                  |
| Timeline ADR      | [ADR 0014](../adr/0014-recovery-timeline-stages-are-data-driven-sections.md)                   |
| Booking CTA       | Not rendered. `bookingUrl` remains on `ClinicProfile` for later structured CTA config          |
| Local login       | `LOCAL_ADMIN_*` and `LOCAL_STAFF_*`; seed upserts hashed users; refused in production          |

Demo extraction stages: First few hours → Today / first 24 hours → Days 2–3 → Days 4–7, then what-is-normal, warnings, contact. Demo copy is paraphrased from SA Dental extraction guidance structure, not verbatim, and remains labelled non-clinical.

Patient CTAs should later become structured configuration (`call`, `contact page`, `booking`, `email`, `emergency/after-hours`) with enable/disable, label, and order. Not implemented now.

Local staff URL: `http://app.localhost:3000/login`. Credentials come from `LOCAL_<ROLE>_EMAIL` / `LOCAL_<ROLE>_PASSWORD`.

---

## Phase 1F.3 (implemented)

Visual simplification only. No Phase 2 operator admin. No clinical-content architecture change.

Marketing is four visual chapters, not a band per section:

| Chapter | Surface token       | Contents                                    |
| ------- | ------------------- | ------------------------------------------- |
| 1       | `marketingBase`     | Sticky header + hero + product preview      |
| 2       | `marketingSoft`     | Problem, product, how it works, why clinics |
| 3       | `marketingShowcase` | Branding comparison + clinic preview        |
| 4       | `marketingClosing`  | Early-access CTA + footer                   |

Internal chapter 2/3 rhythm uses spacing, type scale, alignment, and thin rules (`chapterRule`). Removed `surfaceBase` / `surfaceSubtle` / `surfaceContrast` / `surfaceBrand`.

Patient light canvas is white (`#ffffff`). Clinic `neutralColor` may tint `--cg-surface-subtle` only; it no longer paints the page. Dark patient canvas is `#111318` with `#171a1f` for warning/urgent surfaces. Clinic teal stays on the mark, primary CTA, timeline rule/markers, and (in light mode) small labels.

Patient pages are document-led: homepage guide list is a row with an arrow, not a card; standard guide sections are heading + body; consecutive `RECOVERY_TIMELINE` stages share one “Recovery guide” journey. Visual grammar borrowed from parked staff/chairside UX (white canvas, uppercase labels, thin rules, timeline markers, restrained accent) without PIN, patient name, plan ID, medications, or session data.

**Current staff UI is parked legacy product UX.** Phase 2 will replace the visible staff homepage/navigation with the Aftercare Guide operator workspace. Chairside functionality was not changed in 1F.3.

---

## Phase 1F.4 (implemented)

Marketing-only Motion choreography plus CSS-only patient polish. No Phase 2. Aftercare still does not depend on `ProcedureSession`.

| Surface            | Behaviour                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing reveals  | `LazyMotion` + `motion/react-m`, `whileInView` once, stagger 85ms, tween `easeOut`, `transform` + `opacity`                                                                                  |
| Chapter wash       | Removed in 1F.11. Static chapter surfaces only. Future Motion may animate background colour / CSS variables — not a blurred overlay. One SVG wave remains between hero and the soft chapter. |
| Fail-open          | Blocking bootstrap `data-mk-motion`; pending reveals hidden only when `enhance`; 1.6s fail-open; `<noscript>` override                                                                       |
| Patient guide card | CSS-only hover (−2px) / arrow (+4px) / focus ring. Server Component. No Motion, tilt, or 3D.                                                                                                 |
| Recovery timeline  | One `--cg-recovery-surface` chapter; stages remain cardless                                                                                                                                  |

Motion is **not** loaded on tenant routes. See [PERFORMANCE.md](../architecture/PERFORMANCE.md) for the 1F.4 bundle table.

---

## Phase 1F.5 (implemented)

Static marketing hero composition only. No Motion choreography change. No Phase 2. Patient product UI was not redesigned.

| Area               | Behaviour                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Light hero         | Warm-white `--mk-hero` (`#fffcf8`), dark ink, restrained periwinkle/cool-cyan glow toward the device stage                       |
| Dark hero          | Deep ink foundation (`#07090e`) with a restrained periwinkle/cobalt glow, not a neon wash                                        |
| Layout             | Full-width editorial H1, then a 42/58 supporting-copy / product-preview row at `64rem+`                                          |
| Device stage       | HTML/CSS browser portal (clinic aftercare home) behind an overlapping phone (extraction recovery timeline). `aria-hidden="true"` |
| Clinic vs platform | Riverside teal stays inside the mockup. Platform chrome/CTAs stay periwinkle/cobalt/ink                                          |
| Wave               | One shallower inline SVG between hero and the soft chapter; light hairline / dark restrained edge                                |

---

## Phase 1F.6 (implemented)

Static marketing hero refinement only. No Motion change. No Phase 2. Patient product UI was not redesigned.

| Area         | Behaviour                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Hierarchy    | Centered eyebrow + H1 in `heroTitleBlock` (max 62rem). Lower 42/58 row keeps left-aligned copy/CTAs and a single phone stage       |
| Device       | One CSS/SVG phone shell (bezel, island, glass highlight). Screen is HTML/CSS Riverside extraction recovery proof. `aria-hidden`    |
| Atmosphere   | Light: warm white `--mk-hero` with periwinkle/cyan radials toward the device. Dark: ink base with restrained cobalt/cyan glow      |
| Separator    | One shallow SVG curve: next-chapter fill, dissolving periwinkle→cyan→periwinkle stroke, blurred glow. Same geometry, token colours |
| Clinic brand | Riverside teal stays inside the phone. Platform chrome/CTAs stay periwinkle/cobalt/ink                                             |

Hero-attributed client JS added: **0**. No external device mockup. No Motion work in this pass.

---

## Phase 1F.7 (implemented)

Hero spacing, premium device shell, and CSS-only interaction polish. No Motion change. No Phase 2. No video yet.

| Area           | Behaviour                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing        | Desktop rhythm: eyebrow sits ~72–96px below the navbar; H1 follows; lower 42/58 row has more air. Controlled `min-height` uses `svh` minus header, never `100vh`                                          |
| Separator      | Same layered SVG wave, now flush at the hero section bottom so it reads as the chapter boundary                                                                                                           |
| Device         | Larger CSS phone (~18.5rem at 90rem+). Thinner rim, cleaner bezel, island, glass highlight, near + ambient + floor shadow. Screen remains Riverside extraction timeline                                   |
| Architecture   | Server-rendered `PhoneShell` → `PhoneScreen` → `ProductPreviewScreen`. Later swap the screen child for a short product loop. **No video, no Client Component, no GIF.**                                   |
| Future media   | Planned: WebM + MP4 fallback, `autoplay muted loop playsInline`, poster/static fallback. Intended 6–8s walkthrough: clinic home → Tooth Extraction → timeline → warning/contact → loop. GIF is rejected.  |
| Interactions   | CSS-only hover / `:focus-visible` / `:active` on primary/secondary CTAs, nav colour + hairline, compact theme trigger including `[aria-expanded="true"]`. Token: `--mk-interact-duration: 180ms ease-out` |
| Reduced motion | Translation hover lifts are removed. Colour, border, and focus rings remain                                                                                                                               |

Hero-attributed client JS added: **0**. Existing marketing Motion island is unchanged. Tenant UI was not modified.

---

## Phase 1F.8 (implemented)

Static marketing hero atmosphere plus a real iPhone hardware frame. No Motion change. No Phase 2. No video yet.

| Area         | Behaviour                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atmosphere   | Bottom-center layered radials plus a soft periwinkle→cyan wash into the existing wave. Light: pale periwinkle bloom + cool-cyan mist on warm white. Dark: cobalt radial, periwinkle bloom, faint cyan edge on ink |
| Device       | Rivers Digital Catión iPhone mockup (`cationBlue.png` from Sanity) copied to `/marketing/iphone-frame.webp`. Hardware overlay; live HTML/CSS Riverside extraction screen in the transparent opening               |
| Architecture | Server-rendered `PhoneShell` → `PhoneScreen` → `ProductPreviewScreen`. Native `<img>` (`fetchPriority="low"`) so the frame is not an LCP candidate and adds **0** client JS                                       |
| Position     | `align-self: center` plus a 24px desktop raise (`translateY(-1.5rem)`). Width follows the real 800/1620 aspect (~14.6rem at 90rem) so the full silhouette and separator stay in the 1440×900 viewport             |
| Future media | Unchanged: WebM + MP4 fallback inside `PhoneScreen`. GIF rejected                                                                                                                                                 |

Hero-attributed client JS added: **0**. No Motion work in this pass. Tenant UI was not modified. Rivers Digital repo was not modified.

---

## Phase 1F.9 (implemented)

Mobile marketing navigation, section spacing tokens, and a richer static phone-screen hierarchy. No Motion change. No Phase 2. No video. No hamburger menu.

| Area           | Behaviour                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile nav     | Below `47.99rem`, same-page anchors (`How it works`, `Clinic preview`) are `display: none`. Header keeps River Aftercare, Staff sign in, and the compact theme control. Tablet/desktop keep those two anchors plus Staff sign in. Footer anchors remain. There is no public Early Access link. |
| Wordmark       | `white-space: nowrap` plus a slightly smaller mobile mark/type so “River Aftercare” stays one line at 360/390                                                                                                                                                                                  |
| Section rhythm | `--mk-section-pad-y: clamp(4rem, 6vw, 6rem)` on inner `.band`s; `--mk-chapter-pad-y: clamp(6rem, 8vw, 8rem)` on chapter starts and the closing CTA. Blends are `4rem`. Hero keeps custom spacing.                                                                                              |
| Phone screen   | Still `PhoneShell` → `PhoneScreen` → `ProductPreviewScreen`. Hardware frame unchanged. Screen stays light (`color-scheme: light`, `#ffffff`) even when marketing chrome is dark.                                                                                                               |
| Preview copy   | Clinic → terminology → Tooth Extraction → Your recovery → current Immediate care stage with a short demo line → quieter Days 2–3 / Days 4–7 → “Need help? Call Riverside Dental →” (not a real link)                                                                                           |

Hero-attributed client JS added: **0**. Mobile navbar is CSS. Phone preview remains `aria-hidden`.

### Future section entrance choreography (not implemented)

Restrained section reveals remain appropriate. Do **not** ship this in 1F.9.

Future baseline when a later motion pass is explicit:

| Beat       | Delay  |
| ---------- | ------ |
| eyebrow    | 0ms    |
| heading    | +70ms  |
| body       | +140ms |
| visual/CTA | +210ms |

Motion: opacity `0 → 1`, `y` `14–18px → 0`, duration ~500ms, once per section. No word-by-word or letter-by-letter reveal. No large slide distances. `prefers-reduced-motion` must disable translation.

---

## Phase 1F.10 (implemented)

Premium process storytelling, asymmetric feature bento, and restored theme popover. No Motion change. No Phase 2. Hero composition frozen.

| Area             | Behaviour                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme popover    | Compact 10.125rem utility menu, CSS-anchored top-right under the trigger, 38px rows, inline SVG glyphs, periwinkle selected row, checkmark on the current value. Native `popover="auto"` behaviour kept. |
| How it works     | Semantic `<ol>` connected journey. Desktop: one horizontal periwinkle→cyan rail with numbered nodes and short drops into four cards. Mobile: continuous vertical rail. Decorative rail is `aria-hidden`. |
| Why clinics      | Replaced in 1F.11 by three benefit pillars plus a customisation strip.                                                                                                                                   |
| Motion readiness | `data-mk-process`, `data-mk-process-rail`, `data-mk-process-card`. No new `use client`.                                                                                                                  |

Hero-attributed client JS added: **0**. New marketing Client Components: **0**. Tenant CSS unchanged at **9,538** raw.

---

## Phase 1F.11 (implemented)

Story clarity below the frozen hero. No Motion entrance choreography. No Phase 2. Hero composition frozen.

| Area            | Behaviour                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process         | Continuous rail through nodes 01–04. Desktop equal-height cards with a shared visual / STEP / title slot. Subtle midpoint arrowheads between nodes, never beside them. Mobile stays a vertical rail sized naturally.  |
| Why clinics     | Three equal benefit pillars (Looks like your clinic / Built for patients / Simple to operate) plus one controlled-customisation strip. Product-native micro-previews only. QR/admin mentioned as future, not current. |
| Problem/Product | Editorial friction list (three points) paired with a typographic product equation: Approved guide + Clinic brand → Patient aftercare page. Same soft chapter; complementary left/right rhythm.                        |
| Closing         | Theme-aware. Light: soft periwinkle-neutral surface, dark ink, periwinkle CTA. Dark: deep ink, warm light text. Compact demo CTA + footer share the closing chapter. No forced dark band in light mode.               |
| Interactions    | Marketing CTA hover/active no longer translate. Nav and footer text links use a centre-out `scaleX` underline (`--mk-interact-duration`). Focus rings remain.                                                         |
| Chapter wash    | IntersectionObserver background wash, blend gradients, and `--mk-chapter-bg` transition removed. Static surfaces only.                                                                                                |

### Future chapter background animation (not implemented)

Later, with Motion, major chapter background tokens may transition smoothly as the user scrolls. That pass should animate **background colour / CSS variables**, not a blurred overlay crossing the page.

Hero-attributed client JS added: **0**. New marketing Client Components: **0**. Chapter-wash observer removed from `MarketingExperience`.

---

## Phase 1F.12 (implemented)

Static design coherence below the frozen hero and frozen How It Works. No Motion entrance choreography. No scroll-driven background. No Phase 2.

| Area           | Behaviour                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Links          | Nav/footer text links keep the centre-out underline. Underline uses `currentColor`, so text and underline always match. Light hover/focus: muted → ink. Dark hover/focus: muted grey → warm near-white. |
| Buttons        | Still no translate/scale. Primary hover is a slightly deeper periwinkle plus a small shadow; active is tighter. Secondary stays outlined with a stronger border/fill. Focus rings remain independent.   |
| Problem        | Eyebrow spans the section. Desktop H2 and friction `01–03` sit in a two-column row so `01` aligns with the heading, not the eyebrow. Mobile is eyebrow → H2 → list.                                     |
| Product        | Left assembly canvas: Approved guide + Riverside clinic brand → light patient-page fragment. Decorative / `aria-hidden`. No second phone.                                                               |
| Why clinics    | Three pillars unchanged. Controlled customisation is a four-column desktop strip (intro + Brand + Corners + Appearance), stacking to one column at 390.                                                 |
| Clinic preview | Right column is a static patient-home panel (Riverside Dental Demo, Tooth Extraction row, Call the practice) plus a caption. Brand Flexibility is the three identity cards above.                       |
| Closing        | Inverted bookend: periwinkle→cyan hairline at the top of the closing chapter; bottom-centre radial glow fading upward. Light stays light. Dark stays dark. No second wave.                              |

Hero composition and How It Works rail/cards were not materially changed. **New marketing client JS added: 0.**

---

## Phase 1F.13 (implemented)

Static closing-composition refinement only. No Motion entrance choreography. No scroll-driven background. No Phase 2. Frozen sections (Hero, Problem, Product, How It Works, Why Clinics Use It, Clinic Preview) were not redesigned.

| Area          | Behaviour                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secondary CTA | Centre-out `::before` surface fill (`scaleX(0)` → `scaleX(1)`, origin center, ~180ms). The button itself does not translate or scale. Reduced motion applies the fill immediately. Focus ring remains. |
| Early Access  | Desktop ~58/42 conversion / design-partner columns. Right column is an editorial 01–03 list (Guide setup, Clinic branding, Patient handoff). Mobile stacks conversion copy above the partner list.     |
| Prospect CTA  | `View the clinic demo` only. Staff sign in stays in header and footer. No invented Request access / Contact us link; lead capture is future work.                                                      |
| Closing light | Bottom-centre footer glow removed. Inner footer separator is the light source (~82% from the left), with radial periwinkle/cyan bloom upward into Early Access and downward into the footer. No blur.  |

Hero composition and How It Works rail/cards were not materially changed. **New marketing client JS added: 0.**

---

## Phase 1F.14 (implemented)

Narrow final marketing refinement. No new sections. No Phase 2. Frozen: Hero, Problem, Product, How It Works layout, Why Clinics pillars/layout, Controlled Customisation geometry, Clinic Preview structure, Early Access structure, closing atmosphere (except footer overflow).

| Area               | Behaviour                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand Flexibility  | Eyebrow renamed from Brand Directions. H2 uses the shared `sectionTitle` scale. Customer copy only. Three full-colour identity cards with a shared 1rem radius, inset hairline, and equal desktop height. |
| Theme trigger      | Circular centre-origin `scale(0) → scale(1)` fill. Icon stays still. Reduced motion applies the fill immediately. Compact popover unchanged.                                                              |
| Footer             | Separator atmosphere `::before` is `position: absolute; inset: 0; pointer-events: none` so it cannot extend document height. Desktop copyright-to-end gap is the footer padding (~2.6rem / 42px).         |
| Public copy        | Internal roadmap/dev notes removed (provisional-name line, lead-capture implementation note, “not in this release”, “arbitrary CSS”, “phone-sized layout”).                                               |
| Prospect CTA       | Still `View the clinic demo` only. **Proper design-partner lead capture remains a commercial-launch requirement.** Do not invent a dead public CTA.                                                       |
| Typography presets | Investigated only. **Not implemented.** No schema, no Google Font packages, **0 font bytes** added.                                                                                                       |

### Future typography presets (not implemented)

Do **not** add an arbitrary Google Fonts picker. Do **not** load `fonts.googleapis.com` at runtime. Use `next/font` (self-hosted at build) and emit only the active tenant preset from the server theme CSS.

Current stacks:

- Product-wide primary UI/content face: **Geist Sans** via one `next/font` source (`lib/branding/fonts.ts`, `--font-geist-sans`). Marketing, staff/operator/login, patient, authenticated preview, and print consume that variable. Staff also loads Geist Mono for `font-mono`.
- Do not load Geist independently in each route group. Do not request `fonts.googleapis.com` at runtime. Patient still does **not** import Tailwind.
- Clinic typography presets remain future work (`ClinicProfile.typographyPreset`). This pass is product-family consistency only, not per-clinic presets.

A future `ClinicProfile.typographyPreset` should apply on the tenant `aftercareTheme` wrapper as `--cg-font-heading` / `--cg-font-body`, selected by the server when composing theme CSS. No client FontProvider. Headings and body should not vary independently for CLINICAL/MODERN; EDITORIAL may use a display face for headings only, with body remaining a highly readable sans. Prioritise long-form patient readability over marketing display.

| Preset    | Intended tone                                   | Likely loading strategy                                        | Estimated asset count                      |
| --------- | ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| CLINICAL  | Calm native clinical reading                    | System/native stack. No extra font files.                      | 0 WOFF2                                    |
| MODERN    | Contemporary practice, still long-form readable | One variable sans via `next/font`, latin subset, one/two axes. | 1 variable WOFF2                           |
| EDITORIAL | Distinct heading voice; body stays readable     | One display/heading font + system or the Modern sans for body. | 1 heading WOFF2 (+ 0–1 body if not system) |

Do not import all three `next/font` families in the shared aftercare layout — Next would self-host and preload unused faces. Select the preset on the server and emit only that `@font-face`. Measure actual WOFF2 transfer before shipping. No ADR in this phase.

Hero-attributed client JS added: **0**. New marketing Client Components: **0**. New font bytes: **0**.

---

## Phase 1F.15 (implemented)

Mobile composition and content-density refinement only. No Phase 2. No Motion. Desktop marketing layouts remain frozen aside from shared Why Clinics copy shortening.

| Area              | Behaviour                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product           | DOM is copy then assembly visual. Mobile reads copy → visual. Desktop CSS Grid areas keep visual LEFT / copy RIGHT. Copy-to-visual gap is `2.25rem`. No `column-reverse`.                               |
| How it works      | Desktop connected rail unchanged. Mobile drops the long left rail and `01–04` nodes. Full-width stacked cards with STEP 1–4 inside each card, short centred periwinkle→cyan connectors, natural height. |
| Why clinics       | Same three pillars + Controlled Customisation. Each pillar is title + one sentence + two proof points. Customisation strip unchanged. Copy is shared across viewports.                                  |
| Brand Flexibility | Mobile `padding-top` reduced from `--mk-chapter-pad-y` (96px) to `4rem` / 64px. Desktop chapter padding unchanged. Problem chapter still uses 96px on mobile.                                           |
| Early Access      | Mobile `padding-top` `4rem` / 64px. `padding-bottom` remains `2.25rem` / 36px. Desktop chapter padding unchanged.                                                                                       |

Hero, Problem layout, Clinic Preview, Footer, and mobile nav were not redesigned. **New marketing client JS added: 0.**

---

## Phase 1F.16 (implemented)

One-shot marketing Motion choreography plus public Early Access removal. No Phase 2. Aftercare still does not depend on `ProcedureSession`.

The public Early Access / Design Partner section was removed because founder-led sales handles initial clinic acquisition. Future lead capture/contact can be introduced when a genuine channel exists. Internal product documentation about design partners remains (PRD / working memory).

| Area                    | Behaviour                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion principle        | ENTER ONCE, REMAIN VISIBLE. No exit animation for ordinary page sections. Scrolling away and back does not replay or hide.                                                                                                                                                                                              |
| Root cause (1F.4–1F.15) | `viewport.once` was already true. Lower sections appeared to reset because `marketing.css` ran `@keyframes mk-fail-open` at 1.6s on `.mkReveal[data-mk-pending]`. CSS animations override Motion inline styles, so off-screen pending items became visible, then `whileInView` played hidden→visible when they entered. |
| Orchestration           | One `useInView({ once: true })` boundary per section (`MarketingRevealGroup`). Children inherit `visible` via variants with section-specific delays. Hero keeps mount `whileInView` once and is otherwise frozen.                                                                                                       |
| Fail-open               | SSR stays visible (no `opacity:0` in HTML). CSS hides pending only under `html[data-mk-motion="enhance"]`. No fail-open keyframes. `@media (scripting: none)` + `<noscript>` unhide. Feature-load catch sets `data-mk-motion="reduce"`.                                                                                 |
| Reduced motion          | Bootstrap `reduce`; pending CSS does not apply; MotionConfig `reducedMotion="user"`; content is immediately visible with no translation/scale/rail delay.                                                                                                                                                               |
| Closing                 | Compact `#see-it` CTA: “See it in practice” / “See the patient experience for yourself.” / Riverside Dental Demo copy / **View the clinic demo**. Desktop copy left, button right. Footer atmosphere from 1F.14/1F.15 preserved.                                                                                        |

Public landing narrative: Header → Hero → Problem → Product → How It Works → Why Clinics Use It → Brand Flexibility → Clinic Preview → compact demo CTA → Footer.

See [PERFORMANCE.md](../architecture/PERFORMANCE.md) for the 1F.16 bundle table.

---

## Phase 1F.10 reveal timing (implemented after 1F.16)

Marketing entrance-timing refinement only. No Phase 2. No static UI redesign. Aftercare still does not depend on `ProcedureSession`. The original Phase 1F.10 storytelling section above is unchanged; this pass reuses the brief label for viewport/card choreography.

| Area              | Behaviour                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewport          | Shared `useMarketingRevealViewport`: `once: true`, top margin `9999px`. Bottom inset is **~-80px** on mobile (`< 48rem`), **~-200px** on desktop/large (`≥ 64rem`), and linearly interpolated on tablet.                                                |
| Editorial groups  | `MarketingRevealGroup` still orchestrates eyebrow → heading → copy → CTA at 0 / 70 / 140 / 210ms. Duration remains 520ms tween `easeOut`.                                                                                                               |
| Cards             | `MarketingRevealCard` owns its own `useInView({ once: true })`. How it works steps, Why Clinics pillars + customisation strip, Brand Flexibility cards, and Problem friction items no longer inherit the section's hidden/visible state.                |
| Desktop vs mobile | Reveal **threshold** is width-based (mobile ~-80px, desktop ~-200px, tablet interpolated). Card **choreography** is not width-branched: stacked mobile cards enter one-by-one; a desktop row that enters together uses `70ms × index`, capped at 250ms. |
| Reduced motion    | Unchanged: bootstrap `reduce`, pending CSS skipped, content visible immediately.                                                                                                                                                                        |
| Hero / patient    | Hero viewport unchanged. No Motion on tenant patient routes.                                                                                                                                                                                            |

See [PERFORMANCE.md](../architecture/PERFORMANCE.md) for the reveal-timing bundle table.

---

## Phase 1G (implemented)

Interactive recovery **demo** on `demodental` only. No Phase 2. No persisted RecoveryPlan. No `ProcedureSession`. No patient PII.

Phase 1G.1 removed Check-in from the launch product. Check-ins remain documented as post-launch premium/add-on work.

| Area             | Behaviour                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo banner      | One banner: “Interactive demo” / “Sample content only · Not clinical advice · Changes aren't saved”. Seed copy no longer repeats DEMO CONTENT ONLY / practice-override implementation language. |
| Navigation       | Today / Timeline tabs + Print / Save PDF. Mobile tabs scroll. Check-in is absent from launch UI.                                                                                                |
| Today            | Default view. Explicit fixture **Day 1 of 7**. Resolver maps simulated day → current/next `RECOVERY_TIMELINE` stage + progress. Not `Date.now()`. Not a real per-patient treatment day.         |
| Timeline         | Existing stages with earlier / current / upcoming. Subtle content-column separators between stages. Continuous clinic-accent rail. Not clinical “completed”.                                    |
| Print            | `/extraction/print` plus `@media print`. Same `GuideDocument` / composed sections as the web guide. Browser Print / Save as PDF. No PDF library. Not a patient-specific Care Plan.              |
| Client island    | `PatientDemoExperience` (Today / Timeline) + existing `PatientThemeControl` + tiny `PrintTrigger`. Guide body stays Server Components.                                                          |
| Marketing reveal | Responsive IO margin: mobile ~**-80px**, desktop/large ~**-200px**, tablet interpolated. Editorial ~720ms / 110ms stagger; cards ~650ms / 95ms (cap 320ms). cubic-bezier(.22, 1, .36, 1).       |
| Attribution      | “Powered by River Aftercare” in a centred document-flow footer when `showCareGuideAttribution` is true.                                                                                         |
| Performance      | Tenant CSS **16,204** raw (budget 16,384). Demo island **4,818** raw (−1,950 vs 1G). Theme control unchanged. No Motion on tenant. See [PERFORMANCE.md](../architecture/PERFORMANCE.md).        |

Local URLs unchanged, plus:

- `http://demodental.localhost:3000/extraction/print` — printable recovery guide

---

## Phase 1G.1 (implemented)

Launch-scope cleanup. No Phase 2. No persisted RecoveryPlan.

| Change           | Result                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing reveal | Same viewport thresholds. Slightly slower / calmer choreography.                                                                                        |
| Check-in         | Removed from tenant/demo UI, client island, CSS, and current-product tests. Preserved in [POST-LAUNCH-ROADMAP.md](POST-LAUNCH-ROADMAP.md).              |
| Timeline         | Subtle 1px separators in the content column; rail stays continuous.                                                                                     |
| Footer           | Centred, muted, not sticky. Hidden when attribution is disabled.                                                                                        |
| Print            | Dedicated print document from the same GuideDocument. Button copy is **Print / Save PDF**.                                                              |
| Template model   | Documented canonical → enable → override → addition → custom → preview → publish/pin. Canonical updates never silently mutate a published clinic guide. |

---

## Marketing completion (implemented)

Root-platform commercial pages. No billing integration. No lead database. No tenant sales UI.

| Area            | Location / behaviour                                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes          | Apex `/`, `/pricing`, `/contact`, `/about`, `/privacy`, `/terms`, `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics` rewrite to `/_marketing…`. Direct `/_marketing` stays 404. Tenant copies of those sales paths 404.                                                                         |
| Tenant / staff  | `demodental` `/pricing` and `/contact` 404. `app.` host is unchanged. Platform Pricing/Contact never render inside tenant chrome.                                                                                                                                                                              |
| Working prices  | Essential **A$79 / month**, Practice **A$149 / month** (Recommended), Group **Custom pricing**. Provisional AUD. No annual toggle. No published setup fee.                                                                                                                                                     |
| Launch vs later | Active plan lists are launchable aftercare capabilities. Check-ins, connected recovery plans, messaging, and integrations sit in **Coming after launch** only. No Check-in price.                                                                                                                              |
| Contact         | Platform conversion page: concise hero + clinic enquiry form. Server action → validated `ContactEnquiry` → `MarketingContactMailer` (SMTP or local `memory`). No fake success. Subject: `River Aftercare — clinic enquiry — <clinic>`. See [MARKETING-CONTACT.md](../architecture/MARKETING-CONTACT.md).       |
| Navigation      | Desktop: **For clinics** (Dental, Physiotherapy, Chiropractic, Cosmetic & aesthetic), About, Pricing, Contact, Sign in, theme. Mobile: brand, Sign in, compact site menu with the same clinic group plus About/Pricing/Contact, theme. Footer has a **For clinics** column.                                    |
| Spacing         | `--mk-eyebrow-heading-gap`, `--mk-heading-intro-gap`, `--mk-heading-content-gap`, `--mk-card-grid-gap`. Heading groups use `headingBlock` / `headingFollow`.                                                                                                                                                   |
| Heroes          | Homepage remains the largest product hero. Pricing/Contact use `MarketingPageHero` with related but distinct atmosphere and a **shared** inner-page SVG edge.                                                                                                                                                  |
| Demo            | Homepage **View the clinic demo** still goes to the production tenant patient renderer (`demodental`). Closing CTA **Request a demo** goes to `/contact`.                                                                                                                                                      |
| SEO             | Launch policy in [SEO.md](../architecture/SEO.md): marketing indexable; staff/operator/preview `noindex, nofollow`; tenant patient pages `noindex, follow` by default; sitemap is marketing-only. Optional `CARE_GUIDE_METADATA_BASE`. SoftwareApplication JSON-LD without ratings, offers, or certifications. |
| Performance     | See [PERFORMANCE.md](../architecture/PERFORMANCE.md). Contact adds a narrow form island; Motion remains shared. No Tailwind.                                                                                                                                                                                   |

Local URLs:

- `http://localhost:3000/` — product story
- `http://localhost:3000/pricing` — working plans
- `http://localhost:3000/contact` — clinic enquiry form
- `http://demodental.localhost:3000/pricing` — 404
- `http://demodental.localhost:3000/contact` — 404

---

## Marketing conversion polish (implemented)

Calmer marketing reveals, inner-page heroes, heading/content spacing tokens, simplified persistent nav, and a real clinic enquiry form. No Phase 2. Tenant patient UX was not redesigned.

| Area         | Behaviour                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion       | Same viewport thresholds (~-80px mobile, ~-200px desktop, tablet interpolated). Editorial **720ms / 110ms**. Cards **650ms / 95ms**, cap **320ms**. `y` 14px, once, cubic-bezier(.22, 1, .36, 1). Reduced motion unchanged. |
| Pricing hero | Medium-depth atmospheric light, no phone mockup, shallower asymmetric luminous edge into plans.                                                                                                                             |
| Contact hero | Quieter, smaller atmosphere, tapered off-centre arc into the form. Copy is eyebrow + H1 + short intro only.                                                                                                                 |
| Nav          | Persistent nav is Pricing / Contact / Staff sign in / Theme. How it works and Clinic preview remain homepage sections and footer links.                                                                                     |
| Form         | Full name, work email, practice name, locations (1 / 2–5 / 6+), optional phone and message. Honeypot + validation + throttle.                                                                                               |
| Delivery     | SMTP via nodemailer, or `MARKETING_CONTACT_MAILER=memory` for local/E2E. Production still needs real credentials.                                                                                                           |

---

## Marketing final polish (implemented)

Motion, inner-page hero rhythm, shared conversion button, simplified contact form. No Phase 2. No Turnstile. Tenant patient UX was not redesigned. Aftercare still does not depend on `ProcedureSession`.

| Area              | Behaviour                                                                                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion            | Same viewport thresholds (~-80px mobile, ~-200px desktop, tablet interpolated). Editorial **900ms / 150ms**. Cards **800ms / 120ms**, cap **400ms**. `y` 14px, once, cubic-bezier(.22, 1, .36, 1). Reduced motion unchanged. Duration stays ≤1s. Tune in `lib/marketing/reveal-timing.ts` → `MARKETING_MOTION_TIMING`. |
| Inner-page heroes | Shared `--mk-hero-bottom-gap: calc(1.35rem + 2.5rem)` on `.pageHeroInner`. Pricing and Contact share one inner-page SVG edge (`mkPageWaveInnerPage`). Homepage keeps its unique wave. `data-mk-page-hero` remains `pricing` \| `contact`.                                                                              |
| Primary button    | Shared `.button.primary` with a 1px hover lift (removed under `prefers-reduced-motion`). Explicit `MarketingPrimaryLink` / `MarketingPrimaryAnchor` / `MarketingPrimaryButton` — not boolean soup. Contact **Send enquiry** / **Sending…** uses the same system with a reserved label width.                           |
| Footer            | `--mk-footer-pad-top: 2rem` (32px). Brand row: isologo `2rem`, product name `1rem`, gap `0.25rem`. Compact footer otherwise unchanged.                                                                                                                                                                                 |
| Form              | Required: Full name, Email, Practice / clinic name. Optional: Phone, Anything you'd like us to know? Locations field removed. User-facing copy says Email, not Work email. Internal name may remain `workEmail`. Honeypot + validation + throttle kept.                                                                |
| Anti-spam         | **Cloudflare Turnstile is HIGH PRIORITY before or immediately after launch. Not implemented.** Server-side verification, graceful failure, accessibility required when added. See [POST-LAUNCH-ROADMAP.md](POST-LAUNCH-ROADMAP.md) and [MARKETING-CONTACT.md](../architecture/MARKETING-CONTACT.md).                   |
| Nav               | Unchanged desktop: Pricing / Contact / Staff sign in / Theme. Mobile closed header is brand + burger only; Pricing, Contact, Staff sign in, and Theme live inside the menu as full-width rows.                                                                                                                         |

---

## Marketing visual rule

This is a visual composition rule, not an ADR.

| Surface                              | Alignment      | Why                                               |
| ------------------------------------ | -------------- | ------------------------------------------------- |
| Homepage hero eyebrow + H1           | Centred        | Brand statement / opening scene                   |
| Inner-page heroes (Pricing, Contact) | Left           | They are product pages, not the opening scene     |
| Normal content sections              | Left           | Reading rhythm                                    |
| Final / closing conversion CTA       | May be centred | Intentional bookend when the composition benefits |

Do not globally centre marketing headings.

---

## UX polish + clinic portal foundation (implemented)

Marketing motion/navigation polish, calmer patient interactions, and the first Aftercare Guide clinic portal. No Check-ins. No RecoveryPlan. No fake analytics. Chairside remains parked and reachable by direct URL.

### Marketing

| Area               | Behaviour                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion             | Viewport thresholds unchanged. Tune `MARKETING_MOTION_TIMING` in `lib/marketing/reveal-timing.ts`.                                                                                        |
| Mobile nav         | Closed: River Aftercare + burger. Open: Pricing, Contact, Staff sign in, Theme as full-width rows. Theme expands inline (System / Light / Dark). Desktop compact theme trigger unchanged. |
| Onboarding numbers | Fixed number column + content column, `align-items: start`, first-line optical alignment.                                                                                                 |

### Patient

| Area             | Behaviour                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guide card hover | Border / surface / slight shadow only. No lift or scale. Arrow may nudge 2px. Hover gated to `hover: hover and pointer: fine`.                            |
| Today / Timeline | Inactive tabs: modest accent colour + quiet surface. Active tab is not restyled by inactive hover. Focus-visible remains. Existing ARIA tab pattern kept. |

### Clinic portal

Staff `/dashboard` is the River Aftercare clinic portal, not the parked chairside dashboard.

| Area      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | Unchanged `requireStaffSession()`. Unauthenticated `/dashboard` and `/guides` redirect to `/login`. Authenticated `app.` `/` redirects to `/dashboard`.                                                                                                                                                                                                                                                                                         |
| Shell     | Platform periwinkle/cobalt. Primary: Overview / Guides / Practice. Utility: View patient site. Preferences: Appearance (System/Light/Dark). Account and Sign out.                                                                                                                                                                                                                                                                               |
| Overview  | Real published/draft guide counts. Setup checks: identity, branding, contact, emergency, published guide. Statuses are Configured / Needs attention. Patient-site link uses the real tenant renderer.                                                                                                                                                                                                                                           |
| Guides    | `/guides` lists the authenticated clinic's actual `PracticeGuide` rows. ADMIN can create from a **reviewed** canonical template, or from a **sample** template if the clinic is `demodental`, or as a custom guide. Edit draft, preview, publish, **unpublish**, **delete never-published drafts**, and **discard unpublished draft changes**. STAFF can view and preview. No fake template library. Published-guide deletion remains deferred. |
| Practice  | `/practice` (ADMIN). Identity, controlled branding colours/radius/terminology/theme, contact, emergency. Tenant slug is not editable here. Logo path remains; upload is blocked.                                                                                                                                                                                                                                                                |
| Isolation | Loaders and mutations query by membership `clinicId` only. No client-provided clinic IDs.                                                                                                                                                                                                                                                                                                                                                       |
| Chairside | `/dashboard/procedures`, `/sessions/new`, `/session/[id]/control`, `/display/[token]` remain. Not linked from portal nav. Not shown on Overview.                                                                                                                                                                                                                                                                                                |

### Next clinic-portal work (not built)

Archive of **published** guides (delete after history exists), QR, invitations/team management, canonical library authoring, production Storage bucket for logos, Check-ins, RecoveryPlan, messaging, PMS integrations, billing.

---

## Do not do (until a later explicit task)

- Remaining Phase 2 operator library/QR, analytics, SMS/email, billing, custom domains, extra specialties, clinical CMS, rich-text editor, patient-specific guides, chairside integration
- Enable `cacheComponents: true`
- Delete or refactor parked chairside functionality
- Depend aftercare on `ProcedureSession`
- Reuse `ProcedureTemplate` as the aftercare Guide Template
- Use real Pacific Dental brand assets
- Author scraped/clinically authoritative copy from random websites
- Parent-domain auth cookies (`Domain=.localhost`)

---

## Reusable foundation

- Next.js App Router, React, Tailwind (staff only), CSS Modules (patient + marketing), PostgreSQL **18**, Prisma 7 (`PrismaPg` + `pg`)
- `Clinic` (`id`, `name`, **`slug`**), `User`, `ClinicMembership`, **`ClinicProfile`** (`primaryColor`, `accentColor`, `neutralColor`, `radiusPreset`, `instructionTerminology`, `themeMode`, `allowPatientThemeToggle`)
- Staff auth: `auth.ts`, `lib/auth/*`, `/login`, clinic portal `/dashboard` + `/guides` + `/practice` (`requireStaffSession()` / `requireClinicAdmin()`)
- Platform operator: `User.platformRole`, `/operator/clinics` (`requirePlatformOperator()`)
- Clinic portal loaders/mutations: `lib/clinic-portal/*` (membership `clinicId` only)
- Clinic logo storage boundary: `lib/clinic-assets/*` (upload blocked until a bucket exists)
- Platform operator: `User.platformRole`, `/operator/clinics` (`requirePlatformOperator()`)
- Clinic-scoped query patterns (membership-derived clinic id)
- Aftercare domain: `GuideTemplate` → `GuideTemplateRevision` → `GuideTemplateSection`; `PracticeGuide` + clinic-owned `PracticeGuideRevision` (draft v0 / published 1+) + legacy override/addition
- Tenancy: `lib/tenancy/*`, `proxy.ts`, `app/(aftercare)/%5Fsites/[tenant]`, `app/(marketing)/%5Fmarketing` (`/`, `/pricing`, `/contact`)
- Patient theme: `lib/branding/aftercare-theme.ts`
- Patient pages: `app/(aftercare)/components/*`, `lib/aftercare/practice-chrome.ts`
- Browser acceptance: `e2e/*`, `@playwright/test`, `@axe-core/playwright` (dev only)

---

## Parked chairside map (do not extend for aftercare)

| Area            | Location                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema          | `prisma/schema.prisma` — `ProcedureTemplate`, stages, rooms, doctors, `ProcedureSession`, display prefs, overrides, transitions                 |
| Seed            | `prisma/seed.mjs` — Rivers Care Demo Clinic; starter walkthrough + scaling & root planing chairside templates; optional external `aftercareUrl` |
| Create session  | `app/sessions/new/*`, `lib/sessions/create-procedure-session.ts`                                                                                |
| Control         | `app/session/[id]/control/*`, `lib/sessions/move-procedure-session-stage.ts`, `complete-procedure-session.ts`                                   |
| Patient display | `app/display/[token]/*`, `lib/sessions/load-patient-display.ts`                                                                                 |
| Realtime        | `lib/realtime/*` (Supabase; optional in local `.env.example`)                                                                                   |
| Staff dashboard | Parked chairside inspection only: `app/(staff)/dashboard/procedures/page.tsx`. Default `/dashboard` is the River Aftercare clinic portal.       |

Completed sessions may show an external `ProcedureTemplate.aftercareUrl`. That is **not** the aftercare product.

---

## Demo data

Seeded fictional clinic: **Rivers Care Demo Clinic** (`clinic_demo_rivers`).

- Tenant slug: `demodental`
- Patient-facing profile name: **Riverside Dental Demo**
- Demo mark: `/demo/riverside-mark.svg`
- Admin: `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD` (see `.env.example`)
- Staff: `LOCAL_STAFF_EMAIL` / `LOCAL_STAFF_PASSWORD`
- Operator: `LOCAL_OPERATOR_EMAIL` / `LOCAL_OPERATOR_PASSWORD` (no clinic membership; production must not seed these)

Aftercare seed (Phase 1A, logo path updated in 1C). Tooth Extraction library copy is **sample / non-clinical**, not clinically approved:

- Canonical template **Tooth Extraction** (`extraction`, specialty `DENTAL`)
- Published revision v1 with ordered demo sections, `reviewedAt` / `reviewedBy` left **null**
- Visible and enableable **only** for the interactive demo tenant (`demodental`)
- Published/enabled PracticeGuide pinned to that revision (local seed only — production bootstrap does not create clinic guides)
- One practice override (`first-24-hours`) and one addition (`weekend-contact` after `contact-practice`) — local seed only
- Page-level demo banner for `demodental` only: “Interactive demo — Sample content only · Not clinical advice · Changes aren't saved.”

Production must **not** run `pnpm db:seed`. To insert **only** the sample Tooth Extraction library rows, use `pnpm bootstrap:demo-template` (dry-run by default; `--apply` to write). Real customer templates require named clinical review (`reviewedAt` + `reviewedBy`) before they appear for normal clinics.

Pacific Dental appears in the PRD only as a **conceptual** hostname example (`pacificdental.<platform-domain>`).

---

## Phase 1 remainder (not started)

Phase 1G.1 is the launch-scope cleanup for the current aftercare branch. Root-platform `/pricing` and `/contact` are implemented. Commercial MVP is after Phase 3 (see PRD §19 and §22). Phase 2A clinic self-service foundation is implemented locally.

See [POST-LAUNCH-ROADMAP.md](POST-LAUNCH-ROADMAP.md) for Check-ins, RecoveryPlan, dental template candidates, and future verticals.

---

## Tooling debt

TypeScript is `7.0.2`. Current `typescript-eslint` stable releases do not yet support TypeScript 7 (`ts.Extension` was removed from the compiler API).

Current bridge:

- ESLint 10
- `@next/eslint-plugin-next`
- Babel TypeScript parser (`@babel/eslint-parser`)

This temporarily means we do not have the same TypeScript-aware ESLint rule coverage.

**TODO:** Re-evaluate typescript-eslint on each dependency refresh and restore it once stable TypeScript 7 support is released. Do not install unsupported or canary typescript-eslint merely to regain those rules.

---

## Documentation files

| File                                     | Role                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/README.md`                         | Docs index                                                                      |
| `docs/product/PRD.md`                    | PRD v1.0                                                                        |
| `docs/product/WORKING-MEMORY.md`         | This file                                                                       |
| `docs/product/POST-LAUNCH-ROADMAP.md`    | Launch-adjacent Turnstile note, Check-ins, RecoveryPlan, templates, verticals   |
| `docs/adr/*.md`                          | Architecture decisions 0001–0022                                                |
| `docs/architecture/PERFORMANCE.md`       | Patient CSS/JS measurement contract, Phase 1E budget, and 1F.4 Motion isolation |
| `docs/architecture/MARKETING-CONTACT.md` | Clinic enquiry form fields, SMTP env, and launch mailbox recommendation         |
| `docs/architecture/CLINIC-PORTAL.md`     | Clinic portal IA, permissions, publication, logo upload                         |
| `docs/architecture/APPLICATION.md`       | Next.js monolith launch architecture and extraction triggers                    |
| `docs/architecture/CLINIC-ASSETS.md`     | Logo storage interface; Cloudflare R2 production provider                       |
| `docs/launch/R2-PROVISIONING.md`         | Manual R2 bucket/token/domain steps for Joaquín                                 |
| `README.md`                              | Repo entry; direction vs implementation                                         |

## Phase 2A clinic self-service foundation (implemented)

Date: 2026-09-11

Clinic portal is no longer read-only. Platform operator is distinct from clinic ADMIN.

| Area      | Behaviour                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Login     | Password input has a `type="button"` show/hide control. Default hidden.                                                                         |
| Nav       | Overview / Guides / Practice as one group; View patient site is a utility action after a divider.                                               |
| Operator  | `User.platformRole`. `/operator/clinics` lists real clinics. Clinic create is name+slug only. No impersonation or invites.                      |
| Guides    | Create from actual `GuideTemplate` rows or custom (`guideTemplateId` null). Draft v0, authenticated preview, publish copies immutable snapshot. |
| Timeline  | Optional `startDay`/`endDay`. Overlap rejected. Legacy `periodLabel` still renders.                                                             |
| Practice  | ADMIN edits `ClinicProfile` used by the tenant renderer. No arbitrary CSS. Booking remains hidden.                                              |
| Logo      | **BLOCKED** pending production object storage. Preview + coming-soon copy; no file input.                                                       |
| Not in 2A | Check-ins, RecoveryPlan persistence, analytics, billing, SMS/email, QR, fake templates.                                                         |

---

## Phase 2A.1 clinic portal UX polish (implemented)

Date: 2026-09-10

Staff/operator shell and editor ergonomics. No billing, analytics, Check-ins, or RecoveryPlan. Patient public pages stay clinic-first.

| Area            | Behaviour                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor actions  | Sticky header: Cancel (quiet) / Save draft (secondary) / Publish guide (primary). Publish asks for confirmation. Cancel never auto-saves.                           |
| Dirty state     | `Saved` / `Unsaved changes` / `Saving…`. `beforeunload` plus in-app link interception while dirty. Discard dialog: Keep editing / Discard changes.                  |
| Preview toolbar | Authenticated `/guides/[id]/preview` has a staff toolbar **outside** the patient renderer. ADMIN: Back to guide + Edit. STAFF: Back to guides. Public tenant: none. |
| Portal theme    | Device preference `aftercare-guide-portal-theme` (`System` / `Light` / `Dark`). Blocking bootstrap. Separate from `ClinicProfile.themeMode`.                        |
| Appearance      | Sidebar/mobile nav preference row above account/sign-out. Not a primary route.                                                                                      |
| Practice        | Still one `/practice` route. Sections: Identity, Branding, Contact, Emergency, Presentation. Save-state + Save changes. Logo upload still blocked.                  |
| Operator        | All Clinics breadcrumb and labelled “Back to all clinics” control. No impersonation.                                                                                |

---

## Phase 2A.2 portal workflow polish (implemented)

Date: 2026-09-11

Staff/operator workflow polish. No Check-ins, RecoveryPlan persistence, billing, analytics, or logo object storage. Aftercare still does not depend on `ProcedureSession`.

| Area              | Behaviour                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role labels       | Clinic membership ADMIN → **Clinic admin**; STAFF → **Clinic staff**; platform OPERATOR → **Platform operator**. Accessible text in the sidebar account area. Clinic admin is not a platform administrator.                                                |
| Desktop shell     | Viewport-fixed sidebar (`100dvh`). Main document scrolls independently. Sidebar may scroll internally on short viewports. Mobile keeps the drawer.                                                                                                         |
| Guides list       | Title + actions row; status pills `[Published]` `[Draft changes]` then source; secondary `/slug · Updated {date}`. ADMIN: Edit principal, Preview secondary, View patient guide quiet. Destructive actions in a compact overflow menu.                     |
| Draft delete      | Never-published: Delete draft (confirm). Published + draft changes: Discard draft changes (public pin unchanged). Currently published: Unpublish guide (public 404, history kept). STAFF cannot delete/discard/unpublish. Membership-scoped Prisma.        |
| Guide editor      | Normal page header. Desktop 2-column editor + sticky action/preview rail. Exclusive timeline accordion. Live preview reuses the patient presentational timeline list from unsaved state. Mobile: editor first, sticky bottom actions, collapsible preview. |
| Day/date contract | Generic public guides stay relative (`Day 0 · Procedure day`). Calendar dates require future RecoveryPlan. Demo fixture has explicit `simulatedStartDate: 2026-09-10` and `simulatedDay: 1`. No `Date.now()` for recovery day.                             |
| Practice          | Header rhythm ~2.25rem before the form. Section index with IntersectionObserver `aria-current`, smooth scroll (immediate under reduced motion). One native colour control + hex. Select chevron padding. Compact sticky save row in the form column.       |
| Visual artifacts  | [docs/product/artifacts/phase-2a.2/](artifacts/phase-2a.2/)                                                                                                                                                                                                |

Guide editor client island grew from **16,289** to **23,986** raw bytes for the accordion + live preview. No Motion, no new dependency. See [PERFORMANCE.md](../architecture/PERFORMANCE.md).

### Next clinic-portal work (not built)

Archive of published guides, QR, invitations/team management, canonical library authoring, production Storage bucket for logos, Check-ins, RecoveryPlan, messaging, PMS integrations, billing.

---

## Phase 2A.3 editor / practice / operator polish (implemented)

Date: 2026-09-12

Portal composition and operational polish. No Check-ins, RecoveryPlan, billing, analytics, NestJS, or production logo upload.

| Area           | Behaviour                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor         | Slim sticky toolbar: title, Draft pill, Saved/Unsaved/Saving…, Cancel / Save draft / Publish. Right rail is the live patient timeline preview. Mobile keeps the bottom bar and a collapsible preview.            |
| Practice       | Horizontal overflow removed via `min-width: 0` / `minmax(0, …)` on fields, selects, colour row, and the 3-column address grid. Form max-width ~42rem.                                                            |
| Dialogs        | Native `<dialog>` with application surface, header/body/footer, portal tokens, light/dark.                                                                                                                       |
| Sign out       | Full sidebar utility row: entire row click/hover/focus, ≥44px, not a red destructive control.                                                                                                                    |
| Logo           | Application upload path is implemented (ADMIN, R2/memory). Production still needs Joaquín to provision Cloudflare R2 — see R2 clinic asset storage below and [R2-PROVISIONING.md](../launch/R2-PROVISIONING.md). |
| Operator       | PLATFORM / All Clinics. Real summary: total / configured / published guides / needs attention. Clickable clinic rows via a real link. Nav remains Clinics only. Templates is next, not built.                    |
| Architecture   | Next.js App Router remains the launch backend. Extraction triggers documented in APPLICATION.md.                                                                                                                 |
| Seats (policy) | Essential 2, Practice 5, Group custom named users. No shared clinic login. Team/Users management is later.                                                                                                       |

---

## Phase 2A.4 overflow / preview / editor actions / logo readiness (implemented)

Date: 2026-09-12

Corrective pass. No Check-ins, RecoveryPlan, billing, analytics, NestJS, patient PII, filesystem uploads, or public-guide delete/unpublish.

| Area              | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practice overflow | Reproduced at desktop geometries including **1728×877**. Culprits were flex/grid children without `minmax(0,…)`, native `<select>` appearance, and `100vw` dialog width — not a page-level `overflow-x: hidden` clip. Instrumentation asserts `scrollWidth <= clientWidth` on document, main, and portal scroller.                                                                                                                                                         |
| Preview theme     | Authenticated preview no longer inherits portal `html[data-theme-mode]` into patient `light-dark()` tokens. `PatientThemeBoundary` owns `color-scheme` + `--cg-*`. Preview CSS uses `colorSchemeSelector: "scope"`. Clinic `themeMode` remains the Default patient appearance. Preview-only Light/Dark selector does not persist `ClinicProfile`.                                                                                                                          |
| Editor actions    | Compact **More actions** (`⋯`) in the editor toolbar. Never published → Delete draft. Published + draft → Discard draft changes (stay in editor, restore published snapshot). Published clean → no destructive action. Same server actions as the Guides list. `ConfirmDialog` copy unchanged. Disabled published slugs still post via a hidden field. After save/discard, the editor ignores the next `router.refresh()` snapshot so Saved does not flip back to Unsaved. |
| Logo upload       | Application path complete: ADMIN upload/replace/remove, PNG/JPEG/WebP + sanitized SVG, provider-independent object keys, `resolveClinicLogoSrc`. **External Cloudflare R2 bucket still required** for production. Memory driver is tests-only. See [CLINIC-ASSETS.md](../architecture/CLINIC-ASSETS.md).                                                                                                                                                                   |
| SVG               | Server-only JSDOM + DOMPurify. Render as `<img>` only. 1 MB SVG / 2 MB raster.                                                                                                                                                                                                                                                                                                                                                                                             |
| Dependencies      | Latest stable compatible directs; Auth.js v5 beta and Prisma 7 (not RC) remain documented exceptions.                                                                                                                                                                                                                                                                                                                                                                      |

### Remaining external step

Provision Cloudflare R2 (`clinic-branding-assets`), a scoped object token, `assets.<platform-domain>`, and server env `CLINIC_ASSET_STORAGE_DRIVER=r2`. Follow [R2-PROVISIONING.md](../launch/R2-PROVISIONING.md). Do not execute provisioning from Cursor against production.

---

## Phase 2A.5 shell + launch SEO polish (implemented)

Date: 2026-09-12

Corrective + pre-launch SEO pass. No R2/Cloudflare provisioning, DNS, NestJS, analytics, billing, RecoveryPlan, or Check-ins.

| Area           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal shell   | Desktop contract: `html:has(.staffAppShell)` / `body` / `.staffAppShell` are `100dvh` with `overflow: hidden` and `min-height: 0` down the flex chain. Sidebar remains viewport height. Scrolling `main.staffAppScroller` is the primary landmark (`flex: 1 1 0`, `overflow-y: auto`). Content may be taller than the viewport; the document/`window.scrollY` must stay `0`. Mobile keeps document/drawer scrolling. No `100vw` in staff chrome. No global `overflow-x: hidden`. Parked `/display` routes are not the shell. |
| Semantics      | `<main>` is the scroll region. Inner `.staffAppContent` is a layout wrapper. One main landmark per clinic portal / operator page.                                                                                                                                                                                                                                                                                                                                                                                            |
| Overflow tests | Horizontal: `scrollWidth <= clientWidth + 1` on document, `.staffAppMain`, `.staffAppScroller`, `.staffAppContent`, and `.staffEditorPage` when present. Vertical desktop (1728/1440/1280/1100/1024): `window.scrollY === 0`, sidebar `top === 0` and `bottom ~= innerHeight`, long Practice/editor content scrolls `staffAppScroller.scrollTop`.                                                                                                                                                                            |
| Launch SEO     | Marketing `/`, `/pricing`, `/contact` are indexable with title, description, canonical, Open Graph, Twitter summary, and sitemap inclusion. Staff/operator/`app.` routes and authenticated preview are `noindex, nofollow`. Tenant patient pages are `noindex, follow` with clinic/guide title, description, canonical hostname, and Open Graph for sharing. Draft/authenticated preview is never canonical.                                                                                                                 |
| Future search  | Do **not** add a clinic-guide schema field this pass. Default remains private-from-search. Phase 2B later added platform marketing SEO settings; clinic-guide `searchVisibility` is still future. See Phase 2B.                                                                                                                                                                                                                                                                                                              |
| Operator CMS   | Operator is the content/control plane. Phase 2A.5 still had Clinics only. Phase 2B added SEO & Discovery. Do not add empty Templates navigation.                                                                                                                                                                                                                                                                                                                                                                             |

## Phase 2A.5 QA corrections (implemented)

Date: 2026-09-12

Manual QA follow-up on `feature/phase-2a5-shell-seo-polish`. Phase 2A.4 (`3ae8cdd`) is an ancestor. SEO 2A.5 behaviour is preserved. No R2/Cloudflare change.

| Area             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor overflow  | Culprit was `.staffEditorLayout` switching to two columns at viewport `1024px` while the 16rem sidebar is already visible from `768px`. Previous tests measured clipped shell `scrollWidth` and omitted 1100/900. Layout now uses a `staff-editor` container query at `56rem` content width. Tailwind structural `lg:` / `max-w-6xl` removed from the editor page.                                                                                                                                                                                                          |
| CSS architecture | Tailwind remains staff-only (`app/(staff)/staff.css`). Patient/marketing layouts do not import it. No wholesale staff CSS Modules migration. Editor grid has one CSS owner.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Unpublish        | Additive `PracticeGuideStatus.UNPUBLISHED`. ADMIN unpublish clears the public pin (`isEnabled false`) and keeps the guide, draft, and published revision history. Tenant URL 404s until explicit republish. STAFF and cross-clinic cannot.                                                                                                                                                                                                                                                                                                                                  |
| Delete           | Draft and Unpublished: ADMIN may delete the PracticeGuide instance (list + editor More actions). Published: Unpublish first; no direct Delete. Template-backed deletion does not touch canonical `GuideTemplate` / revisions; the template becomes available to enable again. Confirmation for unpublished makes permanent removal explicit. STAFF and cross-clinic cannot.                                                                                                                                                                                                 |
| Preview theme    | Authenticated preview **defaults to Follow portal** (`aftercare-guide-portal-theme`). The selector resolves **one** effective appearance for toolbar and patient document: Follow portal Light/Dark, Clinic default (`ClinicProfile.themeMode` + OS when SYSTEM), or explicit Light/Dark. There is no split of portal chrome + patient document. Explicit Light/Dark are preview-only and do not write Practice. Public tenant SYSTEM still follows the patient device `prefers-color-scheme`; portal preference has no effect. Editor live preview uses the same resolver. |
| E2E isolation    | Playwright uses dedicated `care_guide_e2e` (`E2E_DATABASE_URL` or derived from `DATABASE_URL`). `reuseExistingServer` is false. Global teardown fails if the development database guide IDs change. Optional `scripts/list-e2e-guide-artifacts.mjs` / `scripts/cleanup-e2e-guide-artifacts.mjs --yes` — do not run cleanup unless Joaquín approves.                                                                                                                                                                                                                         |

## Phase 2A.5 visual system corrections (implemented)

Date: 2026-09-12

Focused theme/typography pass on `feature/phase-2a5-shell-seo-polish`. Phase 2A.4 (`3ae8cdd`) remains an ancestor. SEO, shell scroll, unpublish/delete, Follow portal, and E2E DB isolation are preserved. No R2/Cloudflare change.

| Area            | Behaviour                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preview toolbar | Authenticated preview chrome (`.staffPreviewShell` / `.staffPreviewToolbar`) follows the **same effective preview appearance** as the patient document (`data-preview-theme` on the shell). Staff tokens are re-declared with `light-dark()` on the shell so they do not keep `html[data-theme-mode]`. Opaque `--staff-panel`. |
| Demo notice     | `--cg-notice-surface`, `--cg-notice-border`, `--cg-notice-text`, `--cg-notice-muted`. Calm informational Light/Dark. Does not use warning/emergency tokens or hardcoded white/black.                                                                                                                                           |
| Back link       | Editors: `Back to {guide title}` from the loaded guide (e.g. `Back to Tooth Extraction`). STAFF without edit: still `Back to guides`. Truncates visually; `aria-label` / `title` keep the full name.                                                                                                                           |
| Status pills    | Shared `--staff-status-success-*` / `--staff-status-warning-*` with explicit Light/Dark. Overview **Configured** / **Needs attention**, guide Published/Draft/Unpublished/Draft changes, operator setup labels. Not neon.                                                                                                      |
| Geist           | One `next/font` module. `--font-geist-sans` on marketing, staff, and aftercare html. Patient CSS Modules consume the variable without Tailwind. Print uses Geist with `sans-serif` fallback. Same two preloaded WOFF2 hashes across route groups; no duplicate family load.                                                    |

## Phase 2A.5 preview chrome + editor textarea QA (implemented)

Date: 2026-09-12

Manual QA follow-up on `feature/phase-2a5-shell-seo-polish`. Unified preview appearance. Public tenant `ClinicProfile.themeMode` behaviour is unchanged.

| Area            | Behaviour                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview theme   | `resolveEffectivePreviewAppearance` returns `light` / `dark` / `system` once. `.staffPreviewShell[data-preview-theme]` and `PatientThemeBoundary` both receive that value. Explicit Light cannot leave a dark toolbar. |
| Editor textarea | Shared `textarea.staffField`: `rows={4}`, `height: auto`, `min-height: calc(1.5em * 4 + 1rem)`, vertical resize. `.staffField { height: 2.75rem }` no longer clips multiline guide fields.                             |

---

## Phase 2A.5 brand + interaction system (implemented)

Date: 2026-09-12

Corrective pass on `feature/phase-2a5-shell-seo-polish`. Commercial/product name is **River Aftercare**. Phase 2A.5 SEO, shell scroll, unpublish/delete, Follow portal, Geist, and E2E DB isolation are preserved. No R2/Cloudflare change. No new UI library. Patient does not import Tailwind.

| Area          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name  | `PRODUCT_NAME` / `PRODUCT_ATTRIBUTION` in `lib/branding/product-name.ts`. Visible marketing, auth, staff, operator, preview, print, email subject, and patient attribution use River Aftercare. Riverside Dental Demo remains the clinic. Repository and package are `river-aftercare`; `CARE_GUIDE_*` identifiers unchanged. Product **logo** `/brand/river-aftercare-logo.svg` (771×123 warm wordmark, dark marketing header). Product **isologo** `/brand/river-aftercare-isologo.svg` (180×180 mark, light marketing header, footer, staff/operator chrome). Favicon pack in `public/favicons/` is copied to `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`, and `/favicon.ico`; extra sizes and the web manifest are in `lib/seo/icons.ts`. Latest approved pack landed 2026-09-17. |
| Interactions  | Shared `app/interaction.css` (`--interaction-duration: 150ms`). Primary / secondary / quiet / nav / inline / patient-brand controls: tonal hover, no translate/scale on routine buttons, `:focus-visible` remains a ring, hover gated with `@media (hover: hover) and (pointer: fine)`, `prefers-reduced-motion` zeroes duration. Patient colours stay `--cg-*`. Staff semantic colours are explicit light/dark hex (not `light-dark()`), so theme switches do not interpolate through unreadable mid-states. Patient CSS raw budget is 26,000 (gzip/brotli unchanged).                                                                                                                                                                                                                           |
| `[VAULT]` log | Not application code and not a bundled dependency. Classified as a browser extension / injected script. River Aftercare was not changed for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## Phase 2B SEO, discovery, and launch audit (implemented)

Date: 2026-09-13

Local phase on `feature/phase-2b-seo-discovery-launch`. Starts from current main (River Aftercare brand pack already merged). No Vercel/Neon/Cloudflare/R2/domain provisioning. No billing, Check-ins, RecoveryPlan, NestJS, or patient PII.

| Area             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Marketing header | Public logo/isologo height `1.625rem`, `width: auto`. Desktop marketing nav links `1rem`. Clinic/staff nav unchanged.                                                                                                                                                                                                                                                                                                                                                                      |
| Operator         | `/operator/seo` — SEO & Discovery. Platform OPERATOR only. Nav: Clinics, SEO & Discovery.                                                                                                                                                                                                                                                                                                                                                                                                  |
| SEO data         | `PlatformSeoSettings` + `MarketingPageSeo`. Code fallbacks if the row is absent. Canonical URLs derived, not editable. No `seo.json`, no raw JSON-LD editing.                                                                                                                                                                                                                                                                                                                              |
| JSON-LD          | Server-generated Organization / WebSite / SoftwareApplication (no Offer — pricing remains provisional) / ContactPage / AboutPage.                                                                                                                                                                                                                                                                                                                                                          |
| Public pages     | `/about`, `/privacy`, and `/terms` published. Privacy/Terms are **production-facing drafts — legal review still required, not approved.**                                                                                                                                                                                                                                                                                                                                                  |
| Discovery        | `/llms.txt` generated from identity + public routes, including clinic vertical pages. `llms-full.txt` skipped until a governed corpus exists. Sitemap includes `/about` and `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics`. Tenant guides remain noindex and off the sitemap.                                                                                                                                                                                           |
| OG image         | Operator upload/replace/remove for a dedicated 1200×630 PNG/JPEG/WebP. Stored in `PlatformSeoSettings.defaultOgImagePath` as `/platform/seo/<uuid>.<ext>`. Logo is not used as a social card.                                                                                                                                                                                                                                                                                              |
| Docs             | [../architecture/SEO.md](../architecture/SEO.md), [../launch/PRODUCTION-READINESS.md](../launch/PRODUCTION-READINESS.md), [../launch/AGENTIC-READINESS.md](../launch/AGENTIC-READINESS.md), [ADR 0020](../adr/0020-platform-seo-is-structured-database-configuration.md), [ADR 0021](../adr/0021-clinic-patient-guides-stay-noindex-by-default.md), [ADR 0023](../adr/0023-platform-seo-assets-use-a-distinct-private-r2-namespace.md). Visuals: [artifacts/phase-2b](artifacts/phase-2b). |
| Templates        | Sample **Tooth Extraction** library row is demo-tenant-only. It is not clinical approval.                                                                                                                                                                                                                                                                                                                                                                                                  |
| QR               | Clinic staff Share for published/enabled guides (durable public URL, SVG/PNG). Patient pages do not show a QR. See public UI + share polish.                                                                                                                                                                                                                                                                                                                                               |
| Auth             | `next-auth` v5 beta unchanged; documented as an acceptable first-launch exception pending a separate decision.                                                                                                                                                                                                                                                                                                                                                                             |

---

## Marketing + trust polish (implemented)

Date: 2026-09-13

Visual consistency and trust-page completion on current main (Phase 2B). No pricing, infra, lifecycle, PII, or UI-library changes.

| Area                 | Behaviour                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Numbered lists       | One `[01] [rule] [copy]` pattern (`MarketingNumberedSteps`) for the homepage problem list and pricing onboarding.                                                                                                                                                                      |
| Onboarding copy      | Riverside Dental Demo uses a Tooth Extraction **sample** template. Other procedures are planned/onboarding, not advertised as available.                                                                                                                                               |
| Phone + Patient View | Lightweight marketing replicas using shared `--cg-*` tokens and `data-patient-theme="portal"` so Light/Dark follow marketing appearance. Riverside Dental Demo brand stays teal, not River cobalt.                                                                                     |
| Coming after launch  | Existing card system; bullets use first-line offset, not `align-items: center`.                                                                                                                                                                                                        |
| Contact              | Submit uses `MarketingPrimaryButton` (canonical `.button.primary`).                                                                                                                                                                                                                    |
| Login                | `← Back to River Aftercare` via `apexPublicUrl` / `marketingPublicLinks().homeHref`.                                                                                                                                                                                                   |
| Legal                | `/privacy` and `/terms` are production-facing drafts. Operator is a sole trader trading as River Aftercare, ABN 32 671 297 130, Tweed Heads South NSW. Remaining placeholders: `[FULL LEGAL NAME]`, `[PRIVACY EMAIL]`. Invoice/AUD commercial terms encoded. **Not legally approved.** |
| Footer               | For clinics (Dental, Physiotherapy, Chiropractic, Cosmetic & aesthetic), Product (About, Pricing, Contact), Legal (Privacy, Terms), Account (Sign in). Homepage anchors removed.                                                                                                       |
| SEO                  | Privacy/Terms are `index,follow`, in sitemap and `llms.txt`. Operator SEO form includes the known paths.                                                                                                                                                                               |

---

## Public UI + published-guide QR share (implemented)

Date: 2026-09-14

Local polish on `feature/public-ui-share-polish`. Preserves Phase 2B SEO/trust work. No pricing, infra, legal-approval, or patient PII changes.

| Area        | Behaviour                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact CTA | `.button` resets native `<button>` UA chrome (`appearance: none`, `border: 0`). Rest/hover/focus computed styles match homepage `View the clinic demo`.                                                                                                                                                                         |
| Primary nav | Desktop and mobile: About, Pricing, Contact, Sign in. Privacy/Terms stay footer-only. Login heading remains **Staff sign in**.                                                                                                                                                                                                  |
| About       | One first `.band` with two related `headingBlock`s; second uses `.headingFollow`. Copy stays web-first / clinic-branded / dental-first / not CRM, monitoring, or messaging.                                                                                                                                                     |
| Legal       | Privacy and Terms share Contact’s `.band` top padding after the hero/wave. Body measure remains `max-width: 42rem`. Per-document draft banners remain until counsel review.                                                                                                                                                     |
| QR          | Derived from the canonical public guide URL (`clinicPatientSiteUrl` + `publicSlug`). Server `qrcode` SVG/PNG, ECC H, dark-on-light, quiet zone 4. Share on published+enabled guides only (ADMIN and STAFF). Draft/unpublished have no Share. Same URL after republish; unpublish is 404. No patient-page QR. No QR image table. |

---

## Public legal copy rewrite (2026-09-14)

Production-facing Privacy Policy and Terms & Conditions. Still **DRAFT FOR LEGAL REVIEW**.

| Fact                   | Public copy                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| Operator               | Sole trader trading as River Aftercare, ABN 32 671 297 130, Tweed Heads South NSW |
| Remaining placeholders | `[FULL LEGAL NAME]`, `[PRIVACY EMAIL]`                                            |
| Billing                | AUD, monthly in advance, 14-day invoices, bank transfer initially, month-to-month |
| Law                    | NSW, non-exclusive jurisdiction                                                   |
| Patient data           | Current product is not designed for identifiable patient health records           |
| Export                 | Customer may request a reasonable export — no self-service export in the app yet  |
| Backups                | Intended 90-day rotation; not an implemented production control                   |

Do not remove the draft banners until counsel review and the remaining launch blockers are resolved. Do not invent GST status, subprocessors, or a privacy email.

---

## R2 clinic asset storage (implemented)

Date: 2026-09-13; private Vercel delivery 2026-09-16; public CORP `same-site` 2026-09-17

Application support for production clinic logos on **Cloudflare R2**. The bucket stays private. Public reads are not r2.dev and not an R2 custom domain.

| Area         | Behaviour                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider     | `CLINIC_ASSET_STORAGE_DRIVER=r2` + `@aws-sdk/client-s3` server-only. Supabase Storage clinic-asset adapter removed. Parked chairside Realtime unchanged.                                                                                                                                                                                                          |
| DB contract  | `ClinicProfile.logoUrl` stores a demo path or object key `clinics/<clinicId>/branding/<uuid>.<ext>`. No migration. Resolve with `resolveClinicLogoSrc`.                                                                                                                                                                                                           |
| Upload       | ADMIN server action: validate → sanitize SVG → PutObject → DB key update → best-effort old delete. STAFF 404 on Practice; mutations forbidden. Cross-clinic forbidden. No browser-direct uploads.                                                                                                                                                                 |
| Public URL   | `CLINIC_ASSET_PUBLIC_ORIGIN` + key. Production: `https://assets.riveraftercare.com.au/...` → Vercel route → private `GetObject`/`HeadObject`. Tests/memory use `/clinic-branding/<clinicId>/<file>`.                                                                                                                                                              |
| Host         | Public route serves only when `Host` matches `CLINIC_ASSET_PUBLIC_ORIGIN`. Apex, `app.`, tenants, and arbitrary hosts get a generic 404. `assets` is a reserved tenant slug.                                                                                                                                                                                      |
| Headers      | Public `/clinics/.../branding/...` success: `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-site`. Never `same-origin` on that route (subdomain-to-`assets.` `<img>` loads). No CORS. Fallback `/clinic-branding/...` keeps `same-origin` + CSP for localhost/tests. |
| Tests        | Memory driver. Playwright e2e uses memory. No live Cloudflare.                                                                                                                                                                                                                                                                                                    |
| Provisioning | [R2-PROVISIONING.md](../launch/R2-PROVISIONING.md) for Joaquín (env only). Worker not required. Vercel remains authoritative DNS.                                                                                                                                                                                                                                 |

---

## Platform SEO OG upload (implemented)

Date: 2026-09-17

Operator upload of the default social sharing image to the existing private R2 bucket, isolated from clinic branding.

```text
Operator
  -> server-side validated upload
  -> private R2
  -> platform/seo/<immutable-key>
  -> assets.riveraftercare.com.au
  -> Vercel cached public exact-key delivery
```

| Area        | Behaviour                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator UI | Contained SEO card: visually hidden file input, explicit choose-then-upload, cancel selection, confirm before removing the default social image. Storage/validation/precedence unchanged.      |
| Contract    | `PlatformSeoSettings.defaultOgImagePath` stays canonical. Uploads persist `/platform/seo/<uuid>.<ext>`. No second SEO image column.                                                            |
| Storage     | Narrow `PlatformSeoAssetStorage`. Clinic `ClinicAssetStorage` is unchanged. Same private bucket, credentials, and `assets.` origin.                                                            |
| Validation  | Exact 1200 × 630 PNG/JPEG/WebP, ≤ 2 MB. Magic bytes, MIME, extension, and dimensions checked. SVG rejected. No resize/recompress.                                                              |
| Auth        | Platform OPERATOR only. Unauthenticated, clinic ADMIN, and STAFF cannot mutate.                                                                                                                |
| Delivery    | `GET`/`HEAD` `/platform/seo/[filename]` on the asset host. Host header only. Generic empty 404 otherwise. MIME from filename. `Cache-Control` immutable, `nosniff`, CORP `same-site`, no CORS. |
| Lifecycle   | Upload then persist then best-effort delete previous managed object. Persistence failure deletes the new orphan. Legacy `/brand/...` and external URLs are never deleted.                      |
| Metadata    | Page `ogImagePath` still wins. Uploaded default fills Open Graph and Twitter when no page override exists. Canonical/index/sitemap/robots/llms unchanged.                                      |
| Safety      | R2 remains private. r2.dev disabled. No R2 custom domain. No browser-direct upload. Private patient documents must never use this public-by-exact-key path.                                    |

---

## Vercel Prisma initialization (implemented)

Date: 2026-09-14

Second Vercel build blocker after `prisma generate` on main (`0fa1986`). `next build` imports route modules during **Collecting page data**. Eager `lib/prisma.ts` threw `DATABASE_URL is required to initialize Prisma` while inspecting `/api/auth/login` (also `/api/auth/logout`, `/api/auth/me`).

| Area       | Behaviour                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract   | Importing `@/lib/prisma` does not read `DATABASE_URL`, create `PrismaPg`, or construct `PrismaClient`. `getPrisma()` does that on first real DB use and still throws the same configuration error if the URL is missing. |
| Auth.js    | `PrismaAdapter` receives getters so NextAuth config at module load does not call `getPrisma()`. Auth still fail-fasts on missing `AUTH_SECRET`.                                                                          |
| Call sites | Server modules use `getPrisma()` inside request/server functions (or default params evaluated at call time). No client components import Prisma. Tests that hit a real DB call `getPrisma()` after `dotenv`.             |
| Build      | A clean worktree with `DATABASE_URL` unset must get past Collecting page data. Do not add a fake URL or provision Neon for this. Marketing SEO loaders already catch DB failures during sitemap/metadata.                |

---

## Marketing mobile UI polish (2026-09-15)

Public marketing only. No Neon, auth, tenancy, proxy, or R2 changes.

| Area               | Behaviour                                                                                                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone mockup       | Empty space was the stacked hero `min-height`, small `72vw` / `15.75rem` phone, and `deviceStage` padding. Mobile/tablet now hug content (`min-height: 0` below `64rem`), phone is larger (`84vw` / tablet `46vw`), bloom stays on the hardware wrapper.                                        |
| Supporting note    | Compact native cluster **below `64rem`**: kicker **Patient aftercare view** plus No login / No app to install / Practice one tap away. Hidden on desktop so the hero wave stays in the 1440×900 fold. Phone remains `aria-hidden`; the note is readable. No extra JS.                           |
| Mobile nav focus   | About looked pre-selected because open always `focus()`ed the first link and `.navMenuRow:focus` drew an outline. Pointer/touch now focuses the panel (`tabIndex={-1}`); keyboard Enter/Space still focuses the first link. Rings are `:focus-visible` only. Escape still restores the trigger. |
| Mobile nav styling | Slightly larger sheet, route list separated from Sign in + Theme, current/selected inset brand bar. Same destinations. No hamburger morph. Desktop header nav gap is `0.7rem 2.5rem`.                                                                                                           |

Hero-attributed client JS added: **0**. Nav still uses the existing Client Component.

---

## PostgreSQL 18 repository contract (2026-09-16)

Local/test compatibility upgrade. **Neon production was not contacted.** Production schema is not migrated. Vercel `DATABASE_URL` is unchanged.

| Surface            | Contract                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Docker       | `postgres:18-alpine`, port **5432**, DB `care_guide`, volume `postgres18_data` → `/var/lib/postgresql`, `PGDATA=/var/lib/postgresql/18/docker`                                                                      |
| Legacy PG17 volume | Compose key `postgres_data` (mount `/var/lib/postgresql/data`) is **unused**. Do not `docker compose down -v`. Dump/restore runbook: [../development/POSTGRES-18-UPGRADE.md](../development/POSTGRES-18-UPGRADE.md) |
| Vitest DB tests    | Same `DATABASE_URL` server; assert `SHOW server_version` major 18                                                                                                                                                   |
| Playwright         | `care_guide_e2e` on the same PG18 server. Global setup fails if major ≠ 18. Does not write the development DB                                                                                                       |
| GitHub Actions     | **None.** Automated tests assume a reachable PG18 at `DATABASE_URL`                                                                                                                                                 |
| Production Neon    | Project **River Aftercare Production**, branch `production`, AWS Asia Pacific 2 (Sydney), PostgreSQL 18. Empty of River Aftercare schema until Joaquín migrates                                                     |
| Prisma             | 7.10.x + `@prisma/adapter-pg` + `pg`. No Prisma 8 RC. No `@neondatabase/serverless`                                                                                                                                 |
| CLI URL            | `prisma.config.ts` uses `DIRECT_URL` when set, else `DATABASE_URL`. Runtime `getPrisma()` always uses `DATABASE_URL`                                                                                                |
| Later Vercel       | Pooled Neon URL (`-pooler`, `sslmode=require`) as `DATABASE_URL`; unpooled as `DIRECT_URL` for `prisma migrate deploy`                                                                                              |
| Extensions         | Default `plpgsql` only. No `pgcrypto` / `uuid-ossp` / `citext`                                                                                                                                                      |
| Generated columns  | None                                                                                                                                                                                                                |

Do not claim production is ready because the Neon project exists.

---

## Marketing master-brand repositioning (2026-09-16)

Public marketing copy and SEO defaults present River Aftercare as **patient aftercare software for clinics and practices**, not a dental-first / mobile-first product that may broaden later. Dental remains the live demo example (Riverside Dental Demo / Tooth Extraction). Clinic vertical acquisition pages sit on top of this master-brand positioning.

| Area            | Behaviour                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Master brand    | Patient aftercare for clinics and practices. Core H1 remains **Aftercare that still feels like your clinic.**                                                                                                                                          |
| Demo CTA        | **View the dental demo** (Riverside Dental Demo). Closing / contact CTA remains **Request a demo**.                                                                                                                                                    |
| Pricing         | Essential / Practice / Group prices unchanged. Plan copy no longer claims a dental-only library. Templates are “available River Aftercare guide templates”.                                                                                            |
| SEO titles      | Operator `seoTitle` is the complete document title. If it already contains the site name, do **not** append `— River Aftercare`. Marketing metadata always uses `{ absolute }`. Layout has a default title and **no** `%s — River Aftercare` template. |
| JSON-LD         | `WebPage.name` uses the page SEO title. OG title/description overrides are social-only.                                                                                                                                                                |
| Privacy / Terms | Still drafts. Source defaults are `noindex, follow`. Sitemap and `llms.txt` still list them. Production operator rows are **not** mutated; uncheck Allow indexing on `/privacy` and `/terms` after deploy if those rows already exist.                 |
| Group plan      | Copy is commercial/onboarding (“coordinated rollout”), not a claim that multi-location centralised management UI exists.                                                                                                                               |

---

## Clinic vertical acquisition pages (2026-09-16)

Indexable B2B pages on the apex host. Shared composition, distinct copy. Layered on the master-brand repositioning: the homepage stays broad clinic/practice positioning and adds a vertical discovery section.

| Area    | Behaviour                                                                                                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes  | `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics` rewrite through existing `/_marketing` proxy. Tenant copies 404.                                                                                                            |
| Content | `lib/marketing/vertical-landing.ts` + `MarketingVerticalLanding`. Dental uses the real Riverside Dental Demo. Other verticals have no fake demos or template libraries.                                                                       |
| SEO     | Defaults in `DEFAULT_MARKETING_PAGE_SEO`. Operator SEO registry includes all four. Titles that already contain the site name stay absolute so they do not become `… \| River Aftercare — River Aftercare`.                                    |
| Nav     | Desktop **For clinics** click disclosure (keyboard, Escape, outside click). Mobile site menu group. Footer **For clinics** column.                                                                                                            |
| Schema  | Shared Organization / WebSite / SoftwareApplication plus per-route `WebPage`. No FAQPage, MedicalWebPage, reviews, or per-profession SoftwareApplication.                                                                                     |
| Tests   | `pnpm lint`, `pnpm test` (586), `pnpm build`, and Playwright (155) pass locally after the FAQ accordion pass. Mobile site-menu keyboard order starts at Dental, then physiotherapy / chiropractic / cosmetic, then About / Pricing / Contact. |

---

## Final marketing FAQ and copy QA (2026-09-17)

Pre-indexing content pass. Positioning, navigation, metadata, and layout were left in place.

| Area       | Behaviour                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root cause | FAQ copy already lived in `VERTICAL_LANDINGS`. `MarketingVerticalLanding` rendered each item as a `MarketingRevealItem` **outside** a `MarketingRevealGroup`. Those nodes keep `data-mk-pending`, so enhanced motion CSS leaves them at `opacity: 0`. The heading revealed; the questions did not. |
| Accordion  | Shared server-rendered `MarketingFaq` uses native `<details>`/`<summary>`. Questions and answers are in the HTML when collapsed. No FAQPage schema.                                                                                                                                                |
| Copy       | Homepage patient-preview caption uses “guidance” / “clinic”. Pricing heading is “Choose the plan that fits your practice”. Roadmap item is “Connected aftercare plans”. Physiotherapy template note and chiropractic guidance note were tightened without claiming extra product capability.       |
| lastmod    | `/`, `/pricing`, and the four vertical routes bump `DEFAULT_MARKETING_PAGE_SEO.lastModified` to `2026-09-17`. Titles, robots, canonicals, and JSON-LD types are unchanged.                                                                                                                         |
| Tests      | `pnpm lint`, `pnpm test` (586), `pnpm build`, and Playwright (155) pass in this environment after installing PostgreSQL 18 locally (Docker was unavailable).                                                                                                                                       |

---

## Accurate sitemap lastmod (2026-09-17)

Production sitemap was emitting per-route Prisma `MarketingPageSeo.updatedAt` (and `PlatformSeoSettings.updatedAt` via max). Operator save upserts every path in a loop, so lastmod was sequential write time, not page-content time.

| Area      | Behaviour                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Contract  | `DEFAULT_MARKETING_PAGE_SEO[path].lastModified` is a `YYYY-MM-DD` content-change date. Sitemap reads that field only.                 |
| Semantics | Update lastModified when materially changing indexable page content. Do not bump it for deploys, formatting, or sitemap regeneration. |
| Loader    | `app/sitemap.ts` no longer loads Prisma timestamps. Invalid or missing dates omit `lastmod` rather than inventing now().              |

---

## Practice save jsdom isolation (2026-09-17)

Production `POST /practice` returned HTTP 500 while saving ordinary branding. No logo was uploaded.

| Area            | Behaviour                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root cause      | `practice/actions.ts` co-exported `savePracticeSettingsAction` with logo upload/remove. Next evaluated the whole `"use server"` module, which statically imported `mutate-clinic-logo` → `sanitize-clinic-logo-svg` → `jsdom` / `dompurify`.                                 |
| Runtime failure | jsdom 30 `require()`s CJS `html-encoding-sniffer@6`, which `require()`s ESM-only `@exodus/bytes`. Vercel’s Node runtime disables `require(esm)`, so module evaluation throws `ERR_REQUIRE_ESM`. Dynamic `import("jsdom")` does not fix that inner `require()`.               |
| Isolation       | Settings save stays in `practice/actions.ts`. Logo upload/remove moved to `practice/logo-actions.ts`. `mutate-clinic-logo` dynamically imports the sanitizer only when `validated.kind === "svg"`. Raster PNG/JPEG/WebP and ordinary Practice mutations must not load jsdom. |
| jsdom pin       | **26.1.0** (last CJS-safe line: `html-encoding-sniffer@4` + `parse5@7`). `@types/jsdom` 21.1.7. Do not bump to 27+ until the Vercel CJS graph is safe. Do not change Vercel `NODE_OPTIONS` to paper over this.                                                               |
| Security        | SVG still uses server-side jsdom XML parse + DOMPurify. No unsanitised SVG. Rendered as `<img>` only. Platform OG upload and clinic R2 adapter unchanged.                                                                                                                    |

---

## Vercel Web Analytics (2026-09-17)

Cookieless platform page-view telemetry. This is **not** the PRD operator anonymous-analytics dashboard.

| Area    | Behaviour                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `@vercel/analytics` 2.0.1 (`latest` stable). Import `Analytics` from `@vercel/analytics/next`.                                                                    |
| Layouts | Mounted in the three independent root layouts: marketing, staff, aftercare. There is no shared `app/layout.tsx`.                                                  |
| Privacy | Public draft describes cookieless aggregated page-view stats via the application hosting provider. Do not name Vercel in `/privacy`. Legal review still required. |
| Product | Operator analytics (views by practice/guide, QR-origin) remain unimplemented.                                                                                     |

---

## Vercel Speed Insights (2026-09-17)

Cookieless Core Web Vitals / page-load telemetry. Same three root layouts as Web Analytics.

| Area    | Behaviour                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package | `@vercel/speed-insights` 2.0.0 (`latest` stable). Import `SpeedInsights` from `@vercel/speed-insights/next`.                                               |
| Layouts | Mounted beside `<Analytics />` in marketing, staff, and aftercare root layouts.                                                                            |
| Privacy | Public draft covers aggregated performance measurement through the application hosting provider, still without naming Vercel. Legal review still required. |

---

## Vertical acquisition design system v2 (2026-09-17)

Shared premium editorial system for `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics`. Content strategy and SEO metadata are unchanged. This is presentation, not a copy rewrite.

| Area           | Behaviour                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition    | `MarketingVerticalLanding` + `MarketingVerticalHero`. Typed model in `lib/marketing/vertical-landing.ts` now includes `themeId`, hero pathway panel, guidance status, proof/fit extras, FAQ eyebrow, and a single closing secondary (`View pricing`). |
| Accents        | CSS custom properties `--vertical-accent` / `--vertical-accent-secondary` / `--vertical-accent-soft` / `--vertical-glow` on `.page[data-vertical]`. Dental periwinkle, physio cyan, chiro cobalt, cosmetic periwinkle/lavender mix from existing brand tokens. |
| Spacing        | `--mk-section-space-xl/lg/md` for vertical section rhythm. Homepage chapter padding is unchanged.                                                                                                         |
| Surfaces       | Hero canvas → problem soft → solution canvas → guidance soft → workflow canvas → proof/fit showcase → FAQ soft → closing CTA + glow → quiet footer.                                                       |
| Hero           | Split copy + truthful pathway panel. Not the homepage phone mockup. Dental keeps the real demo CTA.                                                                                                       |
| Workflow       | Connected process rail (`ol` + numbered nodes). Decorative connector is `aria-hidden`.                                                                                                                    |
| Proof          | Dental: Riverside Dental Demo typographic showcase. Other verticals: profession-specific fit module, no fake demos.                                                                                        |
| CTA / footer   | Closing CTA is Request a demo + View pricing only. Footer is a quiet utility band: For clinics / Product (includes Sign in) / Legal. Account column removed. No “Request a demo” in the footer.             |
| Copy exception | Dental guidance badge is **Current starting template** / Tooth Extraction, not “reviewed”, because the sample is not clinically reviewed.                                                                  |
| SEO            | Titles, descriptions, canonicals, robots, JSON-LD, sitemap, and `lastModified` unchanged. Main copy remains server-rendered; FAQ answers stay in markup.                                                  |

