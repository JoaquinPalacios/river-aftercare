# Stripe billing and plan entitlement — architecture investigation

**Status:** Phase 5 schedules a Practice → Essential downgrade at the next renewal. Phase 4 enforces Essential and Practice product allowances. Phase 3 (Customer Portal, cancellation, payment-failure UX, public-guide retention, and operator Essential → Practice upgrade) stays as implemented. It is not deployed and it does not configure live Stripe. Phase 2 remains the paid-activation contract: card and AU BECS become `ACTIVE` only from `invoice.paid`. Sections A onward remain the historical investigation. **Approved Phase 1–5 decisions override stale recommendations below.** River Aftercare is not registering for GST at this stage. Do not configure Stripe Tax, GST line items, or GST price labels.

**Date:** 2026-09-20 (investigation). Phase 1 landed 2026-09-21. Phase 2 customer payment flow landed the same day. Local card and AU BECS acceptance passed 2026-09-22. Phase 3 landed 2026-09-22 in application code only.  
**Base:** investigation was written against `origin/main` at `2441d9a`.  
**This document is not tax, legal, or accounting advice.**

### Launch sales flow (Phase 2)

River Aftercare is not public self-service SaaS. Public `/pricing` stays Request a demo / Talk to us. There is no Buy now button and no anonymous Checkout.

```text
Request demo
→ operator-approved Clinic
→ agreed Essential or Practice + monthly or yearly
→ clinic ADMIN billing identity
→ Terms acceptance + Privacy acknowledgement
→ Stripe-hosted Checkout (card or AU BECS)
→ local PAYMENT_PENDING
→ invoice.paid
→ ACTIVE
→ onboarding
```

GROUP stays custom/manual. Phase 3 adds Customer Portal for payment methods, invoices, and cancellation at period end. It does not add self-serve plan switching, downgrades, interval changes, or refunds. Phase 4 enforces product allowances. It does not add per-seat billing.

### Phase 1 remains

- Official `stripe` Node SDK (`22.6.2`, default API `2026-08-26.dahlia`)
- Server-only test-mode config and Essential/Practice Price ID mapping
- `ClinicBillingProfile`, `ClinicEntitlement`, `StripeEventReceipt`
- Verified, idempotent `POST /api/stripe/webhook` on the staff host
- Local entitlement projection driven by `invoice.paid` (not Checkout completion)

### Phase 2 adds

- Operator commercial offer on the clinic detail page: Essential or Practice, monthly or yearly. Stored as `ClinicEntitlement` `PENDING` + `BillingStatus.OFFER_PREPARED`. GROUP is not selectable. The offer can be corrected until a Stripe subscription exists; an active subscription is not overwritten here.
- Clinic ADMIN routes on the staff host: `/account/billing/setup`, `/account/billing/complete`, `/account/billing`. STAFF cannot start Checkout. Operators do not impersonate customer Checkout.
- Billing identity on `ClinicBillingProfile` (legal name, contact, address, ABN or ACN). `ClinicProfile` stays patient-facing.
- Append-only `LegalAcceptance` (`termsVersion` `2026-09-21`, `privacyVersionAcknowledged` `2026-09-21`, source `BILLING_CHECKOUT`). No IP address or device fingerprint.
- One Stripe Customer per Clinic (`metadata.clinicId`), reused with a stable idempotency key. Hosted subscription Checkout uses the server Price ID, quantity 1, `client_reference_id` and subscription metadata `clinicId`, and `payment_method_types` `card` + `au_becs_debit`. Automatic tax is off.
- Success and cancel URLs do not activate entitlement. The complete page reads the local projection: active, payment processing, or a recovery/support state. Processing polls `GET /api/billing/status` (local state only).
- Activation gate: no `ClinicEntitlement` row means legacy access and is not blocked. A billing-onboarding clinic opens product routes only while entitlement is `ACTIVE`. `PENDING`, `RESTRICTED`, `ENDED`, and any later non-active state stay on billing recovery (`/account/billing`, setup, or payment status). Billing status does not grant product access. Operator support stays exempt. Phase 3 can later distinguish paid-customer restriction from this initial fail-closed gate.

### Phase 3

- Clinic ADMIN opens Stripe Customer Portal from `/account/billing`. STAFF cannot. Operator support mode cannot. The customer id comes from `ClinicBillingProfile`. The return URL is the staff origin plus `/account/billing`. Sessions use `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` and are refused unless that configuration allows invoices, payment-method updates, and cancel-at-period-end only.
- Cancellation scheduled keeps entitlement `ACTIVE` through `paidThrough`. Stripe Customer Portal may represent at-period-end cancellation as `cancel_at` (equal to the period end in the approved portal mode) with `cancel_at_period_end` still false. River normalizes either form into `cancelAtPeriodEnd`. `canceled_at` is the request time and is not the end date. Removing the schedule returns billing status to `ACTIVE`. `customer.subscription.deleted` sets `ENDED`, `subscriptionEndedAt`, and `publicGuideRetentionUntil` (existing 60-day rule).
- `PAST_DUE` keeps entitlement `ACTIVE`. Terminal `unpaid` becomes `RESTRICTED`. A delayed `invoice.payment_failed` does not move a live `active` subscription back to `PAST_DUE`. A stale `subscription.updated` does not reopen `ENDED` or `RESTRICTED`.
- Public guide retention is evaluated on the patient request. There is no cron. Legacy clinics and non-ended entitlements, including `RESTRICTED`, keep already-published guides. After `publicGuideRetentionUntil`, those URLs 404. Drafts stay unpublished.
- Operator-assisted Essential → Practice updates the existing subscription item. Proration is `always_invoice`. Payment behavior is `pending_if_incomplete`, so the Practice price is not current until Stripe accepts payment. The operator page refreshes from River’s local projection for about 30 seconds after Stripe accepts the change. It does not show Practice until that projection does. Practice → Essential is not scheduled in Phase 3. Monthly ↔ annual is not offered. The initial-offer form stays closed once a subscription exists and points at Plan change.
- No new Prisma migration in Phase 3. No new webhook event types. No new `LegalAcceptance` for portal, cancellation, or this upgrade. Stripe keeps invoice and dunning email. No GST / Stripe Tax.

### Phase 4 — plan allowances

Policy lives in `lib/entitlements/plan-policy.ts`. It is not read from marketing copy or Stripe Price metadata. Allowances apply only when `ClinicEntitlement.commercialPlan` is `ESSENTIAL` or `PRACTICE`. No entitlement row stays legacy-open: product access is not given Essential limits. `GROUP` and a null plan are not given Essential or Practice caps. Billing lifecycle is unchanged: limits apply to the current local plan while product access follows the existing activation gate (`ACTIVE`, including cancel-at-period-end and `PAST_DUE`).

Original custom guides and editable River-template copies are separate categories, and their sum has a combined clinic-owned ceiling. Pinned River templates used as supplied count in neither category. Effective category allowance is the plan base plus the matching persistent operator extra. Each custom or editable-template extra also adds one place to the combined ceiling. That combined extra is the sum of the two guide extras. It is not stored. Extras live on `ClinicEntitlement` (`extraTeamMemberAllowance`, `extraCustomGuideAllowance`, `extraTemplateAdaptationAllowance`). They default to 0, are not the computed total, and do not change Stripe, subscription quantity, Price, invoices, or `commercialPlan`.

|                              | Essential base | Practice base |
| ---------------------------- | -------------- | ------------- |
| Team members                 | 2              | 5             |
| Original custom guides       | 2              | 30            |
| Editable River templates     | 2              | 30            |
| Clinic-owned guides in total | 4              | 40            |

An Essential clinic may hold 2 original custom guides and 2 editable copies at the same time. A Practice clinic may mix the two categories up to 40 clinic-owned guides, with neither category above 30. Examples that fit Practice: 30 and 10, 20 and 20, 10 and 30. 31 of either category is blocked by that category. 25 and 16 is blocked by the combined ceiling. Operator extras add to the matching category and to the combined ceiling, and they survive a later Essential ↔ Practice projection change unless an operator changes them.

Occupied team places are active `ADMIN` and `STAFF` memberships plus one reservation per distinct user with a valid pending invitation. Inactive memberships, revoked, consumed, and expired tokens, and platform `OPERATOR` accounts do not count. Resend replaces the token and does not reserve a second place. Acceptance swaps the reservation for a membership under the same clinic capacity lock (`clinic-team-capacity:<clinicId>`). The effective team limit is the base plus `extraTeamMemberAllowance`. A clinic administrator and a platform operator are both blocked at that limit. There is no per-invitation override. Extra capacity is granted on the operator clinic page and logged as `operator_allowance_extra_updated` (operator user id, clinic id, dimension, previous extra, new extra, effective allowance).

Guide origin:

- As supplied: `guideTemplateId` set. Counts in neither clinic-owned category.
- Original custom: `guideTemplateId` and `sourceGuideTemplateId` both null. Counts toward the custom-guide allowance and the combined ceiling, including drafts, published guides, and unpublished guides that still exist.
- Adapted copy: `guideTemplateId` null, `sourceGuideTemplateId` set, `adaptedAt` set. Counts toward the editable-template allowance and the combined ceiling. Later edits do not consume another place and do not clear the source. Deleting the row frees that category and the combined place. Unpublishing does not.

Creating an original custom guide requires both a free custom-guide place and a free combined place. The first edit of a pinned River template requires both a free editable-template place and a free combined place. Both operations take `clinic-guide-capacity:<clinicId>` and re-check the category count and the combined count inside that lock. A custom create and a template adaptation competing for the last combined place cannot both succeed. Two requests for the last place in the same category cannot both succeed either.

Editing a pinned River template forks a clinic-owned copy before clinic-specific content is saved. The canonical `GuideTemplate` and its revisions stay unchanged. Essential and Practice may both fork while both limits remain. Group and legacy clinics keep in-place template editing and are not given this fork. There is no duplicate-guide flow; copying an adapted guide is out of scope.

A read-only production audit found one pinned Practice guide (Tooth Extraction), zero `PracticeGuideOverride` rows, and zero `PracticeGuideAddition` rows. Its revisions match the normal publish lifecycle. No adaptation backfill is required. The existing pin stays as supplied.

