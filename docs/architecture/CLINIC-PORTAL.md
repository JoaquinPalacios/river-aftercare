# Clinic portal and platform operator — Phase 2A

Staff/admin UI for River Aftercare. Patient tenant rendering remains the source of truth for branding and guide documents.

## Hosts

| Host               | Audience               | Surface                                                                         |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------- |
| Apex / `localhost` | Public                 | Marketing (`/`, `/pricing`, `/contact`)                                         |
| `app.<root>`       | Clinic staff, operator | Clinic portal, operator, parked chairside. Anonymous `/` redirects to `/login`. |
| `<slug>.<root>`    | Patients               | Branded aftercare only                                                          |

## Clinic portal

Primary navigation (one group, identical row treatment):

1. Overview — `/dashboard`
2. Guides — `/guides`
3. Practice — `/practice` (clinic `ADMIN` only)

Utility action, separated by a divider:

- View patient site ↗ — real tenant origin, new tab

Preferences, separated by a divider, above account:

- Appearance — System / Light / Dark for the **staff/operator shell**. Stored as `aftercare-guide-portal-theme` on this device. Does **not** change `ClinicProfile.themeMode` (patient presentation).

Account/sign-out stay below Appearance. **Account** (`/account`) is a shared authenticated page for operator, clinic admin, and clinic staff (profile name/email plus change password). `/account/security` redirects to `/account#security`. Sign out uses the same full-row hit area as other sidebar utility rows (minimum 44px). It is account navigation, not a high-prominence destructive action.

### User-facing role labels

Raw enums never appear in the UI. Role is always accessible text (not colour-only).

| Actor                     | Product label         | Notes                                                   |
| ------------------------- | --------------------- | ------------------------------------------------------- |
| Clinic membership `ADMIN` | **Clinic admin**      | Clinic mutations only. Not a platform administrator.    |
| Clinic membership `STAFF` | **Clinic staff**      | Read-only guides. No Edit, delete/discard, or Practice. |
| Platform `OPERATOR`       | **Platform operator** | Operator surface only (`/operator/*`).                  |

Sidebar account area shows the person's name (or email) plus that role on a second line.

### Desktop shell

From Phase 2A.5 the desktop portal width contract is:

```
.staffAppShell          flex row, width 100%, min-width 0, height 100dvh, overflow hidden
  aside.staffAppSidebar flex 0 0 16rem, overflow-x clip, overflow-y auto
  .staffAppMain         flex 1 1 0, min-width 0, height 100dvh, overflow hidden
    header              mobile only
    main.staffAppScroller  min-width 0, width 100%, overflow-y auto, overflow-x clip
      .staffAppContent  width 100%, min-width 0, max-width 100%, padding, box-sizing border-box
```

`<main>` is the primary scroll region and the one main landmark. `.staffAppContent` owns padding. Inner pages may still cap reading width (`max-w-5xl`). Do not use `100vw` inside the desktop shell. Do not clip overflow with a global `overflow-x: hidden`. Horizontal overflow is a flex `min-width` bug until proven otherwise.

The sidebar stays viewport height and does not scroll away with the document. If the sidebar cannot fit on a short viewport, it may scroll internally. Mobile keeps the drawer; the fixed desktop layout is not forced below the `md` breakpoint.

### Guide editor

Desktop: a slim sticky application toolbar (about 56–64px) holds the guide title, Draft status pill, quiet save-state (`Saved` / `Unsaved changes` / `Saving…`), and Cancel / Save draft / Publish guide. The right column is the live patient timeline preview, sticky, with viewport-based max-height. Status and actions no longer live in a large preview-rail card.

Mobile/tablet: heading plus Draft/Saved state stay with the editor; the compact bottom action bar remains; patient-timeline preview is a collapsible section. There is no sticky horizontal toolbar that consumes phone height.

Timeline stages are an exclusive accordion (one open at a time). Add stage creates and opens the new stage. Collapse does not auto-save. Errors remain visible on the collapsed header as “Needs attention”.

The live preview reuses the presentational recovery timeline list used by the public patient renderer. It reflects the current unsaved editor state. Empty preview copy is quiet on the patient-preview surface. Public patient routes stay server-first.

The editor two-column grid is a **container query** on `.staffEditorPage` (`staff-editor`, `min-width: 56rem`). It must not use the viewport `lg` / `1024px` breakpoint, because the 16rem sidebar consumes width and would force a preview rail into an already-narrow main column. Below that content width the editor is one column with a collapsible patient-timeline preview.

