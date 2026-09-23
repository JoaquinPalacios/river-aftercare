# Post-launch roadmap — River Aftercare

This document records **post-launch** product work. It is not a licence to start that work from a cleanup or marketing task.

Authoritative contract: [PRD.md](PRD.md)  
Architecture: [ADR 0006](../adr/0006-canonical-guide-plus-practice-configuration.md), [ADR 0010](../adr/0010-practice-guides-explicitly-pin-canonical-revisions.md), [ADR 0015](../adr/0015-recovery-plan-is-not-procedure-session.md)

---

## HIGH PRIORITY — launch-adjacent anti-spam

**Status: marketing Contact implemented.** Login still does **not** have Turnstile. Production login hardening (input bounds + dummy verification) did not add Turnstile or an application rate limiter; WAF remains 15 POST / 10 minutes / IP. See [AUTH.md](../architecture/AUTH.md).

Marketing `/contact` now uses a Cloudflare Turnstile Managed widget plus mandatory server-side Siteverify and Resend delivery. See [MARKETING-CONTACT.md](../architecture/MARKETING-CONTACT.md).

Do **not** add a global CAPTCHA to tenant patient pages from a Contact task.

When login Turnstile is added later:

| Requirement                    | Why                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Server-side token verification | A client widget alone is not protection                                                                   |
| Graceful failure               | The form must not silently drop legitimate clinic staff if the provider is down or the token check errors |
| Accessibility                  | Turnstile has an accessibility mode. Do not block keyboard or screen-reader users                         |

Contact already keeps the baseline: server Zod validation, honeypot (`website`), and Turnstile. The in-memory Map throttle was removed because it is not durable on Vercel.

---

## Pre-launch clinic operations (not implemented)

### Object storage for clinic logos

**Status: application ready; blocked on external R2 provisioning.** Cloudflare R2 is the production provider. See [CLINIC-ASSETS.md](../architecture/CLINIC-ASSETS.md), [ADR 0022](../adr/0022-cloudflare-r2-is-clinic-asset-provider.md), and [R2-PROVISIONING.md](../launch/R2-PROVISIONING.md).

### Team / Users

**Operator-managed invitations are implemented** (Operator → Clinics → Team). Clinic ADMIN can send an invitation from Practice → Members. Do **not** implement clinic-admin resend, cancel, role change, or remove from this note.

Phase 4 enforces team, custom-guide, and editable-template allowances, plus a combined clinic-owned guide ceiling. Essential base is 2 team members, 2 original custom guides, 2 editable River templates, and 4 clinic-owned guides in total. Practice base is 5, 30, 30, and 40. Practice may mix the two guide categories inside that ceiling. Operator-granted extras add to the matching category, and each guide extra also adds one combined place. They do not change Stripe. Group has no fixed cap. There is no per-seat billing and no per-invitation override. See [BILLING.md](../architecture/BILLING.md).

Phase 5 schedules Practice → Essential at the next renewal on the same subscription. It is operator-assisted, same interval only, with no proration or refund. Essential starts when Stripe applies that Price. Extras stay. Cancellation takes precedence over a scheduled downgrade. Monthly ↔ annual is still later work. GST registration has accountant approval and stays a separate task: do not add Stripe Tax or public GST wording from the downgrade.

Later portal capability:

- clinic STAFF must not invite
- clinic ADMIN resend, cancel, role change, and remove
- last-admin protection when that clinic-admin Team management exists
- transfer admin

**Operator ADMIN ↔ STAFF role change after invite is implemented** on operator Team. Do **not** add last-admin protection, self-demotion rules, or clinic-admin Team management beyond Practice invite from this note.

Named team-member allowances (product entitlements, not billed seats):

| Plan      | Named users included |
| --------- | -------------------- |
| Essential | 2                    |
| Practice  | 5                    |
| Group     | custom               |

Do not recommend a shared clinic login. Named membership accounts are required for accountability, revocation, ADMIN vs STAFF distinction, and future audit.

Current roles remain Clinic ADMIN and Clinic STAFF only.

### Operator Templates

The operator console currently exposes **Clinics** and **SEO & Discovery**. Canonical template management is the next operator-console capability. Do not add a dead Templates navigation item before that work exists.

Platform marketing SEO is structured database configuration ([ADR 0020](../adr/0020-platform-seo-is-structured-database-configuration.md)). Clinic-guide search metadata should later live on Guide Template defaults, optional clinic Guide overrides, and Practice identity — not a second generic CMS. Tenant pages stay noindex by default ([ADR 0021](../adr/0021-clinic-patient-guides-stay-noindex-by-default.md)).

### Future per-guide search visibility

Launch tenant pages are `noindex`. A later explicit field (for example `searchVisibility: PRIVATE_FROM_SEARCH | INDEXABLE`, default `PRIVATE_FROM_SEARCH`) would let a clinic opt a published guide into indexing, with operator policy above it. Do not add that schema until the opt-in UI exists. See [SEO.md](../architecture/SEO.md).

---

## Launch vs post-launch

**Current production launch contains no persisted patient check-ins.**

The launch patient experience is an anonymous published guide:

- Today (demo fixture on `demodental` only)
- Timeline
- Print / Save PDF

Check-in is **POST-LAUNCH**. It is not part of MVP launch UI, even as a hidden client prototype.

Today is not a real per-patient capability until a persisted anonymous RecoveryPlan / share-link domain exists. The generic `/extraction` guide does not know a patient's real treatment day.

---

## Check-ins — premium / add-on

Check-ins are a future **PREMIUM / ADD-ON** capability (or a higher Connected / Recovery tier). Do **not** set a final price here.

A real implementation requires all of:

| Requirement                               | Why                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| RecoveryPlan persistence                  | Day-aware “today” and check-in history need a started recovery, not `Date.now()` |
| Opaque patient / recovery token           | Unguessable public URL; no patient account                                       |
| Patient-reported health information       | Feeling / note is health data, not a marketing form                              |
| Retention / deletion policy               | Health information cannot be kept indefinitely without a stated policy           |
| Tenant isolation                          | Clinic A must never see Clinic B check-ins                                       |
| Audit / event history                     | Who read or acted on a check-in, and when                                        |
| Clinic dashboard                          | Staff need a place to review responses                                           |
| Alerts / notifications (if ever added)    | Optional later; not implied by storing a check-in                                |
| Explicit non-emergency-monitoring wording | Check-in is not clinical monitoring or an emergency service                      |
| Operational expectations                  | Who reads responses, during which hours, and what happens if nobody does         |
| Security / privacy review                 | Required before any persistence, analytics, or notification                      |

Check-in is **not** emergency monitoring. Copy must say so. Do not reuse `ProcedureSession`.

Potential commercial model (not priced):

- optional paid add-on, or
- a higher Connected / Recovery plan tier

Feature availability should be gateable per clinic / plan (`enabled` / `disabled`). When disabled, Check-in is omitted entirely.

---

## RecoveryPlan (not implemented)

Future concept, documented in ADR 0015:

```text
GuideTemplate
  → published revision
  → resolved / composed guide
  → future RecoveryPlan
       clinicId
       guide / revision pin
       startedAt / procedureDate
       opaque public token
       status
```

Then:

```text
Today
Timeline
Print / PDF
optional future Check-ins
```

**RecoveryPlan ≠ ProcedureSession.** Do not implement RecoveryPlan from this document. The current Day 1 Today experience is an explicit demo fixture.

---

## Template / content model

Launch business model:

```text
canonical River Aftercare templates
        ↓
clinic enables a template
        ↓
clinic may override sections
        ↓
clinic may add local sections / information
        ↓
clinic may create its own custom guide
        ↓
preview
        ↓
publish a pinned revision
```

An update to a River Aftercare canonical template must **never** silently mutate a clinic's already-approved / published patient guide. Practices pin a revision (ADR 0010). Adopting a newer canonical revision is an explicit later operator action.

Clinical content must be reviewed / approved separately. Do not seed clinically authoritative versions from this roadmap.

### Initial dental template direction (candidates, not seeded)

- Tooth Extraction
- Wisdom Teeth Removal
- Dental Implant
- Scaling & Root Planing / Periodontal Deep Cleaning
- Periodontal Surgery
- Root Canal

These are content-library candidates. Exact published titles can follow clinical review.

---

## Future verticals

Architecture is intentionally multi-specialty. Terminology and data names stay generic.

Current commercial sequencing:

```text
Dental
  → cosmetic / injectables
  → physiotherapy
  → podiatry
  → dermatology
  → veterinary
  → surgery / allied health
```

Do **not** implement later verticals now. Do not build abstractions purely for speculative future requirements beyond keeping the model generic.

### Physiotherapy (future fit)

When that vertical is an explicit programme, the same guide / recovery model should fit:

- recovery plans
- home exercise guidance
- staged rehabilitation
- restrictions
- progression milestones
- videos later
- clinic-specific instructions

Not in launch. Dental first.

---

## Platform Contact / Pricing

River Aftercare **sales** Contact and Pricing belong only on the **root marketing domain**.

They must not appear on tenant hosts such as `demodental`. Tenant pages expose only:

- clinic contact
- clinic phone
- clinic urgent / emergency instructions

Platform Contact / Pricing live only on the **root marketing domain** (`/pricing`, `/contact`). They must not appear on tenant hosts such as `demodental`. Tenant pages expose only:

- clinic contact
- clinic phone
- clinic urgent / emergency instructions

Public published prices (AUD): Essential A$79/month or A$790/year, Practice A$149/month or A$1,490/year, Group custom pricing. Do not claim GST is included while registration is pending accountant confirmation. Do not publish additional-location dollar rates until a Location model exists; public copy directs multi-location practices to talk to us. Check-ins remain unpriced post-launch work and are not advertised on the public pricing page. Contact delivery is a server-side clinic enquiry form (`CONTACT_EMAIL_TO` / Resend / Turnstile). See [MARKETING-CONTACT.md](../architecture/MARKETING-CONTACT.md).

---

## Explicitly not this document

- Phase 2 clinic / operator admin
- Persisted RecoveryPlan
- Reuse of ProcedureSession
- Clinically authoritative template authoring
- Final pricing