Clinics already above an effective allowance keep members, invitations, and guides. New capacity-increasing actions for that dimension stay blocked. Another dimension with remaining capacity stays available. Reducing an operator extra below current usage is allowed and does not delete anything. The operator UI warns before that save.

`loadEssentialDowngradeReadiness` reports `TEAM_MEMBERS`, `CUSTOM_GUIDES`, `TEMPLATE_ADAPTATIONS`, and `COMBINED_GUIDES` against Essential base plus the clinic’s current extras. The Essential combined target is 4 plus both guide extras. It does not discard extras. Downgrade-retained guides are excluded from those counts. Phase 5 uses this assessment before any Stripe schedule request. A team conflict still blocks scheduling. A guide conflict requires a confirmed keep-selection instead of pre-deletion.

Phase 4 uses one additive migration, `20260923120000_add_practice_guide_template_adaptation` (`PracticeGuide.adaptedAt`, `PracticeGuide.sourceGuideTemplateId`, and the three extra-allowance columns). Do not apply it to production from this change.

### Phase 5 — Practice → Essential at the next renewal

A clinic ADMIN schedules this from `/account/billing`. No operator approval is required. STAFF can see the current plan, a scheduled Essential change, and the effective date, and cannot begin, confirm, schedule, cancel a preparation, or keep Practice. Operator support mode is not customer consent. Portal plan switching stays off. The browser does not send a Stripe customer id, subscription id, price id, schedule id, attempt id, effective date, or plan. Those are read on the server. The customer action calls the same schedule service as the rest of Phase 5.

The operator clinic page shows the commercial plan, interval, Stripe linkage, paid-through date, preparation status, guide-selection counts, scheduled Essential date, retained-guide state, and billing diagnostics. It does not prepare, schedule, or reverse a normal Practice → Essential downgrade. Essential → Practice remains an operator upgrade on that page. A later self-service upgrade should call that existing subscription-update engine rather than a second Stripe implementation.

The change is not immediate. Practice stays the local `commercialPlan` through `paidThrough`. There is no refund, credit, invoice, proration, or billing-cycle reset at scheduling time. The interval stays the same: Practice monthly becomes Essential monthly, and Practice annual becomes Essential annual. Monthly ↔ annual is still not offered.

Stripe Node SDK `22.6.2` / API `2026-08-26.dahlia` uses Subscription Schedules. `subscriptionSchedules.create({ from_subscription })` cannot be combined with phases. River then `update`s two phases: the current Practice price through the item `current_period_end`, then one Essential interval (`duration.interval` `month` or `year`, not `iterations`). Both phases and the request use `proration_behavior: none`. The future phase uses `billing_cycle_anchor: automatic`. `phase_start` is not sent, because that resets the anchor. `end_behavior: release` lets the same subscription continue on Essential after that one Essential interval. The schedule is management state, not a second subscription. `subscriptionSchedules.cancel()` is not used.

Scheduling is allowed when the local plan is Practice, entitlement and billing are `ACTIVE`, a River subscription exists, cancellation is not already scheduled, and guide readiness is satisfied. Team usage above the effective Essential team allowance is still a hard block. The clinic administrator resolves that on Practice → Members (`/practice`). Guide usage above Essential is not a block. If current active clinic-owned guides already fit, they are all kept and no selection is required. If they do not fit, Change plan creates local preparation and the clinic ADMIN confirms which clinic-owned guides stay active. Schedule downgrade remains the separate final action. A confirmed keep-set that fits Essential custom, editable-template, and combined limits is enough to schedule, even when the clinic still has more Practice guides. `PAST_DUE`, ended, pending checkout, and an unknown existing schedule fail closed with no Stripe write. An unknown schedule is not released or overwritten. Selecting or confirming guides does not call Stripe. A failed schedule attempt does not clear a confirmed keep-set. A recoverable failure stays on the review so the administrator can retry. It does not ask them to wait for an operator. Cancel plan change stays available while that attempt is open. Missing local schedule columns are not treated as proof that Stripe is clear.

Each scheduling lifecycle has one River attempt id, `ClinicBillingProfile.stripePlanDowngradeAttemptId`. It is not a Stripe id and it is not shown to customers. Retries of the same unresolved attempt reuse it, including a create that succeeded before the phase update was confirmed. Keep Practice, Cancel plan change, a cancellation that supersedes the downgrade, a released/canceled/completed schedule event for that lifecycle, and the actual Practice → Essential price change retire it. The next Schedule downgrade allocates a new id. Concurrent schedule requests take `clinic-plan-downgrade:<clinicId>` and share one id.

Idempotency keys include that attempt id, so they stay stable for one attempt and change after Keep Practice:

- `river-plan-downgrade-create-{clinicId}-{subscriptionId}-{essentialPriceId}-{periodEnd}-{attemptId}`
- `river-plan-downgrade-update-{clinicId}-{subscriptionId}-{essentialPriceId}-{periodEnd}-{attemptId}`
- `river-plan-downgrade-release-{clinicId}-{subscriptionId}-{attemptId}`

`subscriptionSchedules.create({ from_subscription })` cannot send metadata. The schedule it creates is one Practice phase, metadata `{}`, and phase `proration_behavior` `create_prorations`. River classifies that attached shape as the current attempt’s intermediate schedule and updates it in place. It does not call create again while that schedule is attached. The update writes `riverDowngradeAttemptId` next to `clinicId` and `riverSchedulePurpose`, sets both phases to `proration_behavior: none`, and adds the Essential phase. `create_prorations` is not accepted after that update. Create and update response bodies are not treated as the final state. After the update, River retrieves the schedule and the subscription with no idempotency key. It persists the scheduled downgrade only when the live schedule is active, attached to that subscription, owned by this clinic and attempt, `end_behavior` is `release`, and the two phases are Practice then Essential with quantity 1, `proration_behavior: none`, and `billing_cycle_anchor: automatic` on the Essential phase. The subscription’s current price must still be Practice and `subscription.schedule` must be that schedule id. `plan_downgrade_scheduled` is logged only after that persist. A local scheduled projection is not trusted on its own: a repeat click re-reads Stripe. If the live subscription has no schedule, River clears the stale projection and keeps the confirmed keep-set, then continues with a new attempt. A partial create is retried by updating the attached single Practice phase for the same attempt instead of creating a second schedule.

Local projection, so pages do not read Stripe on each request:

- `ClinicBillingProfile.stripeSubscriptionScheduleId` — opaque id of the River schedule (`practice_to_essential` metadata, `clinicId`, and `riverDowngradeAttemptId`). Not shown in clinic UI.
- `ClinicBillingProfile.stripePlanDowngradeAttemptId` — River id for the open scheduling lifecycle. Not a Stripe id and not shown in clinic UI.
- `ClinicEntitlement.scheduledCommercialPlan` and `scheduledPlanEffectiveAt` — target Essential and the current period end.

`cancelAtPeriodEnd` is not reused. `commercialPlan` becomes Essential only when a trusted `invoice.paid`, `invoice.payment_failed`, or `customer.subscription.updated` projection sees the Essential Price. That clears the scheduled fields. The schedule id stays until `subscription_schedule.released`, `.completed`, or `.canceled`, so a later cancellation can still be reconciled. Operator extras are not cleared and nothing is deleted at scheduling time.

Guide selection is a separate local aggregate, `ClinicDowngradePreparation` plus `DowngradeGuideSelection` rows. There is at most one preparation per clinic. The clinic ADMIN confirms PracticeGuide ids. STAFF cannot. Operator support mode is not customer consent. The operator can see counts and does not choose the guides or start the preparation. The customer may replace the keep-set until the Essential price applies. Guides created after confirmation are not kept unless the administrator adds them. Deleting a selected guide removes that selection row. Practice limits stay in force until the price changes.

When the trusted projection moves Practice to Essential, River takes `clinic-guide-capacity` and retains every active clinic-owned guide that is not in the confirmed keep-set. Selected guides stay active, including their draft or published state. Pinned River templates are unchanged. Retention starts at the Stripe event time, not when the downgrade was prepared or scheduled. `downgradeRetainedAt` and `downgradeRetentionUntil` are that time and that time plus 60 UTC days. A replay does not move them. If the confirmed set is unexpectedly over the Essential limits, selected guides stay active, non-selected guides are still retained, and River logs `downgrade_retention_selection_invalid`. No guide is hard-deleted.

Retained guides are omitted from active capacity, the clinic guide index, and the public clinic listing. A published retained guide keeps its existing patient URL until `downgradeRetentionUntil`, and only while clinic-level public-guide access also allows it. The shorter window wins. A draft or unpublished retained guide stays private. After `downgradeRetentionUntil` the direct URL stops and normal clinic restore fails. There is no purge job. Physical deletion is a later cleanup task.

A clinic ADMIN can restore one retained guide during the 60 days when the current plan has a free place in that guide’s category and in the combined ceiling. Restore uses the same capacity lock. Provenance does not change. Keep Practice and a cancellation that supersedes the downgrade delete the preparation and do not retain guides. Subscription-end retention stays on `publicGuideRetentionUntil` and is not mixed with this clock.

While a downgrade is only being prepared, an operator extra reduction that makes a confirmed keep-set too large marks that selection unconfirmed. While the downgrade is already scheduled, that reduction is rejected until the selection is changed or the downgrade is removed. The same scheduled block applies when usage already fitted and no keep-set exists, if the reduction would push current clinic-owned guides over Essential. Increasing extras does not call Stripe.

Keep Practice and Cancel plan change share one release check. Both call `subscriptionSchedules.release({ preserve_cancel_date: false })` with the attempt’s release key, then retrieve the schedule and the subscription. The local schedule, the attempt id, and the downgrade preparation are deleted only after the live schedule is `released`, `released_subscription` is this subscription, and `subscription.schedule` is null. No guide is retained. Cancel plan change uses that release when the attached schedule classifies as this attempt, including the one-phase `from_subscription` copy with empty metadata. A preparation with no attached schedule is deleted locally and the attempt id is retired, with no release call. A stale local projection is reconciled the same way once the fresh subscription has no schedule, and the preparation is then deleted because the customer abandoned the change. A failed release leaves the preparation, confirmed keep-set, and attempt id in place. An attached schedule that does not classify as this attempt is not released, and the keep-set stays. A stale schedule id that Keep Practice did not validate for the current attempt still clears only the billing projection and leaves the confirmed keep-set in place.