Authenticated draft preview uses a staff toolbar outside `PatientPage`, including the same status pills and a preview-only appearance selector (Follow portal (Light/Dark/System) / Clinic default (System/Light/Dark) / Light / Dark). The default is Follow portal. That selector does not persist `ClinicProfile.themeMode`. The selected value resolves to one effective appearance for the **whole** preview: toolbar and patient document stay Light together or Dark together. Public tenant URLs never render that toolbar and still follow `ClinicProfile.themeMode` plus the patient device.

The patient renderer is wrapped in `PatientThemeBoundary` so clinic tokens and `color-scheme` can live on a scoped surface. Authenticated preview chrome uses the same resolved appearance; it does not stay on the portal theme while the document follows the selector. Portal appearance has no influence on a real public tenant page.

Cancel returns to `/guides`. Unsaved edits open a discard confirmation (Keep editing / Discard changes). Save draft does not change the public pinned revision. Publish asks for confirmation. Real clinics must also confirm a practice attestation checkbox. The server action is the security boundary; the checkbox is not. `demodental` keeps a confirmation dialog without fabricating attestation records.

Lifecycle destructive actions reuse the Guides-list domain actions from a compact **More actions** (`⋯`) control in the editor toolbar:

| Lifecycle                 | More actions                                      |
| ------------------------- | ------------------------------------------------- |
| Draft                     | Delete guide → `/guides`                          |
| Unpublished               | Delete guide → `/guides`                          |
| Published + draft changes | Discard draft changes; Unpublish guide            |
| Published, no draft       | Unpublish guide → stay in editor, public URL 404s |

Unpublish is not delete. It clears the public pin (`PracticeGuide.status = UNPUBLISHED`, `isEnabled = false`) and keeps the guide record, working draft, and published revision history until the clinic deletes it. Patients hitting the former public URL receive the tenant 404. Republish is a new snapshot. Deleting a practice guide never deletes canonical `GuideTemplate` / `GuideTemplateRevision` rows.

Destructive confirmations use the native `<dialog>` element with River Aftercare application chrome (not a browser/native alert look). One `ConfirmDialog` covers dirty cancel, publish, delete draft, discard draft changes, and unpublish.

### Practice

One route with internal sections: Members, Practice identity, Branding, Contact, Emergency / urgent help, Patient presentation.

Clinic ADMIN (and a platform operator assisting the clinic) can set **STAFF** memberships Active / Inactive from Members. Inactive is clinic-membership state only. Confirmation copy must not imply the River Aftercare account is deleted.

Header uses portal spacing (eyebrow / title / description, then ~2.25rem before the form). Desktop has a section index with consistent row height, hover/focus, and `aria-current` for the section in view (IntersectionObserver). Section-nav clicks smooth-scroll unless `prefers-reduced-motion: reduce`. Sections use `scroll-margin-top`.

Colour fields are one native colour control plus a hex input. Light primary/accent remain the default brand. Optional custom Dark branding (`useCustomDarkBranding` plus `darkPrimaryColor` / `darkAccentColor`) is an explicit toggle; both Dark colours are required when it is on. Turning it off leaves saved Dark values in place but the patient Dark theme keeps using Light brand colours with River Aftercare dark surfaces. Clinics do not force patient Light/Dark — `themeMode` in Patient presentation remains the default appearance (System / Light / Dark). The Branding section includes a preview-only Light/Dark switch that does not persist `themeMode` or the staff portal theme.

Optional Dark logo and favicon uploads reuse the clinic branding asset control (choose, then upload, cancel, confirm-remove). Favicon copy: shown in the browser tab for patient aftercare pages.

Patient tenant layouts emit `theme-color` from `generateViewport` using the clinic Light/Dark brand tokens (SYSTEM uses `prefers-color-scheme` media). Marketing, staff, login, and operator keep the River Aftercare favicon pack.

### Permissions

| Actor               | Portal                                                                            | Guides                                                 | Practice                                             | Operator      |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- | ------------- |
| Clinic `ADMIN`      | Yes                                                                               | Create, edit, save, publish, unpublish, delete/discard | Edit identity/branding/contact/members               | Not found     |
| Clinic `STAFF`      | Overview + Guides when membership `active`                                        | View + draft/public preview                            | Not found                                            | Not found     |
| Platform `OPERATOR` | All Clinics; **Manage clinic workspace** enters the clinic portal for that client | Same clinic-admin guide mutations while assisting      | Same clinic-admin Practice mutations while assisting | `/operator/*` |

The portal shell shows **Assisting** plus the clinic name and **Exit support** while an operator is in a client workspace. That indicator stays visible on Overview, Guides, Practice, and Account when the support context is active.

Inactive `ClinicMembership.active = false` does not grant portal access for that clinic, including direct URLs. Authorization helpers live in `lib/auth/clinic-authorization.ts`. Portal mutations still take `clinicId` from the authorized session context, never from the form. Operators are platform-global; they are not fabricated as clinic members.

## Guide lifecycle

Canonical template or custom guide → working draft (`PracticeGuideRevision` version 0) → authenticated preview at `/guides/[id]/preview` → explicit Publish copies an immutable snapshot → tenant URL serves that pin.

**First-client model (ADR 0026): clinic-supplied / clinic-approved.** River Aftercare is the publishing platform. The clinic supplies content and attests that the practice has reviewed it before patients see it. A River Aftercare reviewed canonical library is deferred. Attestation is practice confirmation of its review process. It is **not** River Aftercare clinical approval, and the attesting Clinic ADMIN is not recorded as the clinician.

- Explicit `GuideTemplate.isSample`. Sample templates are never enableable for ordinary real clinics, even if `reviewedAt` / `reviewedBy` are later populated. Demo tenant `demodental` may still use them.
- Normal clinics only see **reviewed non-sample** templates: `isSample = false` and the **latest** published revision itself has `reviewedAt` plus a named `reviewedBy` (not a demo/seed label). Availability and enablement pin that exact revision. Reviewed v1 + unreviewed v2 is not eligible.
- Original custom guides (`guideTemplateId` and `sourceGuideTemplateId` both null) remain supported and are the first-clinic path. On Essential or Practice they count toward the custom-guide allowance, including drafts and unpublished guides. A pinned River template does not count. Editing a pinned template forks a clinic-owned copy (`adaptedAt`, `sourceGuideTemplateId`) that counts toward a separate editable-template allowance and the combined clinic-owned ceiling. The copy does not consume a custom-guide place. Essential base is 2 original custom guides, 2 editable River Aftercare templates, 4 clinic-owned guides combined, and 2 team members. Practice base is 30 original custom guides, 30 editable River Aftercare templates, 40 clinic-owned guides combined, and 5 team members. Practice may mix the two guide categories up to 40, with neither category above 30. 30 custom and 10 edited, 20 custom and 20 edited, and 10 custom and 30 edited all fit. 30 custom and 30 edited does not, because combined usage would be 60. Group has no numeric cap. Legacy clinics are not given these caps. See [BILLING.md](BILLING.md).
- Every new published clinic revision for a real clinic stores `reviewAttestedAt` and `reviewAttestedByUserId`. Republish requires a fresh attestation. Prior published rows are not mutated. Demo publication does not write those fields.
- Clinic admin UI may show “Clinical review confirmed by {name} · {date/time}” after publication. Patient pages must not.
- A Practice → Essential downgrade is self-service for the clinic ADMIN on `/account/billing`. River checks team and guide readiness, the administrator chooses the keep-set when clinic-owned usage is above Essential, and Schedule downgrade applies at the next renewal. Keep Practice before that date releases the schedule. STAFF can see the status and cannot change the plan. The operator clinic page shows the same state and does not approve the change. Guides that are not kept become read-only for 60 days after the Essential price actually applies. They leave active capacity and the public clinic index. A guide that was already published keeps its direct patient URL until that deadline. Drafts stay private. Restore during the 60 days needs a free place on the current plan. Expired rows are not purged by a job. See [BILLING.md](BILLING.md).

The Tooth Extraction library row (`slug = extraction`) is **sample / non-clinical**. Guides → Create shows it only to `demodental`, labelled “Sample template”. Server-side enablement rejects every other clinic. Production inserts that row with `pnpm bootstrap:demo-template` (library rows only). Do not run `pnpm db:seed` in production.

`demodental` is reserved from ordinary operator clinic creation so a normal clinic cannot claim the demo tenant identity. It remains a real tenant hostname (not an infrastructure reserved slug).

Real-clinic published-guide pages, print, and authenticated draft preview render a platform-level **About this guide** disclaimer (`PatientAftercareDisclaimer`) after the guide body and before `PracticeContact`. Copy is fixed in application code. Practice name comes from `PracticeChrome.displayName`. The closing “contact the practice using the details below” sentence is included only when that surface actually renders a practice contact channel: web uses phone or contact URL; print uses phone or address. Address is not shown on the web guide. Emergency instructions are clinic-authored urgent copy, not a contact channel. This is not River Aftercare clinical review, not reviewer/attestation identity, and not `MedicalWebPage` / `reviewedBy`. Clinic-authored emergency instructions stay in `PracticeContact` / guide sections. `demodental` keeps its existing sample/not-clinical-advice chrome and does not receive this disclaimer. Tenant home does not show it. There is no configurable disclaimer database field.