Cancellation wins. Scheduling is blocked when cancellation is already set. If the customer later schedules cancellation:

- When `cancel_at` or `cancel_at_period_end` is already on the subscription, River releases the schedule with `preserve_cancel_date: true`. The subscription still ends at the paid-period boundary.
- When the schedule’s `end_behavior` becomes `cancel` while the current phase is still Practice and a future phase is Essential, River updates that schedule to the current Practice phase only, with `end_behavior: cancel` and `proration_behavior: none`. It does not release in that case: Stripe does not copy the cancel date onto the subscription until the final phase.

Undoing cancellation does not recreate the Essential phase. If a collapsed schedule is still attached, River releases it with `preserve_cancel_date: false` so the subscription continues as Practice.

Webhook events added: `subscription_schedule.updated`, `.released`, `.completed`, `.canceled`. Receipts stay idempotent. Payloads are not stored. A failed Essential renewal uses the existing past-due / unpaid policy: once the Price is Essential, the local plan is Essential during retries (`ACTIVE` + `PAST_DUE`), and terminal `unpaid` still restricts authoring. No second lifecycle.

Migration `20260923200000_add_scheduled_plan_downgrade` is additive and must not be rewritten. Migration `20260923220000_add_downgrade_guide_selection` adds preparation, keep-selection rows, and the guide retention timestamps. Migration `20260924010000_add_plan_downgrade_attempt` adds `stripePlanDowngradeAttemptId`. Do not apply these migrations to production from this change. Do not change live Stripe configuration. The schedule action does not depend on a webhook arriving before it reports success. Webhooks still project later changes, and they retire the attempt id when that lifecycle has ended.

### Not yet present

- Monthly ↔ annual interval changes
- Per-seat billing, extra-seat prices, or subscription quantities
- Self-service Essential → Practice upgrade, monthly ↔ annual changes, refunds, coupons, trials, Group Stripe prices, Group fixed caps
- Production / live Stripe configuration
- Live payments
- GST / Stripe Tax (not in scope: River Aftercare is not registering for GST at this stage)

### Superseded investigation recommendations

Treat the rest of this file as context. Do not re-introduce these stale recommendations:

| Topic                   | Investigation said                                    | Current approved decision                                                                                                             |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GST                     | Manual inclusive 10% GST / Tax Invoice extras         | Not registering for GST at this stage. Do not charge GST, configure Stripe Tax, or label public prices as including or excluding GST. |
| Public retention        | 30 days aligned to Terms export                       | **Up to 60 days** after the paid subscription ends. Phase 3 checks this on each public request.                                       |
| Past-due entitlement    | `GRACE`                                               | Keep **ACTIVE** entitlement while Stripe is retrying (`past_due`).                                                                    |
| Essential → Practice    | Prefer period-end                                     | **Immediate**, proration may apply, once payment state allows.                                                                        |
| Portal cancel           | Undecided                                             | Phase 3 enables it, **at period end only**. Do not enable Portal plan switching.                                                      |
| Enums                   | Richer `GRACE` / `PUBLIC_RETENTION` / `CHECKOUT_OPEN` | Phase 1 uses `BillingStatus` + `EntitlementStatus` as implemented in Prisma.                                                          |
| Invoice table           | Optional `StripeInvoiceRef`                           | **Not added.** Stripe remains the invoice system of record.                                                                           |
| Implementation sequence | Domain before Stripe package                          | Phase 1 ships domain + webhook together, still without Checkout.                                                                      |

Public `/pricing` stays assisted-sales (`Request a demo` / `Talk to us`). Do not change it to Buy now. Do not create live Stripe objects from this note.

Operator TEST MODE catalogue steps: [`docs/launch/STRIPE-SETUP.md`](../launch/STRIPE-SETUP.md).

Related: [`lib/marketing/plans.ts`](../../lib/marketing/plans.ts) (canonical advertised amounts), [CLINIC-PORTAL.md](CLINIC-PORTAL.md), [APPLICATION.md](APPLICATION.md), [AUTH.md](AUTH.md), [TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md), [PRODUCTION-MIGRATION.md](../launch/PRODUCTION-MIGRATION.md), [LEGAL-REQUIREMENTS.md](../launch/LEGAL-REQUIREMENTS.md), ADR [0016](../adr/0016-platform-operator-is-distinct-from-clinic-admin.md), [0017](../adr/0017-clinic-owned-practice-revisions-pin-public-documents.md), [0024](../adr/0024-account-lifecycle-tokens-and-shared-transactional-email.md), [0025](../adr/0025-migrate-before-promote.md).

---

## A. Current River architecture

### A.1 Tenancy and hosts

Hostname tenancy ([ADR 0003](../adr/0003-tenant-identity-uses-hostname.md), [ADR 0012](../adr/0012-apex-host-is-the-public-marketing-face.md)):

| Host                           | Kind      | Surface                                                            |
| ------------------------------ | --------- | ------------------------------------------------------------------ |
| Apex / `riveraftercare.com.au` | marketing | `/`, `/pricing`, `/contact`, legal pages. **All `/api/*` 404.**    |
| `app.<root>`                   | staff     | Clinic portal, operator, **`/api/*`**. Retired chairside URLs 404. |
| `<slug>.<root>`                | tenant    | Patient aftercare only.                                            |
| `assets.<root>`                | reserved  | Clinic branding + platform SEO assets.                             |

Routing: [`proxy.ts`](../../proxy.ts) (Next.js 16 Node proxy, not Edge). Staff host allows all paths through. Marketing 404s `/api/*` via `isMarketingBlockedPath`. A Stripe webhook **must** be posted to the staff origin, for example `https://app.riveraftercare.com.au/api/stripe/webhook`.

`Clinic` is the commercial account. Billing identity stays on `ClinicBillingProfile`. Public tenant identity is `ClinicSite.slug`. Branding is read from that site. Phone, address, and emergency instructions are read from the site’s root `ClinicLocation`. Patient guides resolve through the root `PracticeGuidePlacement`. `Clinic.slug` and `ClinicProfile` stay synchronized for rollback. There is no site or location management UI, and billing does not use site or location rows.

### A.2 Prisma domain (relevant)

Canonical schema: [`prisma/schema.prisma`](../../prisma/schema.prisma). PostgreSQL 18, Prisma 7.10 (`PrismaPg` + `pg`). Migrations are timestamped SQL under `prisma/migrations/`. Production apply is human-approved `pnpm prod:db:migrate --apply` via `DIRECT_URL`, then same-SHA redeploy ([ADR 0025](../adr/0025-migrate-before-promote.md)). Vercel never runs `migrate deploy`.

**Clinic / users / roles**

| Model              | Role today                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Clinic`           | Commercial account. `id`, `name`, `slug`. **No plan, status, or billing fields.** `slug` is compatibility data. Owns sites and the guide library.                             |
| `ClinicSite`       | Authoritative public identity. `slug` is the tenant hostname. Branding is read from here. One primary site exists per current account. `isPrimary` does not own the hostname. |
| `ClinicLocation`   | Physical practice belonging to a `ClinicSite`. The current product reads the one active root location (`slug` null, `servesSiteRoot`).                                        |
| `ClinicProfile`    | Legacy patient chrome kept in sync with the primary site and root location. Not the patient read source. Not a legal/billing identity.                                        |
| `User`             | Auth.js user + `platformRole` (`NONE` \| `OPERATOR`) + optional `passwordHash`.                                                                                               |
| `ClinicMembership` | Exactly one membership per user in the current auth resolver. Roles `ADMIN` \| `STAFF`.                                                                                       |
| `AccountToken`     | Invitations and password reset. Hash-only.                                                                                                                                    |

There is **no account-owner entity**. “Ownership” is clinic `ADMIN` membership. Operators (`platformRole=OPERATOR`) are platform-scoped and typically have **no** clinic membership ([ADR 0016](../adr/0016-platform-operator-is-distinct-from-clinic-admin.md)).

**Guides**

| Model                                             | Role today                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GuideTemplate` / `GuideTemplateRevision`         | Canonical River library. Never mutated by clinic editing.                                                                                                                                                                           |
| `PracticeGuide`                                   | Clinic-enabled guide. Template-backed: `guideTemplateId` + `pinnedRevisionId`. Custom: both null. Unique `(clinicId, guideTemplateId)`.                                                                                             |
| `PracticeGuideRevision`                           | Version 0 = mutable draft. Versions 1+ = immutable published snapshots. The root placement pin selects the exact public clinic revision when set ([ADR 0017](../adr/0017-clinic-owned-practice-revisions-pin-public-documents.md)). |
| `PracticeGuidePlacement`                          | Authoritative patient publication for one location. Root placement `publicSlug`, `isEnabled`, and optional clinic-revision pin. Null pin keeps the canonical template fallback.                                                     |
| `PracticeGuideOverride` / `PracticeGuideAddition` | Legacy composition. Current editor writes clinic revisions, not these tables.                                                                                                                                                       |
| `PracticeSectionProvenance`                       | `CANONICAL` \| `PRACTICE_OVERRIDE` \| `PRACTICE_ADDITION` \| `PRACTICE_CUSTOM`.                                                                                                                                                     |

Guide lifecycle: `PracticeGuideStatus` = `DRAFT` \| `PUBLISHED` \| `UNPUBLISHED` plus `isEnabled`. Public patient visibility also requires an enabled root placement. A placement pin serves that revision. A null pin serves the published canonical template pin.

**No** `Plan`, `Subscription`, `BillingProfile`, `Location`, `AuditLog`, or Stripe ID fields exist.

### A.3 Authentication and auth boundaries