See [ADR 0017](../adr/0017-clinic-owned-practice-revisions-pin-public-documents.md) and [ADR 0026](../adr/0026-first-client-clinic-supplied-governance.md).

### Draft delete and discard (Phase 2A.2)

| State                           | Destructive action                                                               |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Draft                           | **Delete guide** — removes the clinic guide after confirmation                   |
| Unpublished                     | **Delete guide** — removes the clinic guide and saved history after confirmation |
| Published + newer draft changes | **Discard draft changes** and **Unpublish guide**                                |
| Currently published             | **Unpublish guide** — public pin cleared; delete is offered only after unpublish |

STAFF never sees these actions. Server functions scope by session membership `clinicId`; cross-clinic delete/unpublish is impossible.

Templates already enabled show **Already in your guides** and cannot be duplicated.

## Generic guide dates

Public generic guides have no patient-specific treatment date. Timeline copy stays relative (`Day 0 · Procedure day`, period labels such as “Days 2–3”). Do **not** derive Day 0 from `Date.now()` or the browser calendar. Actual calendar dates require a future `RecoveryPlan.startedAt` / procedureDate. The interactive `demodental` demo may show a calendar caption only from an **explicit** `simulatedStartDate` fixture (`2026-09-10`) plus `simulatedDay: 1`.

## Logo

ADMIN can upload, replace, or remove a clinic logo when `CLINIC_ASSET_STORAGE_DRIVER` is `r2` (production), `filesystem` (local / Playwright), or `memory` (Vitest). Practice Identity uses a choose-then-upload control: **Choose logo** / **Choose replacement** selects a local file, **Upload logo** / **Upload replacement** persists it, and **Remove logo** asks for confirmation. STAFF cannot open Practice (404) and cannot call logo mutations. Production still needs Joaquín to set R2 env; the bucket stays private and is read through the Vercel `assets.` route — see [ADR 0022](../adr/0022-cloudflare-r2-is-clinic-asset-provider.md), [CLINIC-ASSETS.md](CLINIC-ASSETS.md), and [../launch/R2-PROVISIONING.md](../launch/R2-PROVISIONING.md). When storage is unconfigured, Practice shows the current mark and an explicit unavailable state.

## Operator console

The operator console is the River Aftercare operational control plane. Page identity is **PLATFORM / All Clinics**. Local seed identity may show **Demo Operator** as the account name; that is not a demo product.

Current destinations: **Clinics** and **SEO & Discovery**. Clinic detail includes a **Team** area at `/operator/clinics/[clinicId]/team` for operator-managed invitations. Canonical **Templates** management is the next operator-console capability and is not implemented here.

All Clinics may show real derived counts: total clinics, configured clinics, published guides, needs attention. No invented analytics.

Clinic table rows use a real practice link that covers the row for pointer users while remaining a semantic link.

## Clinic seats (provisional policy — not enforced)

Do not share one clinic login. Named membership accounts are required for accountability, revocation, ADMIN vs STAFF, and future audit.

| Plan      | Named users included |
| --------- | -------------------- |
| Essential | 2                    |
| Practice  | 5                    |
| Group     | custom               |

Current roles remain Clinic ADMIN and Clinic STAFF only. **Operator Team** remains the full provisioning surface: Operator → Clinics → Team → Invite user, plus role change, Active / Inactive, remove, and restore. Clinic ADMIN can invite an Administrator or Staff member from Practice → Members, using the same invitation service. Clinic STAFF cannot invite. Operators can change an active member's role (Administrator ↔ Staff), set STAFF memberships Active / Inactive, remove clinic access (User and password kept; sessions invalidated on remove), and restore a passworded zero-membership User without a new invitation. They cannot set another user's password. An assisting operator uses the same Practice invite control, authorized as a platform operator, and does not become a clinic member to do it. **Manage team** returns to operator Team. Seat-limit enforcement is not implemented. Clinic-admin resend, cancel, role change, and remove remain later portal work. See [AUTH.md](AUTH.md).

## Application architecture

Launch backend remains Next.js App Router + Server Actions + Prisma. See [APPLICATION.md](APPLICATION.md). NestJS is not part of MVP.

## Patient error and 404 fallbacks

If a published tenant page fails, patients see generic River Aftercare copy: the aftercare guide cannot load right now, please try again shortly. The error boundary does **not** query `ClinicProfile` or Neon to recover branding. When the tenant layout already rendered, clinic chrome from that layout may remain around the fallback. Unknown-tenant 404s stay practice-neutral. Nested unknown tenant paths (`/[guide]/…`) call `notFound()` so the same patient 404 renders. Staff/operator links are never included. Do not invent clinical or emergency instructions in these fallbacks.