| Piece                                                               | Path                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Auth.js v5 (Prisma adapter, empty providers; custom password login) | [`auth.ts`](../../auth.ts)                                                                         |
| Session helpers                                                     | [`lib/auth/session.ts`](../../lib/auth/session.ts)                                                 |
| Guards                                                              | `requireStaffSession`, `requireClinicAdmin`, `requirePlatformOperator`, `requireAuthenticatedUser` |
| Login / logout / reset / invitation                                 | `app/api/auth/*` route handlers on the staff host                                                  |

Clinic mutations: authenticate → membership → `ADMIN` → `clinicId` from session, never from the client. Operator mutations: `requirePlatformOperator()`; clinic id comes from the operator route, not impersonation.

| Action                                  | Clinic ADMIN | Clinic STAFF | OPERATOR                  |
| --------------------------------------- | ------------ | ------------ | ------------------------- |
| View portal / guides / preview          | yes          | yes          | no (unless also a member) |
| Create / edit / publish / delete guides | yes          | no           | no                        |
| Practice settings / logo                | yes          | no           | no                        |
| Create clinic / invite team / SEO       | no           | no           | yes                       |
| Billing (today)                         | none         | none         | none                      |

### A.4 Clinic and operator onboarding

| Flow              | Who                 | Code                                                                                                                                                                                                                                                                |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create clinic     | OPERATOR            | [`lib/operator/create-operator-clinic.ts`](../../lib/operator/create-operator-clinic.ts) → `Clinic` + `ClinicProfile` + primary `ClinicSite` + root `ClinicLocation` in one transaction. UI: `/operator/clinics/new`. Patient reads use the site and root location. |
| Invite users      | OPERATOR            | [`lib/operator/invite-clinic-user.ts`](../../lib/operator/invite-clinic-user.ts) + [`lib/auth/account-token-service.ts`](../../lib/auth/account-token-service.ts). Email via Resend.                                                                                |
| Accept invite     | Invitee             | `/accept-invitation` + `POST /api/auth/accept-invitation`                                                                                                                                                                                                           |
| Practice branding | Clinic ADMIN        | `/practice` → [`update-practice-settings.ts`](../../lib/clinic-portal/update-practice-settings.ts)                                                                                                                                                                  |
| Setup checklist   | Derived, not stored | [`setup-status.ts`](../../lib/clinic-portal/setup-status.ts): identity, branding, contact, emergency, published guide → `configured` \| `needs_attention`                                                                                                           |

Marketing “onboarding steps” in `plans.ts` are copy only.

### A.5 Custom guides vs River templates

[`create-practice-guide.ts`](../../lib/clinic-portal/create-practice-guide.ts):

- **Custom:** `createCustomPracticeGuide` — `guideTemplateId` null, starter `PRACTICE_CUSTOM` section. **No count limit.**
- **From template:** `createPracticeGuideFromTemplate` — copies the published canonical revision into clinic draft version 0, **keeps `guideTemplateId` + `pinnedRevisionId`**. Rejects a second enable of the same template. **Does not write to `GuideTemplate`.**

[`save-practice-guide-draft.ts`](../../lib/clinic-portal/save-practice-guide-draft.ts) allows full section editing for both kinds. On a template-backed guide, edited canonical sections become `PRACTICE_OVERRIDE`. The editor is **role-gated, not plan-gated**. Any clinic can currently start from a River template and adapt the clinic copy.

Published patient URLs are durable clinic snapshots. Unpublish 404s the tenant URL but keeps history until delete.

### A.6 Operator / clinic UI today

Operator (`/operator/clinics`, `/operator/clinics/[clinicId]`, Team, SEO): clinic identity, branding snapshot, team invitations. **No billing section.**

Clinic portal: Overview, Guides, Practice (ADMIN). Account today is **Account security** only (`/account/security`). No Billing page.

### A.7 Marketing plans

[`lib/marketing/plans.ts`](../../lib/marketing/plans.ts) is the **canonical advertised-price source**. JSON-LD Offers on `/pricing` read from it. Public CTAs remain `/contact`. Additional-location rates are internal comments only. Group is custom pricing copy, not a product.

### A.8 Environment, email, jobs, audit, Stripe

| Concern         | Current truth                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Env             | [`.env.example`](../../.env.example); Vercel injects Production/Preview secrets. Server-only secrets are never `NEXT_PUBLIC_*`.                                                                                                                                                                 |
| Email           | Resend via [`transactional-mailer.ts`](../../lib/email/transactional-mailer.ts). Contact vs auth identities stay separate ([TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md)).                                                                                                                   |
| Background jobs | **None.** No Inngest, queues, or Vercel cron.                                                                                                                                                                                                                                                   |
| Audit log       | **None.** The legacy chairside `ProcedureSessionStageTransition` table was removed with the chairside schema. The application does not write an audit log.                                                                                                                                      |
| Stripe          | **Absent.** No `stripe` package. Privacy copy currently says manual invoicing and that customers do not provide cards through the Service.                                                                                                                                                      |
| Observability   | Sentry via `@sentry/nextjs` for production/preview exceptions. Session Replay off. [`sensitive-value-sanitizer.ts`](../../lib/observability/sensitive-value-sanitizer.ts) redacts secrets/emails/tokens; extend it for `sk_`, `rk_`, `whsec_`, Stripe IDs in logs. Uptime remains Better Stack. |
| Runtime         | Next.js 16.3.5 App Router monolith on Vercel. Node 24 LTS.                                                                                                                                                                                                                                      |

### A.9 Legal / commercial stance today

Published Terms ([`lib/legal/terms.ts`](../../lib/legal/terms.ts)): AUD, GST where applicable, **monthly in advance**, payment due **14 days** after invoice, **bank transfer / manual invoice**, month-to-month, cancel at period end, overdue suspension **after notice and not automatic**, 30-day export after termination then possible unpublish/delete.

Published Privacy: operator is **Pedro Joaquin Palacios**, sole trader trading as River Aftercare, **ABN 32 671 297 130**, Tweed Heads South NSW. **GST:** not registering at this stage ([LEGAL-REQUIREMENTS.md](../launch/LEGAL-REQUIREMENTS.md)). Subprocessors named today: Vercel, Neon, Cloudflare, Resend, Hostinger, Google — **not Stripe**.

Counsel-approval flags remain `false`.

---

## B. Current gaps

| Gap                                | Detail                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No plan field                      | Essential vs Practice vs Group is marketing copy only.                                                                                                                                    |
| No guide limits                    | 2 / 30 custom-guide caps are not enforced.                                                                                                                                                |
| No template-adaptation entitlement | Any ADMIN can edit a template-backed clinic guide into clinic-specific content.                                                                                                           |
| Template enablement ≠ custom       | Template-backed guides keep `guideTemplateId` even after `PRACTICE_OVERRIDE` edits, so “custom guide count” cannot be derived from current rows without a new rule.                       |
| No billing identity                | `ClinicProfile` is patient chrome. No legal name, ABN, billing email, or billing address domain.                                                                                          |
| No Stripe customer/subscription    | No IDs, no projection, no webhook route.                                                                                                                                                  |
| No invoice access in-app           | No Account → Billing, no Customer Portal.                                                                                                                                                 |
| No payment lifecycle               | Clinic has no status. Setup is a derived checklist.                                                                                                                                       |
| Terms/Privacy mismatch             | Live Stripe Checkout would contradict “14-day bank transfer” and “does not require card details through the Service”. Must be updated **before live mode**, not as a side effect of code. |
| No jobs / audit                    | Webhook processing and operator reconciliation must be designed without a queue or AuditLog product.                                                                                      |
| Webhook host                       | Apex cannot receive Stripe webhooks. Staff host can.                                                                                                                                      |
| Group / locations                  | No domain. Do not encode additional-location prices.                                                                                                                                      |

---

## C. Recommended architecture

### C.1 Source-of-truth boundaries

```text
                    ┌─────────────────────────────────────────┐
                    │  Stripe (financial source of truth)      │
                    │  Customer, Subscription, Price, Invoice, │
                    │  PaymentIntent, mandate, tax on invoice  │
                    └───────────────┬─────────────────────────┘
                                    │ webhooks + on-demand retrieve
                                    ▼
┌──────────────┐   1:1    ┌─────────────────────┐  1:1   ┌──────────────────────┐
│ Clinic       │─────────▶│ ClinicBillingProfile│───────▶│ Stripe Customer      │
│ (tenant)     │          │ legal/ABN/address   │        │ cus_…                │
│              │          │ stripeCustomerId    │        └──────────────────────┘
│              │          └─────────────────────┘
│              │   1:1    ┌─────────────────────┐  0..1  ┌──────────────────────┐
│              │─────────▶│ ClinicEntitlement   │───────▶│ Stripe Subscription  │
│              │          │ plan, interval,     │        │ sub_… + price_…      │
│              │          │ billingStatus,      │        └──────────────────────┘
│              │          │ entitlementStatus,  │
│              │          │ paidThrough         │
└──────────────┘          └──────────┬──────────┘
                                     │
                                     ▼
                          Fast authorisation in River
                          (never a live Stripe API call
                           on a patient or editor request)
```

| Truth                                                            | Owner                                     | River may cache?                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Advertised GST-inclusive prices                                  | `PLAN_PRICES` in `lib/marketing/plans.ts` | Stripe Price amounts must match; marketing must not read Stripe.                               |
| Money movement, invoices, PDFs, payment methods, dunning retries | Stripe                                    | Cache IDs, status, period end, hosted invoice URL. Never PAN/BSB/account numbers or PDF blobs. |
| Operator-approved commercial plan + interval                     | River `ClinicEntitlement`                 | Stripe Price is created from this mapping, not the reverse, except as a verification check.    |
| What staff/patients are allowed to do                            | River `entitlementStatus` + plan rules    | Derived from Stripe + River policy, then persisted.                                            |
| Patient-facing clinic brand                                      | `ClinicProfile`                           | Do not reuse as tax-invoice identity.                                                          |
| Legal/billing identity                                           | `ClinicBillingProfile`                    | Copied onto Stripe Customer at create/update.                                                  |

Do **not** authorise guide create/edit/publish by calling Stripe on the request path. Do **not** put plan solely as a column on `Clinic` (future Group / multi-location billing would then have nowhere to go). Do **not** invent an Organisation/Location hierarchy in the first implementation.

At launch: **one Clinic = one billing profile = one Stripe Customer = at most one River-managed subscription.**

### C.2 High-level commercial flow (unchanged marketing)

```text
Clinic contacts River → demo/sales → agree plan + interval
  → operator creates Clinic + invites ADMIN
  → operator records billing identity
  → operator starts Checkout (server-side Session)
  → clinic ADMIN pays on Stripe-hosted Checkout (card / wallets / BECS)
  → webhooks project billing + entitlement
  → Account → Billing shows River projection + “Manage billing” (Customer Portal)
  → Stripe emails invoices/receipts
```

---

## D. Proposed database / domain model

Investigation only — **do not migrate**. Fields follow existing Prisma conventions (`cuid`, `createdAt`/`updatedAt`, both relation sides, indexes).

### D.1 Enums

```prisma
enum CommercialPlan {
  ESSENTIAL
  PRACTICE
  GROUP
}

enum BillingInterval {
  MONTHLY
  YEARLY
}

/// Financial projection. Not a 1:1 copy of every Stripe subscription.status.
enum BillingStatus {
  NONE
  CHECKOUT_OPEN
  PAYMENT_PENDING
  ACTIVE
  PAST_DUE
  UNPAID
  CANCELED_AT_PERIOD_END
  ENDED
  REQUIRES_ACTION
}

/// What River currently allows. Policy sits here, not in Stripe.
enum EntitlementStatus {
  INACTIVE
  PENDING_ACTIVATION
  ACTIVE
  GRACE
  AUTHORING_RESTRICTED
  PUBLIC_RETENTION
  TERMINATED
}
```

`GROUP` is a first-class commercial label so operator tooling can record “this is a manually scoped clinic”. It must **not** imply a standardised Stripe product. Group entitlements are operator-set (`customGuideLimit`, `canAdaptTemplates`) with `stripeSubscriptionId` optional.

### D.2 Models

```prisma
/// Legal/tax identity. Separate from ClinicProfile (patient chrome).
model ClinicBillingProfile {
  clinicId           String   @id
  legalName          String
  tradingName        String?
  abn                String?
  billingEmail       String
  billingContactName String?
  addressLine1       String?
  addressLine2       String?
  city               String?
  region             String?
  postalCode         String?
  country            String   @default("AU")
  stripeCustomerId   String?  @unique
  clinic             Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

/// Local projection used for authorisation and operator visibility.
model ClinicEntitlement {
  clinicId             String            @id
  commercialPlan       CommercialPlan
  billingInterval      BillingInterval?
  billingStatus        BillingStatus     @default(NONE)
  entitlementStatus    EntitlementStatus @default(INACTIVE)
  customGuideLimit     Int
  canAdaptTemplates    Boolean
  stripeSubscriptionId String?           @unique
  stripePriceId        String?
  checkoutSessionId    String?           @unique
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean           @default(false)
  paidThrough          DateTime?
  publicRetentionUntil DateTime?
  lastStripeSyncAt     DateTime?
  clinic               Clinic            @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  @@index([billingStatus])
  @@index([entitlementStatus])
}

/// Idempotency for webhook deliveries. Stripe event.id is globally unique.
model StripeEventReceipt {
  id            String   @id @default(cuid())
  stripeEventId String   @unique
  type          String
  processedAt   DateTime @default(now())

  @@index([type, processedAt])
}

/// Optional thin invoice index for Account → Billing. Stripe remains the document store.
model StripeInvoiceRef {
  id               String   @id @default(cuid())
  clinicId         String
  stripeInvoiceId  String   @unique
  hostedInvoiceUrl String?
  invoicePdfUrl    String?
  status           String
  amountPaid       Int?
  currency         String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  clinic           Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@index([clinicId, createdAt])
}
```

Add `Clinic.billingProfile`, `Clinic.entitlement`, `Clinic.stripeInvoiceRefs`.

**Canonical vs cached**

| Field                                                                        | Canonical?                                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `commercialPlan`, `billingInterval`, `customGuideLimit`, `canAdaptTemplates` | River canonical (operator-approved). Stripe Price must be a mapped consequence.                    |
| Billing identity fields                                                      | River canonical for “who we intend to bill”; Stripe Customer is the billed copy.                   |
| `stripeCustomerId` / `stripeSubscriptionId` / `stripePriceId` / invoice IDs  | Cached identifiers. Stripe owns the objects.                                                       |
| `billingStatus`, period/paid-through, `cancelAtPeriodEnd`                    | Cached projection. Refresh by retrieving the Subscription, not by trusting a single event payload. |
| `entitlementStatus`, `publicRetentionUntil`                                  | River canonical policy output.                                                                     |

Do **not** store card numbers, BSB, account numbers, mandate text, or invoice PDF bytes.

### D.3 Guide provenance addition (later enforcement phase, not billing launch)

Phase 4 replaced the recommendation in this section. An edited River template counts toward the editable-template allowance and the combined clinic-owned ceiling. It does not consume the custom-guide allowance. Essential base is 2 custom / 2 editable / 4 combined. Practice base is 30 custom / 30 editable / 40 combined. Practice cannot hold 60 clinic-owned guides. The paragraphs below are the earlier investigation.

Today an “adapted template” is still template-backed (`guideTemplateId` set). The commercial rule wants an adapted River template to **become a clinic-owned custom guide** and count toward the allowance.

When enforcement is built, add:

```prisma
// on PracticeGuide
adaptedAt            DateTime?
sourceGuideTemplateId String?
```

**Adapt action (Practice only):** keep clinic revisions as the document of record; clear `guideTemplateId` + `pinnedRevisionId` so the row is custom; set `sourceGuideTemplateId` + `adaptedAt` for provenance. Canonical `GuideTemplate` is never mutated (already true).

Count custom guides as `guideTemplateId IS NULL` (includes born-custom and adapted). As-supplied template enables (`guideTemplateId` set, `adaptedAt` null) do **not** count.

Do not add these columns in the first billing-identity migration unless enforcement ships in the same change. Prefer a later additive migration with the enforcement phase.

---

## E. Stripe catalogue

### E.1 Products and Prices

Follow Stripe’s catalogue rule: **one Product per plan the customer can choose**; monthly/yearly are Prices on that Product.

| Stripe Product            | Monthly Price                   | Yearly Price                    |
| ------------------------- | ------------------------------- | ------------------------------- |
| River Aftercare Essential | AUD 7900 cents, interval month  | AUD 79000 cents, interval year  |
| River Aftercare Practice  | AUD 14900 cents, interval month | AUD 149000 cents, interval year |

All `tax_behavior: inclusive`. Currency `aud`. Nickname the Prices clearly (`essential_monthly`, etc.). Group is **not** a Stripe Product at launch.

**Do not create additional-site or additional-location Prices now.** Site and location capacity is enforced in the product. Stripe add-on charging is not. Both allowances are account totals. A missing entitlement is 1 site and 1 location, never unlimited. Essential is always 1/1. Practice is always one site; the operator may raise the location allowance. Group capacity is operator-configured. Approved direction, not a Stripe Price and not public copy: A$449/month includes 2 ClinicSites and 5 total Locations. A later site bundle is +A$50/month and grants both +1 site allowance and +1 location allowance. Annual Group pricing and standalone extra-location pricing are not decided. Public copy still does not advertise multi-location rates. When location billing is built, prefer **subscription items / extra Prices on a later add-on Product**, not quantity on the Practice Price (Practice quantity would imply N copies of the whole plan).

### E.2 Price ID mapping

Store test and live Price IDs in **server-only environment variables**, not in the database and never `NEXT_PUBLIC_*`.

```text
STRIPE_SECRET_KEY                  # restricted key rk_test_ / rk_live_
STRIPE_WEBHOOK_SECRET              # whsec_… per endpoint (test vs live)
STRIPE_PRICE_ESSENTIAL_MONTHLY
STRIPE_PRICE_ESSENTIAL_YEARLY
STRIPE_PRICE_PRACTICE_MONTHLY
STRIPE_PRICE_PRACTICE_YEARLY
```

Vercel **Preview** = test-mode keys and test Price IDs. Vercel **Production** = live-mode keys and live Price IDs. Never mix.

River mapping is a closed server table: env Price ID → `{ commercialPlan, billingInterval, expectedAmountCents }` checked against `PLAN_PRICES`. Checkout Sessions are created only from operator-selected plan+interval after that lookup. Incoming webhooks resolve `stripePriceId` through the **same** map; unknown Price IDs are a hard error (alert operator, do not grant entitlements).

Clients never send Price IDs. Operators never paste Price IDs into clinic UI.

### E.3 GST strategy (Australian-only launch)

**Recommend Option A: a single manual 10% inclusive Australian GST tax rate**, applied as the default on both Products / subscription invoices.

Why not Stripe Tax (Option B) for launch:

| Concern                                               | Option A (manual inclusive 10% GST)                                                                                           | Option B (Stripe Tax)                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Advertised totals stay A$79 / A$149 / A$790 / A$1,490 | Yes, if `inclusive: true`                                                                                                     | Yes only if `tax_behavior: inclusive` **and** tax actually calculates                                                     |
| AU-only, fixed B2B SaaS                               | Matches                                                                                                                       | Extra machinery                                                                                                           |
| ABN on a domestic AU→AU sale                          | GST still charged; customer claims input tax credits                                                                          | Stripe Tax docs treat ABN as **no GST for remote sellers**. A mis-set origin could omit GST on taxable domestic supplies. |
| Fees                                                  | None beyond Billing                                                                                                           | Tax Basic is **0.5% per transaction** (Billing/Checkout) where registered; Tax Complete from A$140/month                  |
| Future international                                  | Replace later with Stripe Tax (cannot combine `automatic_tax` with manual `tax_rates` on the same object — a planned cutover) | Better later, not needed now                                                                                              |
| Registration mistake                                  | Rate is explicit                                                                                                              | `automatic_tax` with no active registration **silently collects $0 tax**                                                  |

This is **not** a tax determination. Joaquín’s accountant must confirm: GST registration, that these plans are taxable supplies, that inclusive 10% is correct, and invoice wording.

Stripe’s own [Australia invoicing guide](https://docs.stripe.com/invoicing/australia-invoicing) still applies: seller identity, ABN, “Tax Invoice” subtitle via custom field, GST amount (required to be explicit for supplies **A$1,000+** — Practice annual is A$1,490), buyer identity or ABN.

### E.4 Amounts vs marketing

`PLAN_PRICES` remains canonical for `/pricing` and JSON-LD. Implementation should assert Stripe Price unit amounts equal `PLAN_PRICES * 100` at Session-create time. Marketing pages must not fetch Stripe.

---

## F. Checkout / payment flow

Use **Stripe-hosted Checkout**, `mode: 'subscription'`. Do not build Payment Element or a River card form. Omit `payment_method_types` so Dashboard Payment Method Configuration can offer:

- Domestic cards
- Apple Pay / Google Pay where Checkout shows them
- AU BECS Direct Debit (AUD subscription Checkout; enable in Dashboard; extra identity verification may be required on the Stripe account)

### F.1 Operator → successful subscription

```text
1. Operator creates/approves Clinic (existing flow)
2. Operator records ClinicBillingProfile (required before Checkout)
3. Operator selects ESSENTIAL|PRACTICE + MONTHLY|YEARLY
4. Server:
     a. refuse if entitlement already ACTIVE / PAYMENT_PENDING / CANCELED_AT_PERIOD_END
        with a live stripeSubscriptionId (operator override = explicit “replace” later)
     b. create or reuse Stripe Customer (idempotent by stripeCustomerId)
        metadata.clinicId = Clinic.id
        name/email/address/tax_id from billing profile
     c. map plan+interval → env Price ID (never request body)
     d. checkout.sessions.create with idempotency key
        keyed by clinicId + priceId + billing-profile version
5. Store checkoutSessionId, billingStatus=CHECKOUT_OPEN,
   entitlementStatus=PENDING_ACTIVATION
6. Clinic ADMIN opens hosted URL (copied by operator and/or shown on Account → Billing)
7. Stripe collects payment method + billing details
8. Return URL: https://app.<root>/account/billing?session_id={CHECKOUT_SESSION_ID}
9. Webhooks project state (section G). Landing page may also retrieve the
   Session and run the same idempotent projector (Stripe fulfillment guide).
```

Recommended Checkout Session fields:

- `customer` = existing Customer (never `customer_creation` on every retry)
- `line_items: [{ price, quantity: 1 }]`
- `success_url` / `cancel_url` on staff origin
- `billing_address_collection: 'required'`
- `tax_id_collection: { enabled: true }` (ABN)
- `customer_update: { name: 'auto', address: 'auto' }`
- `subscription_data.metadata`: `clinicId`, `plan`, `interval`
- `client_reference_id`: `clinicId`
- `metadata` on the Session: same opaque River IDs
- `integration_identifier`: e.g. `river_assisted_checkout_<8 random letters>` (API 2026-03-25+)
- default tax rate = the inclusive 10% GST rate (Dashboard or `subscription_data.default_tax_rates`)
- **no** `allow_promotion_codes` at launch
- **no** client-supplied Price

Abandoned Checkout: Session expires; River stays `CHECKOUT_OPEN` until expiry webhook or operator retry. Retry reuses Customer, creates a **new** Session, replaces `checkoutSessionId`. Stripe `subscription_data` plus River’s “one live subscription” guard prevent accidental duplicates; still check `customer.subscriptions` before create.

### F.2 What `checkout.session.completed` means

Stripe’s Checkout object `status=complete` means the customer **submitted** Checkout, not that funds settled.

`payment_status` is `paid` \| `unpaid` \| `no_payment_required`.

Delayed methods (BECS) complete Checkout with **`payment_status: unpaid`** while the PaymentIntent is `processing`. Stripe later emits `checkout.session.async_payment_succeeded` or `checkout.session.async_payment_failed`.

**Do not treat `checkout.session.completed` as “paid entitlement”. Stripe does not guarantee that for BECS.**

Cards (and wallets that confirm immediately) typically complete with `payment_status: paid` and a paid first invoice in the same flow. Still activate from the **projector** (section G), which is safe for both.

---

## G. Webhook state machine

### G.1 Endpoint

- `POST /api/stripe/webhook` on the **staff host only**
- Next.js App Router Route Handler, **Node runtime** (Stripe signature uses Node crypto)
- Read **raw** body: `await request.text()`, then `stripe.webhooks.constructEventAsync(payload, signature, webhookSecret)`
- Never `request.json()` first
- No session/CSRF (Stripe server-to-server). Verify signature. Optionally allowlist [Stripe IPs](https://docs.stripe.com/ips.md)
- Add `/api/stripe` to `STAFF_PATH_PREFIXES` so tenant hosts 404 it (marketing already 404s `/api`)
- Respond **2xx quickly**. Stripe retries on non-2xx. `invoice.created` is especially sensitive: a failing listener can delay automatic finalization for up to 72 hours. **Launch should not subscribe to `invoice.created` unless we mutate invoices before finalization.** Put “Tax Invoice” and ABN on the Dashboard invoice template instead.

SDK: official `stripe` Node package, **latest stable** at implementation time (as of this investigation `22.6.1`, default API **`2026-08-26.dahlia`**). Instantiate `new Stripe(key, { apiVersion: '2026-08-26.dahlia' })` (or `StripeClient` per current SDK). Pin the webhook endpoint to the **same** API version. Prefer a **restricted key** (`rk_`) with Billing + Checkout + Customers + webhooks, not a secret `sk_`.

### G.2 Events to consume at launch

Verify against the pinned API/SDK when implementing. Current names that matter:

| Event                                      | Use                                                                                                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`               | Bind Customer + Subscription IDs. If `payment_status=unpaid` → `PAYMENT_PENDING`. If `paid` → run projector.                                                                                                                                        |
| `checkout.session.async_payment_succeeded` | BECS (and other delayed methods) succeeded. Run projector.                                                                                                                                                                                          |
| `checkout.session.async_payment_failed`    | Initial delayed payment failed. Do not activate. Mark failed initial payment.                                                                                                                                                                       |
| `checkout.session.expired`                 | Clear `CHECKOUT_OPEN` if it still points at this Session.                                                                                                                                                                                           |
| `customer.subscription.created`            | Run projector (do not assume `active`).                                                                                                                                                                                                             |
| `customer.subscription.updated`            | Run projector (status, cancel_at_period_end, price, period).                                                                                                                                                                                        |
| `customer.subscription.deleted`            | Run projector → `ENDED` / retention policy.                                                                                                                                                                                                         |
| `invoice.paid`                             | **Preferred payment-success signal** (covers out-of-band paid as well as charge success). Activate or renew from projector. Newer `invoice_payment.paid` exists; `invoice.paid` is still the documented fulfillment event and is enough for launch. |
| `invoice.payment_failed`                   | Card/BECS failure. `past_due` / `PAYMENT_PENDING` as appropriate. Do not unpublish patient guides.                                                                                                                                                  |
| `invoice.finalization_failed`              | Operator alert. No entitlement change by itself.                                                                                                                                                                                                    |

Do **not** depend on event order. Multiple events fire for one Checkout.

### G.3 Idempotency and ordering

1. Verify signature.
2. Insert `StripeEventReceipt.stripeEventId` uniquely. Duplicate → 200 no-op.
3. **Projector (authoritative):** given `clinicId` from metadata or Customer/Subscription lookup, `subscriptions.retrieve` (and latest invoice if needed) and write River rows from **current Stripe state**, not from the event body alone.
4. Persist invoice refs from `invoice.paid` (IDs + hosted URL only).
5. Log `event.id`, `type`, `clinicId`, `billingStatus` — never payload PANs, bank accounts, or full Customer objects.

Out-of-order `updated` then `created` is harmless if every handler retrieves live state.

### G.4 Activation rules

| Stripe observation                                              | River `billingStatus`    | River `entitlementStatus`             |
| --------------------------------------------------------------- | ------------------------ | ------------------------------------- |
| Checkout open, no subscription                                  | `CHECKOUT_OPEN`          | `PENDING_ACTIVATION`                  |
| Subscription exists, first invoice not paid (BECS `processing`) | `PAYMENT_PENDING`        | `PENDING_ACTIVATION`                  |
| Subscription `active` **and** latest relevant invoice paid      | `ACTIVE`                 | `ACTIVE`                              |
| Subscription `past_due`, retries still running                  | `PAST_DUE`               | `GRACE` (see I)                       |
| Subscription `unpaid` or retries exhausted per Dashboard        | `UNPAID`                 | `AUTHORING_RESTRICTED` then retention |
| `cancel_at_period_end=true`, still `active`                     | `CANCELED_AT_PERIOD_END` | `ACTIVE` until `paidThrough`          |
| Subscription `canceled` / `incomplete_expired`                  | `ENDED`                  | retention then `TERMINATED`           |
| `incomplete` requiring customer action (e.g. 3DS abandoned)     | `REQUIRES_ACTION`        | `PENDING_ACTIVATION`                  |

**Paid entitlements begin** when the projector sees a paid invoice for the current subscription **and** subscription status is `active` (or `canceled` with `cancel_at_period_end` still inside the paid period — treat as active until period end).

**Initial BECS failure:** `async_payment_failed` / `invoice.payment_failed` while never `ACTIVE` → stay inactive, operator retries Checkout. Do not leave a zombie `active` unpaid subscription if Stripe marks `incomplete_expired`.

### G.5 Operator visibility

If processing throws after signature verify: return **500** so Stripe retries. Also `reportOperationalFailure` with code `stripe_webhook_failed` (no payload). Operator clinic page should show `lastStripeSyncAt`, billing status, and a **Refresh from Stripe** action (section 25).

---

## H. Entitlement model

### H.1 Capabilities

This table is the superseded investigation. Current bases are in **Phase 4 — plan allowances** above: Essential 2 custom / 2 editable / 4 combined / 2 team members; Practice 30 custom / 30 editable / 40 combined / 5 team members. An edited River template does not consume the custom-guide allowance. Practice cannot hold 60 clinic-owned guides. Group has no numeric cap.

| Capability                                                                                            | Essential               | Practice              | Group           |
| ----------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- | --------------- |
| Use River templates **as supplied** (enable, publish clinic snapshot without clinic-specific rewrite) | yes                     | yes                   | operator-scoped |
| Create/edit **custom** clinic guides with the **normal editor**                                       | yes, max **2**          | yes, max **30**       | operator-set    |
| **Adapt** a River template into a clinic-owned custom guide                                           | **no**                  | yes; counts toward 30 | operator-set    |
| Multi-location                                                                                        | no (sales conversation) | sales conversation    | custom          |

Do not cripple the editor for Essential custom guides. The plan difference is **what they may start from and how many custom documents they may own**, not a reduced editor.

### H.2 How close the domain is today

Already true:

- Canonical templates are not mutated.
- Clinic publish copies an immutable clinic revision.
- Custom vs template-backed is distinguishable (`guideTemplateId` null vs set).

Not true yet:

- Enabling a template **is already a clinic-owned draft that can be freely edited** (`PRACTICE_OVERRIDE`). Commercially that is adaptation, not “as supplied”.
- No adapt action, no count, no plan gate.

### H.3 Recommended enforcement semantics (Phase F)

Phase 4 did not implement item 2 below. An edited River template has its own allowance. It does not count toward `customGuideLimit`. Practice base is 30 editable templates and 40 clinic-owned guides combined, not 60.

1. **As supplied:** template-backed `PracticeGuide` remains `guideTemplateId` set. Saving draft **rejects content changes** that would move sections off `CANONICAL` for Essential (and for Practice unless they confirm Adapt). Cosmetic clinic chrome (`ClinicProfile`) is unrelated.
2. **Adapt (Practice):** explicit action converts the row to custom (section D.3). Counts toward `customGuideLimit`.
3. **Custom create:** count `guideTemplateId IS NULL` including drafts. Block create when at cap. Unpublished/draft custom guides still count (they occupy the allowance). Deleting a draft frees a slot. Joaquín may later choose that only published custom guides count — default recommendation is **all non-deleted custom rows count**, which is simpler and matches “up to N custom clinic guides”.
4. **Practice → Essential** while holding more clinic-owned guides than Essential allows: **do not auto-delete**. Phase 5 replaced the earlier operator-approval recommendation. A clinic ADMIN reviews the downgrade, chooses the keep-set, and schedules Essential for the next renewal. Guides outside that set are retained for 60 days when the Essential price applies. See the Phase 5 section above.
5. **Essential → Practice / monthly → yearly:** Essential → Practice stays operator-assisted for now. A later self-service upgrade should reuse that engine. Prefer **period-end** schedule via Stripe Subscription Schedule or update at next cycle to avoid messy prorations, unless Joaquín wants immediate paid upgrade (see O).

Authorisation reads `ClinicEntitlement` only.

---

## I. Cancellation / payment-failure and durable patient URLs

Patient aftercare URLs are durable. **A failed payment must not immediately 404 a published guide.**

### I.1 Separate concepts

| Concept                         | Meaning                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| Billing status                  | Stripe money state                                                       |
| Entitlement status              | What River allows                                                        |
| Staff login                     | Auth; may remain possible during grace so they can update payment method |
| Authoring                       | Create/edit/publish                                                      |
| Existing published patient URLs | Tenant `PUBLISHED` + `isEnabled`                                         |
| Account termination             | Explicit operator/legal end; not the same as Stripe cancel               |
| Data retention                  | Terms already: 30-day export after termination, then possible delete     |

Current Terms: overdue reminders; suspend staff or public pages only after **≥14 days unpaid after due date** and **reasonable notice**; suspension is **not automatic**. After subscription end, River **may** unpublish. Cancellation is **at period end**, no cancel fee, no voluntary pro-rata refund except law/agreement.

Stripe auto-charge **replaces** 14-day bank-transfer terms for Checkout customers. Terms must be revised before live billing (Joaquín + counsel). Until then, River policy should stay **at least as patient-safe** as the published Terms.

### I.2 Options for Joaquín (do not silently pick durations in code)

**A. Past-due / failed renewal**

| Option               | Staff authoring                                             | Published patient URLs                                              | Notes                                                          |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| A1                   | Unchanged during Stripe Smart Retries                       | Unchanged                                                           | Simplest; closest to “suspension is not automatic”             |
| A2 **(recommended)** | Unchanged for a **grace window**, then authoring restricted | Unchanged during grace **and** while `UNPAID` until retention clock | Matches “restrict authoring before taking public content down” |
| A3                   | Authoring restricted on first `invoice.payment_failed`      | Unchanged                                                           | Harsh for BECS/card glitches                                   |

**Recommended default to approve:** **A2**. Grace = **while Stripe is still retrying** (`past_due` with `next_payment_attempt` set), not a second invented number. After retries exhaust (`unpaid` / Dashboard end action), move to authoring restricted immediately; start public retention clock (below). Configure Stripe Smart Retries to **~8 attempts / 2 weeks** (Stripe default recommendation) and BECS Direct Debit retries on. Align written Terms with “we retry, then restrict staff publishing, then unpublish after notice + retention”.

Do **not** set Stripe’s failed-payment end action to **cancel immediately** at launch. Prefer **mark unpaid** so River can run retention instead of Stripe deleting the subscription out from under a patient URL.

**B. Cancel at period end**

Keep **full** product (authoring + public URLs) until `current_period_end` / `paidThrough`. Then treat as ended.

**C. Immediate cancel**

Operator-only exceptional path (abuse, legal). Still apply public retention unless termination is for security/illegality (Terms already allow faster public takedown).

**D. After paid-through / unpaid end — public URL retention**

| Option               | Public URLs                                                                                         | Staff                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D1                   | Unpublish at period end                                                                             | Authoring off                                             |
| D2 **(recommended)** | Keep published URLs for **30 days** (`publicRetentionUntil`), matching existing Terms export window | Authoring off; Account → Billing + export still available |
| D3                   | Keep public until operator unpublishes                                                              | Too open-ended for a lapsed commercial account            |

**E. Account deletion** vs billing cancel: deletion is a separate operator action after the retention window (and legal retention of invoices). Never cascade-delete `PracticeGuide` because Stripe canceled.

**Failed initial BECS/card (never activated):** no public-guide promise. Clinic may exist as a provisioned shell; entitlements stay inactive.

---

## J. Invoicing / Customer Portal

### J.1 Launch invoice experience

Prefer Stripe-native documents. Do not generate PDFs in River.

Configure in Dashboard (section N):

- Send finalised invoices and credit notes
- Successful payment receipts
- Failed card/BECS emails (Stripe’s copies)
- BECS mandate + pre-debit emails (**leave Stripe defaults on** — scheme expects customer notification; do not duplicate from Resend)
- Default account tax ID type `au_abn` = River ABN
- Custom field subtitle **Tax Invoice**
- Inclusive GST line display
- Seller name from Business profile; support/business address from Public business information
- Hosted Invoice Page enabled

Customer Portal invoice history + hosted invoice URL + PDF download is enough for “email + downloadable history”. Australian guidance allows electronic tax invoices when the recipient can access/download/print them. River should tell the clinic (onboarding + Billing page) that invoices arrive by email and are in Account → Billing.

Persist `StripeInvoiceRef` (IDs + URLs) optionally for the Billing page; **always** link to Stripe. Do not store PDF blobs. Accounting retention of tax invoices is a Stripe + accountant problem (Privacy already notes ~five years for tax records) — confirm with accountant whether Dashboard/export is sufficient or they also want Xero later (out of scope).

### J.2 A$1,000+ recipient identity

Practice annual A$1,490 **requires** buyer identity or ABN on the tax invoice. Therefore **before Checkout**:

Collect on `ClinicBillingProfile`: legal entity name, trading/practice name (if different), ABN (strongly recommended for all; **required for annual Practice**), billing address, billing contact, billing email, plan, interval.

Copy legal name + address + ABN (`customer.tax_ids`) onto the Stripe Customer. Checkout still collects/updates address and tax ID.

### J.3 Account → Billing (River UI)

Add `/account/billing` beside `/account/security` (clinic ADMIN). STAFF: read-only status or 404 — recommend **ADMIN only** for Manage billing.

Show River-owned projection: plan name, monthly/yearly, `billingStatus` in plain language, paid-through / next renewal if known, BECS pending copy, **Manage billing** button.

Manage billing: server action `requireClinicAdmin` → `billingPortal.sessions.create` for **this clinic’s** `stripeCustomerId` only → redirect. Short-lived URL.

### J.4 Portal capabilities at launch

| Feature                                           | Launch              |
| ------------------------------------------------- | ------------------- |
| Invoice history                                   | Enable              |
| Payment method update                             | Enable              |
| Customer update: name, address, email, tax_id     | Enable              |
| Subscription update / plan switching / quantities | **Disable**         |
| Promotion codes                                   | Disable             |
| Cancel                                            | See trade-off below |

**Cancellation in Portal vs contact River**

|                                          | Portal cancel at period end | Contact River only   |
| ---------------------------------------- | --------------------------- | -------------------- |
| Matches Terms “method we make available” | Yes if we enable it         | Yes                  |
| Support load                             | Lower                       | Higher               |
| Accidental cancel                        | Possible                    | Operator can counsel |
| Assisted-sales model                     | Slightly more self-serve    | Cleaner              |

**Recommendation:** enable **cancel at period end only** (`mode: at_period_end`, no immediate, no prorations) **if** Joaquín wants clinics to self-serve exit. Otherwise disable cancel in Portal and use “Contact us” on the Billing page. Do not enable immediate cancel in Portal at launch.

---

## K. Security

| Boundary                       | Rule                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PCI                            | SAQ-A via Stripe-hosted Checkout + Portal. River never sees PAN/BSB/account.                                                                                                                                             |
| Keys                           | Vercel sensitive env. Restricted key. Test vs live separation. Never client bundle. Rotate on staff change.                                                                                                              |
| Webhook                        | Signature required. Unique event ids. Staff-host URL.                                                                                                                                                                    |
| Checkout/Portal session create | Server Action or Route Handler: `requireClinicAdmin` for clinic self-serve Portal; `requirePlatformOperator` for starting Checkout. CSRF via existing staff origin checks (`isTrustedStaffAuthMutationRequest` pattern). |
| Price selection                | Closed env map. Ignore client Price IDs.                                                                                                                                                                                 |
| Stripe metadata                | Opaque `clinicId` only. **No patient names, no guide bodies, no clinical content.**                                                                                                                                      |
| Logging                        | Extend sanitizer for `sk_live_`, `sk_test_`, `rk_`, `whsec_`, `cus_`, `sub_`, `in_`, `pi_`, `pm_`. Do not log Customer `sources` or PaymentMethod objects.                                                               |
| Idempotency keys               | On Customer create (`clinicId`), Checkout Session create, Portal Session optional.                                                                                                                                       |
| Trust                          | Browser is untrusted. Stripe is trusted after signature verify. Operator is trusted to pick plan, not to paste arbitrary Stripe IDs. Clinic ADMIN may open Checkout/Portal only for their membership’s clinic.           |

---

## L. Test strategy

| Layer            | Approach                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)    | Projector pure functions: event/subscription snapshot → River statuses. Price map. Entitlement canCreateCustomGuide / canAdapt. **No network.**                                                                                                                                       |
| Stripe test mode | Dashboard sandbox/test. Test Products/Prices. Test clock for renewals/cancel-at-period-end. Cards `4242…`, 3DS `4000…000034`. BECS test BSB `000000` account `000123456` (success; PI `processing` → `succeeded`). Other documented BECS failure accounts for `async_payment_failed`. |
| Local webhooks   | Stripe CLI `stripe listen --forward-to http://app.localhost:3000/api/stripe/webhook`. CLI signing secret in local env only.                                                                                                                                                           |
| CI               | No live Stripe. No CLI dependency in ordinary `pnpm test`. Fixture payloads + mocked `subscriptions.retrieve`.                                                                                                                                                                        |
| Preview (Vercel) | Test-mode keys. Do not expect Stripe to hit every preview URL; use CLI or a stable staging webhook.                                                                                                                                                                                   |
| Live             | Forbidden in development. First live Checkout is a gated Phase after legal + GST confirmation.                                                                                                                                                                                        |

---

## M. Implementation phases and gates

Recommended sequence (safer than billing-before-domain):

| Phase                     | Scope                                                                                                                                                                | Gate before next                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A — Domain**            | `ClinicBillingProfile` + `ClinicEntitlement` + operator capture of identity/plan/interval. No Stripe package yet. No enforcement.                                    | Prisma migration via ADR 0025 (pending build → `prod:db:migrate` → same-SHA redeploy).        |
| **B — Test catalogue**    | Manual Dashboard: Products, inclusive GST rate, Payment Methods (card + wallets + BECS), invoice template, email settings, test restricted key. Env on Preview only. | Joaquín confirms test invoice PDF looks like a tax invoice (ABN, GST, buyer).                 |
| **C — Assisted Checkout** | `stripe` SDK, Customer reuse, Checkout Session, copy/link UX. Still test mode.                                                                                       | Duplicate-subscription guard proven; no custom card UI.                                       |
| **D — Webhooks**          | Route + receipts + projector + `invoice.paid` activation. Operator refresh.                                                                                          | Card **and** BECS test journeys; duplicate delivery; expired session.                         |
| **E — Billing UI**        | `/account/billing` + Customer Portal (no plan switching).                                                                                                            | ADMIN-only; STAFF cannot open Portal for another clinic.                                      |
| **F — Enforcement**       | 2/30 limits + as-supplied vs adapt. Guide `sourceGuideTemplateId` migration.                                                                                         | Existing clinics inventoried; no surprise lockout of design partners.                         |
| **G — Failure/retention** | Grace / authoring restrict / 30-day public retention / operator terminate.                                                                                           | Joaquín has approved section I options; Terms/Privacy updated and (ideally) counsel-reviewed. |

**Live-mode gate (after E at minimum, G before taking public URLs down automatically):** GST registration confirmed; Terms/Privacy mention Stripe and auto-charge; live Products/Prices; live webhook on `app.riveraftercare.com.au`; Better Stack alert on `stripe_webhook_failed`; first paying clinic is operator-watched.

Do not enable public self-serve signup, coupons, trials, Group automation, location add-ons, Xero, or Peppol in these phases.

---

## N. Manual Stripe configuration checklist

**Account**

- [ ] Business profile legal name (Pedro Joaquin Palacios / trading name River Aftercare — confirm with accountant)
- [ ] Support/business address (street address may be required on invoices; public site currently omits it)
- [ ] Statement descriptor (≤9 alphanumeric for BECS lodgement reference — pick carefully)
- [ ] Account tax ID `au_abn` **32 671 297 130**
- [ ] 2FA / passkeys on Dashboard users
- [ ] Restricted API keys (test + live), optionally IP policies

**Tax / invoices**

- [ ] Inclusive 10% GST tax rate named `GST`, inclusive, display name GST
- [ ] Default on subscription invoices
- [ ] Invoice custom field: `Tax Invoice`
- [ ] Inclusive tax shown on PDF; GST amount visible (needed for A$1,490)
- [ ] Email: finalised invoices, receipts, failed payments
- [ ] Do **not** also send River billing duplicates
- [ ] Hosted invoice page on
- [ ] Customer Portal configuration (section J.4) — test and live

**Payments**

- [ ] Payment Method Configuration: cards, Apple Pay, Google Pay, AU BECS
- [ ] Complete BECS identity verification
- [ ] BECS Direct Debit retries on for subscriptions
- [ ] Smart Retries ~8 / 2 weeks for cards
- [ ] Failed-payment end action: **mark unpaid** (not immediate cancel)
- [ ] Subscriptions: cancel at period end as default when cancel exists

**Catalogue (test, then live separately)**

- [ ] Products Essential + Practice
- [ ] Four Prices (amounts in section E)
- [ ] Copy IDs into Vercel env
- [ ] Do not create location/Group Prices

**Webhooks (test CLI locally; live Dashboard endpoint)**

- [ ] URL `https://app.riveraftercare.com.au/api/stripe/webhook`
- [ ] Events in section G.2
- [ ] API version `2026-08-26.dahlia` (or the pinned SDK version at implementation)
- [ ] Signing secret in Vercel Production only for live endpoint

**Emails (Dashboard)**

- [ ] Stripe: invoices, receipts, failed payments, BECS mandate/pre-debit, upcoming debit
- [ ] Stripe link for payment method update → Customer Portal
- [ ] River Resend: invitations, password reset, optional “complete billing setup” link, operational notices — **not** invoice PDFs

---

## O. Questions requiring Joaquín’s decision

Only items the repository and Stripe docs cannot settle:

1. **GST registration** — registered or not? If not, advertised “prices include GST” and charging a 10% GST rate are not something this investigation can authorise. Accountant confirmation required.
2. **Legal selling identity on invoices** — sole trader name vs trading name; **street address** for invoice (public copy is suburb-only).
3. **Terms/Privacy rewrite** — auto-charge vs 14-day transfer; name Stripe as payment processor; keep or replace “suspension is not automatic”. Counsel flags are still false.
4. **Portal cancellation** — allow at period end vs contact River only (J.4).
5. **Grace / public retention** — approve recommended A2 + D2 (retry window, then 30-day public URL retention) or choose A1/D1.
6. **Plan-change timing** — immediate paid upgrade vs next cycle for Essential→Practice and monthly→yearly. Launch can stay operator-manual either way.
7. **Refunds** — none approved. Terms currently: no voluntary pro-rata on cancel; River-initiated convenience termination refunds unused prepaid time. Need a written policy for accidental duplicate subscriptions, annual “cooling off”, and Stripe-processed refunds vs Dashboard-only.
8. **Annual Practice ABN** — require ABN before Checkout for all clinics, or only when amount ≥ A$1,000?
9. **First paying clinic** — activate entitlements only after first invoice **paid** (recommended, including BECS delay of ~T+2), or grant access at mandate/setup for BECS before funds clear? **Recommend wait for paid** unless Joaquín explicitly wants onboarding speed over payment certainty.
10. **Seat counts** (Essential 2 / Practice 5 named users in the roadmap) are **not** billed today — confirm they stay non-billing.

---

## P. Recommendation (single launch architecture)

Ship **operator-assisted Stripe Billing**, not self-service SaaS checkout.

- Keep `/pricing` as demo/contact.
- **Clinic** remains the tenant. Add **Billing Profile** (legal identity) and **Entitlement** (plan + projected statuses + Stripe IDs). Do not hang authorisation off live Stripe calls.
- **Stripe** owns money, invoices, PDFs, payment methods, dunning. **River** owns commercial plan, entitlement policy, and patient-URL retention.
- Catalogue: two Products (Essential, Practice), four inclusive AUD Prices matching `PLAN_PRICES`. No Group product. No location Prices.
- **Manual 10% inclusive GST** for an Australia-only launch; revisit Stripe Tax only for later international expansion.
- **Hosted Checkout** in subscription mode; Dashboard payment methods = card + wallets + BECS. No River card form.
- **Activate paid entitlements on `invoice.paid` (projector)**, not on `checkout.session.completed`. BECS stays `PAYMENT_PENDING` until async success.
- **Customer Portal** for invoices and payment methods; no self-serve plan or location changes.
- **Stripe sends billing email; River sends product/auth email.**
- **Durable patient URLs:** past_due does not unpublish; authoring may later restrict; after paid-through, keep published guides for the **30-day** Terms-aligned window unless Joaquín picks a stricter option.
- Implement in phases A→G with the production schema gate on Phase A/F, test-mode until legal/GST/invoice-template approval, then live webhook on `app.riveraftercare.com.au`.

This is the architecture to approve before any package install, migration, or Dashboard catalogue creation.
)
