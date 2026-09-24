# Care Guide

# Product Requirements Document

**Version 1.0 — Aftercare SaaS**

---

## 1. Document status and version

| Field                                          | Value                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Product                                        | Care Guide                                                                                                                     |
| Commercial / product name                      | **River Aftercare**                                                                                                            |
| Document                                       | Product Requirements Document                                                                                                  |
| Version                                        | 1.0                                                                                                                            |
| Codename / subtitle                            | Aftercare SaaS                                                                                                                 |
| Status                                         | **Authoritative product contract**                                                                                             |
| Date                                           | 2026-08-31                                                                                                                     |
| Phase covered by this document                 | Phase 0 — Product reset / architecture contract                                                                                |
| Implementation status of the aftercare product | **Not implemented.** This document specifies intended product behaviour.                                                       |
| Supersedes                                     | Informal assumption that Care Guide _is_ the in-chair procedure-session / patient-display product currently in this repository |

This PRD is the authoritative product contract for subsequent implementation sessions.

If application code, schema, or README copy disagrees with this document about **product direction**, this PRD wins.

If this PRD disagrees with the repository about **what currently exists**, the repository wins. Intended behaviour must not be described as shipped.

Related documents:

- [Documentation index](../README.md)
- [Architecture Decision Records](../adr/README.md)
- [Working memory for implementers](WORKING-MEMORY.md)

---

## 2. Executive summary

Care Guide’s primary product is a **multi-tenant B2B SaaS platform** that lets healthcare practices give patients **clear, branded, mobile-first post-treatment aftercare guides** through **permanent web URLs and QR codes**.

- The **healthcare practice is the customer**.
- The **patient is the end user** of the aftercare experience.
- To the patient, the product should feel like an extension of the practice’s own digital presence, not a generic third-party pamphlet site.
- Care Guide owns and operates the SaaS platform, curated guide library, publishing system, and administration tools.

This is a formal product reset.

The repository’s current product is River Aftercare: staff auth, clinic portal, operator tools, and branded aftercare guides. An earlier chairside workflow (rooms, doctors, live stages, `/display/[token]`, Supabase Realtime, and an external `aftercareUrl`) was **removed as legacy**. It must not define aftercare architecture. Dormant Prisma models may remain. **Aftercare must not depend on `ProcedureSession`.** Auth.js `Session` records are unrelated.

The commercial artefact being sold is **branded digital aftercare infrastructure for healthcare practices**, not “a website containing medical instructions.”

---

## 3. Product vision

Every participating practice receives a durable, branded aftercare presence on Care Guide’s platform.

Example (conceptual routing only; the commercial domain is not chosen):

```text
pacificdental.<platform-domain>/
pacificdental.<platform-domain>/extraction
pacificdental.<platform-domain>/dental-implant
pacificdental.<platform-domain>/root-canal
pacificdental.<platform-domain>/scaling-root-planing
```

A patient who scans a card, opens an SMS link, or revisits a bookmark hours or days later should immediately see:

- their practice’s name, brand, and contact pathways;
- the relevant post-treatment guide;
- clear warning and emergency guidance;
- an obvious way to call, contact, or book the same practice.

Care Guide remains in the background as the operating platform. A small “Powered by River Aftercare” attribution may appear. The practice remains the primary brand.

---

## 4. Problem statement

After treatment, patients leave with incomplete, easy-to-lose, or hard-to-reread instructions. Practices currently stitch this together from:

- printed handouts that are discarded;
- verbal instructions that are forgotten;
- generic web pages that do not look like the practice;
- clinic websites that are not designed as mobile aftercare artefacts;
- one-off PDFs or SMS messages that are not maintained.

Patients then search the open web, call the wrong number, or cannot tell which advice belongs to _their_ provider. Practices lose a simple re-engagement path (call, contact, book) and have no visibility into whether aftercare materials are actually used.

Care Guide addresses this as **infrastructure**: curated content, practice branding, durable URLs, QR distribution, publishing control, and anonymous usage visibility — operated as a B2B SaaS, starting with Dental.

---

## 5. Customer and user definitions

### 5.1 Customer

The **practice** (clinic / healthcare provider organisation) is the paying customer.

`Clinic` is the likely tenant concept in this repository. In product language:

| Term              | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Practice / Clinic | The customer tenant                                               |
| Tenant            | Architectural term for a practice account                         |
| Location          | A future concept; MVP may treat one clinic record as one location |

Example customer (conceptual only): **Pacific Dental**, whose normal website might be `pacificdental.com.au`. Care Guide would give that practice a branded tenant presence such as `pacificdental.<platform-domain>`.

Pacific Dental is an **architecture and business example only**. Care Guide does **not** have permission to reproduce its logo, trademark, colours, copy, contact details, or imagery. Development and demonstration must use a **fictional Care Guide demo clinic** unless Joaquín later explicitly approves a real design partner.

### 5.2 End user

The **patient** consumes a published guide. The patient is not a Care Guide customer and is not a Care Guide account holder.

MVP patients:

- do not create accounts;
- do not log in;
- are not identified to Care Guide;
- are not represented as treatment records.

### 5.3 Care Guide operator

A **Care Guide operator** is an internal platform administrator (Care Guide staff), not necessarily clinic staff.

Operator identity is `User.platformRole = OPERATOR`. It is **not** clinic `ADMIN`. See [ADR 0016](../adr/0016-platform-operator-is-distinct-from-clinic-admin.md).

Phase 2A implements All Clinics oversight and clinic creation. Canonical library management, QR, analytics, and impersonation remain later.

### 5.4 Clinic staff (current repository)

The repository has clinic-scoped staff users (`User`, `ClinicMembership`, Auth.js).

Clinic `ADMIN` can manage guides and Practice settings for **their** clinic. Clinic `STAFF` can view Overview and Guides and preview, but cannot publish or change clinic configuration.

Retired chairside routes (`/sessions/new`, `/session/[id]/control`, `/display/[token]`, `/dashboard/procedures`) are not application routes and return 404. They are not the aftercare operator admin.

---

## 6. Core value proposition

Care Guide is **branded digital aftercare infrastructure for healthcare practices**.

### 6.1 What the practice receives

- a branded aftercare presence on a tenant hostname;
- a curated, maintained aftercare library;
- content management and publishing;
- permanent shareable guide URLs;
- QR codes for those URLs;
- patient re-engagement / contact pathways (call, contact, book, emergency);
- usage visibility;
- ongoing platform and content maintenance by Care Guide.

### 6.2 What the patient receives

- immediate access from a QR code or link;
- no installation;
- no login;
- understandable post-treatment guidance;
- confidence from seeing their own provider’s brand and contact information;
- a durable resource they can reopen hours or days later.

### 6.3 What Care Guide is not selling (MVP)

- a replacement practice website;
- a practice-management system;
- an appointment engine;
- a patient health record;
- a native app;
- a provider marketplace.

---

## 7. Product principles

These principles constrain every MVP feature decision.

### Aftercare first

Every significant MVP feature must improve creation, delivery, management, or usefulness of post-treatment guidance.

### Practice branded

The provider owns the patient relationship and must be visually primary. Care Guide branding is secondary.

### Zero patient friction

No install. No login. No account. A guide opened from a QR code must be immediately useful.

### Durable

A guide remains useful after the patient leaves the practice. A permanent aftercare guide is **not** a completed chairside session.

### Mobile first

The phone is the primary consumption device. This is not the existing large-format chairside display design.

### Clinically governable

Content needs provenance, reviewability, and controlled publication. It is not disposable marketing copy.

### Privacy by minimisation

Do not collect patient data when the product does not need it. Public guide URLs contain no patient identity.

### Multi-tenant by design

Adding another clinic must be configuration and data, not another deployment or application fork.

### Platform before integrations

Prove the core SaaS before PMS, messaging, custom domains, or other external integrations.

### Simple before broad

Prove Dental before expanding across healthcare verticals.

---

## 8. Initial vertical

### 8.1 INITIAL VERTICAL

**Dental.**

The purpose of Dental is to prove the SaaS and product model with one coherent library, not to ship several healthcare verticals at once.

### 8.2 FUTURE VERTICAL EXPANSION

Agreed intended sequence (strategic direction, **not** an MVP implementation list):

```text
Dental
  → Cosmetic / Injectables
  → Physiotherapy
  → Podiatry
  → Dermatology
  → Veterinary
  → Surgery / Allied Health
```

Architecture and terminology must not make later specialties unnecessarily difficult (for example, avoid baking “tooth” or “oral” into generic domain names). Do **not** implement multiple verticals in the MVP.

Physiotherapy is a later vertical. When that programme is explicit, the same guide/recovery model should fit recovery plans, home exercise guidance, staged rehabilitation, restrictions, progression milestones, later video, and clinic-specific instructions. Do not build those abstractions now.

### 8.3 Dental MVP library (planning set only)

Do **not** author clinically authoritative instructions in implementation work unless a clinical governance process supplies them. Do **not** copy clinical guidance from arbitrary websites.

For product planning, a starter set sufficient to prove the library model may include:

- Tooth Extraction
- Wisdom Teeth Removal (also planned as Wisdom Tooth Extraction)
- Dental Implant
- Root Canal
- Scaling & Root Planing / Periodontal Deep Cleaning
- Periodontal Surgery
- Filling
- Crown / Bridge
- Teeth Whitening

These are **roadmap / content-library candidates**. Do **not** seed clinically authoritative versions until a clinical governance process supplies them. Do **not** copy clinical guidance from arbitrary websites.

The exact initial 3–5 guides for the first **technical** vertical slice may be decided later. Phase 1 only needs enough canonical content to prove the model end-to-end for one tenant.

---

## 9. Core user journeys

### 9.1 Patient opens a published guide (primary)

1. Patient scans a QR code or taps a shared URL after (or around) treatment.
2. Browser opens `https://<tenant>.<platform-domain>/<guide>` with **no authentication**.
3. Page loads quickly on a phone, showing the practice brand and the guide.
4. Patient can scan sections, see warnings, and contact or book the practice.
5. Patient can reopen the same durable URL later.

### 9.2 Patient lands on the tenant aftercare home

1. Patient opens `https://<tenant>.<platform-domain>/`.
2. They see the practice’s branded aftercare home.
3. Only enabled **and** published guides are listed.
4. They can open a guide or use call / contact / booking CTAs.

### 9.3 Care Guide operator onboards a practice (MVP operating journey)

1. Operator creates a practice tenant.
2. Operator assigns a tenant slug (hostname label).
3. Operator configures branding and contact / emergency information.
4. Operator enables relevant canonical templates for that practice.
5. Operator optionally records practice additions and overrides.
6. Operator previews, then publishes selected practice guides.
7. Operator copies public URLs and obtains QR codes for distribution.

Clinic staff self-service is not required for this journey in MVP.

### 9.4 Practice distributes a guide (physical / digital)

Staff at the practice (outside Care Guide software, in MVP) print cards, hand out material, add posters, or send the durable URL by SMS or email. Care Guide MVP does **not** send those messages automatically.

### 9.5 Operator inspects usage

Operator views basic anonymous analytics: page views, views by practice, views by guide, and simple trends. Optionally, QR-origin traffic is differentiated. No patient identity is involved.

### 9.6 Explicitly out of journey scope

- Patient registration or login.
- Looking up a specific patient’s extraction.
- Live in-chair stage control.
- Completing a `ProcedureSession` in order to “unlock” aftercare.

---

## 10. Functional requirements

The following ten capabilities are **agreed MVP requirements**. They are not optional stretch goals.

Implementation may be staged across Phases 1–3 (see §22). All ten must exist before the commercial MVP is considered complete.

### 10.1 Branded practice subdomain

Every practice receives a tenant hostname:

```text
<tenant-slug>.<platform-domain>
```

Example: `pacificdental.<platform-domain>`.

- The hostname is part of the commercial product.
- Tenant identity is resolved from hostname.
- The practice slug must **not** be required in the URL path for identity (`/<clinic>/extraction` is not the product).
- The exact Care Guide commercial domain is **not selected**. Do not hard-code a final domain. Use `<platform-domain>` in architecture and documentation.

### 10.2 Practice branding and contact configuration

Patient-facing pages must support practice-specific:

- practice name;
- logo;
- primary / secondary colours or equivalent theme configuration;
- contact telephone;
- address where appropriate;
- general contact information;
- emergency / urgent-contact instructions;
- booking / contact URL;
- Care Guide attribution configuration.

The experience must primarily communicate the **practice** brand.

River Aftercare **sales** Contact and Pricing belong only on the root marketing domain. Tenant hosts must not present platform sales contact or pricing. Tenant pages expose clinic contact, clinic phone, and clinic urgent / emergency instructions.

### 10.3 Curated aftercare-guide library

Care Guide maintains canonical aftercare templates.

Conceptual pipeline:

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
        ↓
public branded guide
```

Canonical Care Guide content and practice-specific customisations must remain conceptually distinguishable.

An update to a River Aftercare canonical template must **never** silently mutate a clinic's already-approved / published patient guide. Practices pin a revision; adopting a newer canonical revision is an explicit operator action. See ADR 0010. Open decision OD-4 is about later rollout _UX_, not the pin invariant.

Do **not** design aftercare content as procedure-session stages.

### 10.4 Practices enable only relevant procedures

A practice selects which Care Guide templates it offers.

Example: Pacific Dental might enable Tooth Extraction, Dental Implant, Root Canal Treatment, and Scaling & Root Planing, and not enable procedures it does not provide.

Disabled guides must not appear on the public tenant homepage or as public guide URLs.

### 10.5 Clinic-specific additions and overrides

Care Guide supplies canonical content. Practices may customise appropriate content.

The model must distinguish:

| Concept           | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| Canonical content | Care Guide–owned reusable template content                               |
| Practice addition | Practice-specific supplementary content layered onto the template        |
| Practice override | Intentional replacement or customisation of a piece of canonical content |

This distinction is required for future content governance. Do not collapse everything into a single untraceable text blob if a maintainable model can preserve provenance.

### 10.6 Permanent URL and QR code per guide

Every published practice guide has a durable URL, for example:

```text
pacificdental.<platform-domain>/extraction
```

Care Guide admin must be able to obtain a QR code associated with that URL.

Expected distribution uses (outside automated sending):

- printed cards;
- reception material;
- post-treatment handouts;
- posters / signage where appropriate;
- SMS;
- email;
- direct sharing.

QR support is an **MVP requirement**.

The QR code and the canonical public URL must resolve to the same durable guide.

### 10.7 Excellent mobile patient experience

The patient-facing product is **web-first and mobile-first**.

- No native app installation.
- No patient login.
- No account creation.

A guide must be immediately useful when opened from a QR code or link on a phone.

Design priorities:

- very clear hierarchy;
- highly readable typography;
- concise sections;
- accessible contrast;
- obvious warning / emergency information;
- easy scanning;
- minimal interaction;
- fast load;
- useful when revisited hours or days later.

This is **not** the existing large-format chairside display at `/display/[token]`.

### 10.8 Call / contact / booking CTAs

Published guides (and the tenant homepage) must make it easy to reconnect with the practice, depending on tenant configuration:

- click to call;
- contact practice;
- booking link;
- emergency / urgent instructions.

The patient must never need to search Google to work out how to contact the clinic after reading its guide.

### 10.9 Basic usage analytics

Basic analytics are an MVP requirement.

At minimum, Care Guide operators should be able to understand:

- page views;
- views by practice;
- views by guide;
- useful basic trends over time.

Where technically sensible, QR-origin traffic may also be differentiated.

Do **not** introduce patient identity for analytics. Avoid collecting sensitive health information unnecessarily.

Product analytics requirements are distinct from the later technical implementation choice (see §15).

### 10.10 Care Guide operator admin

Care Guide needs an internal administration interface.

For MVP, **Care Guide operators** — not necessarily the clinic itself — perform onboarding and content management.

The admin must ultimately allow operators to:

- create / manage a practice;
- assign / change tenant slug;
- configure branding;
- configure contact / emergency information;
- browse canonical aftercare templates;
- enable / disable templates for a practice;
- configure practice-specific additions / overrides;
- preview guides;
- publish / unpublish guides;
- copy public guide URLs;
- obtain QR codes;
- inspect basic usage analytics.

Clinic self-service is **not** required for MVP.

---

## 11. Tenant and branding requirements

### 11.1 Tenant model

```text
Care Guide
      │
      ├── Practice A (e.g. conceptual “Pacific Dental”)
      │      ├── branding
      │      ├── contacts
      │      └── enabled guides
      │              ├── extraction
      │              ├── implant
      │              └── root-canal
      │
      ├── Practice B
      │      └── ...
      │
      └── Practice C
             └── ...
```

`Clinic` remains the likely tenant concept. Tenant isolation is required. For MVP, isolation at the application / query level is acceptable if implemented consistently and tested. Postgres RLS is **not** automatically required.

### 11.2 Tenant hostname

Recommended conceptual split:

| Host                         | Audience                                        | Purpose           |
| ---------------------------- | ----------------------------------------------- | ----------------- |
| `app.<platform-domain>`      | Care Guide operators (and, later, clinic staff) | Administration    |
| `<tenant>.<platform-domain>` | Patients                                        | Branded aftercare |

Patient-facing tenant hosts must **not** depend on Care Guide staff authentication. Staff cookies should remain isolated from tenant patient hosts where practical.

Hostname is **tenant configuration**, not application code. This keeps a future custom-domain tier possible without rewriting routing logic. Custom customer domains are **not MVP**.

### 11.3 Public tenant homepage

A tenant root page is part of the product being sold:

```text
https://<tenant>.<platform-domain>/
```

Conceptual information architecture:

```text
{Practice name}
Aftercare Guides
  {Enabled published guide}
  {Enabled published guide}
  ...
Need help?
  Call {Practice}
  Book an appointment
```

Only enabled **and** published guides are visible. Unpublished or disabled guides must not leak via the homepage.

### 11.4 Branding hierarchy

1. Practice name, logo, colour / theme, and contact pathways.
2. Guide content.
3. Optional small River Aftercare attribution (“Powered by River Aftercare” by default).
4. Future pricing tiers may allow attribution to be removed. Attribution must not become a major visual brand element.

### 11.5 Demo tenant vs conceptual examples

- Use `pacificdental.<platform-domain>/extraction` in docs when explaining routing.
- Do **not** ship Pacific Dental’s real brand assets.
- Use a fictional Care Guide demo clinic for development and demonstration (the repository currently seeds **Rivers Care Demo Clinic**; that fictional clinic may continue or be replaced by another fictional demo — not by an unlicensed real brand).

---

## 12. Guide and content model

### 12.1 Terminology (normative)

| Term              | Meaning                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Care Guide        | The platform / product                                             |
| Practice / Clinic | Customer tenant                                                    |
| Tenant            | Architectural term for a practice account                          |
| Specialty         | Dental, Physiotherapy, etc.                                        |
| Guide Template    | Care Guide canonical aftercare content                             |
| Practice Guide    | A template enabled / configured for one practice                   |
| Guide             | Patient-facing published aftercare resource, when context is clear |
| Practice Addition | Practice-specific supplementary content                            |
| Practice Override | Intentional replacement / customisation of canonical content       |
| Tenant Hostname   | `<tenant-slug>.<platform-domain>`                                  |

Do **not** reuse `ProcedureTemplate` terminology for this domain merely because the parked schema already uses that name. Procedure sessions and aftercare guides are distinct concepts.

### 12.2 Conceptual objects

These are product-domain objects, not a Prisma schema.

**Guide Template (canonical)**

- Owned by Care Guide, not by a single practice.
- Identified by a stable public slug (example: `extraction`).
- Associated with a specialty (initially Dental).
- Contains structured canonical sections.
- Has version / revision identity.
- May have last-reviewed metadata.

**Practice Guide**

- The join of one Guide Template and one Practice.
- Exists only when the practice has enabled (or begun configuring) that template.
- Carries enablement, draft / published state, additions, overrides, and the public path slug (normally the template slug).
- When published, is addressable at `https://<tenant>.<platform-domain>/<guide-slug>`.

**Practice branding and contact profile**

- Practice-level, not guide-level, unless a later requirement justifies exceptions.
- Consumed by homepage, guides, and CTAs.

Canonical content and practice customisations must remain distinguishable after publish. Publishing produces a patient-visible **composed** guide; it must not erase provenance in the system of record.

### 12.3 Typical guide information architecture

A typical guide may include the following sections. This is expected IA, **not** final clinical copy, and **not** a requirement that every guide uses every section.

- Procedure / title
- Short introduction
- What to do immediately
- First 24 hours
- Following days / recovery timeline
- What is normal
- Pain / discomfort expectations where appropriate
- Eating / drinking / activity restrictions where appropriate
- Medications section where appropriate and clinically governed
- Oral / wound / site care where appropriate
- What to avoid
- Warning signs
- When to contact the practice
- When urgent / emergency care is appropriate
- Practice contact CTA
- Booking / contact CTA
- Last reviewed / content provenance where appropriate

Different specialties may later require different section structures. The conceptual model must not be unnecessarily dental-specific even though Dental is the first implementation. Section types should be data, not hard-coded “tooth extraction” screens.

### 12.4 Public URL contract

| Surface                  | URL shape                                         |
| ------------------------ | ------------------------------------------------- |
| Tenant aftercare home    | `https://<tenant>.<platform-domain>/`             |
| Published practice guide | `https://<tenant>.<platform-domain>/<guide-slug>` |
| Operator admin           | `https://app.<platform-domain>/…` (conceptual)    |

Guide slugs should be stable. Changing a public slug after distribution is a product event (broken QR codes and printed material), not a casual rename.

### 12.5 Independence from chairside sessions

A published aftercare guide:

- is not created by completing a session;
- does not require `ProcedureSession`;
- does not use `displayToken`;
- does not use in-chair stage copy (`calmCopy` / `patientCopy` / `detailedCopy`);
- does not treat `ProcedureTemplate.aftercareUrl` as the Care Guide aftercare product.

The removed chairside `aftercareUrl` was an optional **external link** shown after a completed live session. It is not the aftercare domain described here. Dormant `ProcedureTemplate.aftercareUrl` rows must not be reused as published guides.

---

## 13. Content lifecycle and governance

This is health-related content. The system must not be modelled like disposable marketing copy.

### 13.1 Required concepts (product direction)

| Concept            | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| Draft              | Not patient-visible                                                          |
| Published          | Patient-visible at the durable URL (if also enabled for that practice)       |
| Revision / version | A published (or publishable) snapshot has identity; history is not discarded |
| Last reviewed      | When the relevant content was last reviewed                                  |

Publishing controls what patients see. Unpublishing removes or replaces public availability without pretending the previous content never existed in the system of record.

### 13.2 MVP implementation requirement vs later enhancement

**Product requirement (direction):** version-aware publishing. Published clinical content must not simply be overwritten with no provenance or revision history.

**MVP implementation requirement:**

- draft vs published for Practice Guides;
- preview of the composed guide before publish;
- publish / unpublish controls in operator admin;
- a durable public URL that only serves published + enabled guides;
- enough provenance that canonical vs addition vs override is not lost;
- a last-reviewed field (or equivalent) available in the model even if the MVP UI is modest.

**Future clinical-governance enhancement (not all required as MVP UI):**

- `reviewedBy`
- `clinicalReviewer`
- `reviewDueAt`
- richer approval workflows
- specialty-specific clinical sign-off process

These future fields may exist in later schema work even if MVP UI does not expose a full governance console.

### 13.3 Canonical vs practice layers

Updates to a canonical Guide Template must not silently and untraceably rewrite every practice’s published output without a defined publication/review path. The exact rollout policy (auto-draft vs notify vs require re-publish) is an open decision (§25); the architecture must make a policy _possible_.

---

## 14. Operator admin requirements

### 14.1 MVP operator capabilities

See §10.10. Restated as acceptance-oriented capabilities:

| Capability                              | MVP    |
| --------------------------------------- | ------ |
| Create and manage a practice            | Yes    |
| Assign / change tenant slug             | Yes    |
| Configure branding                      | Yes    |
| Configure contact / emergency details   | Yes    |
| Browse canonical library                | Yes    |
| Enable / disable templates per practice | Yes    |
| Configure additions / overrides         | Yes    |
| Preview composed guides                 | Yes    |
| Publish / unpublish                     | Yes    |
| Copy public URLs                        | Yes    |
| Obtain QR codes                         | Yes    |
| Inspect basic usage analytics           | Yes    |
| Clinic self-service                     | **No** |
| Billing / subscription automation       | **No** |

### 14.2 Host and auth

Operator admin belongs on the staff/admin host conceptually (`app.<platform-domain>`), not on patient tenant hosts.

Existing staff authentication (`User`, `ClinicMembership`, Auth.js, `/login`, `requireStaffSession()`) is reusable **foundation**. MVP operator admin may be Care Guide–internal rather than clinic-membership self-service. How operator identity is modelled (platform operator vs clinic `ADMIN`) is an open decision, but patient hosts must not rely on those cookies.

### 14.3 Preview vs public

Preview is an authenticated (or otherwise non-public) operator action. It must not be the same capability as “the URL is live.” Patients only see published + enabled guides on tenant hosts.

---

## 15. Analytics requirements

### 15.1 Product requirements (MVP)

Operators need anonymous usage visibility:

- page views;
- views by practice (tenant);
- views by guide;
- basic trends over time;
- QR-origin differentiation where technically sensible (for example a dedicated QR landing query parameter or QR-specific path that canonicalises to the same guide).

### 15.2 What analytics must not do

- Identify a patient.
- Require a patient account or cookie consent wall as a prerequisite to reading aftercare (keep friction at zero; any legally required notices are a later compliance decision).
- Store medical record content or treatment identity.
- Infer that a specific named person had a specific procedure.

A URL such as `pacificdental.<platform-domain>/extraction` is a **practice/procedure resource**, not a patient chart. Analytics may count that it was viewed, not who viewed it.

### 15.3 Implementation choice is later

This PRD does **not** select:

- first-party event tables vs a privacy-respecting analytics vendor;
- log-based vs pixel vs server-side page-view counts;
- retention windows;
- dashboard UX beyond “operators can inspect basic usage.”

Phase 3 is where analytics become part of commercial MVP completion. Phase 1 should not be blocked on a full analytics product, but architecture should not make anonymous page-view capture unnecessarily hard (for example, public routes should be identifiable by tenant + guide).

---

## 16. Privacy boundary

The MVP deliberately avoids patient accounts and identifiable patient treatment records.

### 16.1 Must not be required for MVP

- patient profile;
- patient login;
- patient name;
- date of birth;
- medical record;
- treatment record;
- patient email;
- patient phone number;
- personalised health record.

Care Guide does **not** need to know which specific patient received an extraction.

### 16.2 Architectural consequence

Public aftercare is keyed by **practice + procedure guide**, not by patient.

Patient-specific aftercare may be considered only in a much later phase, and only if product value justifies the privacy and compliance complexity. Do not design the MVP around it.

### 16.3 Data Care Guide _does_ hold

- practice/tenant configuration and branding;
- canonical clinical-adjacent guide content (platform-owned);
- practice additions / overrides;
- publishing metadata;
- anonymous usage aggregates.

Treat guide content as health-related information with governance (see §13). Treat analytics as non-identifying usage.

---

## 17. Non-functional requirements

### 17.1 Patient experience

- Mobile-first layout and typography.
- Fast first load on a typical phone network.
- Readable contrast and obvious warnings.
- Usable with minimal interaction (scroll + tap-to-call / tap-to-book).
- Revisit-friendly: the same URL remains valid after the treatment day.

### 17.2 Availability of URLs

Published guide URLs are durable commercial artefacts. They must not depend on ephemeral session tokens.

### 17.3 Security

- Tenant isolation in queries.
- No staff session requirement on patient hosts.
- Cookie isolation between admin and patient hosts where practical.
- Public pages must not leak unpublished content, other tenants’ data, or staff-only fields.
- Retired `/display/[token]`, `/sessions`, and `/session` URLs 404. Aftercare launch SEO is **closed in Phase 2A.5**: tenant pages `noindex` by default; marketing indexable; staff/operator private. See [SEO.md](../architecture/SEO.md). Future per-guide opt-in remains post-launch.

### 17.4 Accessibility

Patient pages should meet a practical accessibility bar: semantic headings, sufficient contrast, visible focus, working `tel:` and link targets, and readable font sizes on small screens. A formal WCAG certification is not an MVP gate unless later required.

### 17.5 Operability

- Adding a second practice is data/configuration, not a code fork.
- Local development must be able to simulate tenant hostnames (Phase 1).
- Do not lock hosting to a specific vendor in this PRD.

### 17.6 Internationalisation

Multilingual guides are a future commercial possibility, not MVP. Default language for Dental MVP may be English unless later specified. Do not hard-code a one-language content model that cannot later add locales.

---

## 18. Architecture constraints

These constraints are binding on later implementation. They are not a licence to implement in this documentation phase.

### 18.1 Reusable existing foundation

The following may be reused:

- Next.js App Router
- React
- Tailwind
- PostgreSQL
- Prisma
- `Clinic`
- `User`
- `ClinicMembership`
- existing staff authentication
- general clinic-scoped data patterns

### 18.2 Must not define aftercare

Do not incorporate into the aftercare architecture:

- `ProcedureSession`
- `Doctor` / `Room` as aftercare dependencies
- in-chair stages (`ProcedureStageTemplate` calm/patient/detailed copy)
- `/display/[token]`
- Supabase Realtime
- session stage transitions
- completed-session `aftercareUrl`

**Aftercare must not depend on `ProcedureSession`.**

### 18.3 New domain model required

Aftercare needs its own domain (Guide Template, Practice Guide, branding, contacts, publishing). Do not retrofit chairside stages into aftercare sections.

Do not reuse the name `ProcedureTemplate` for canonical aftercare templates.

### 18.4 Current schema facts (repository truth)

Phase 0 recorded `Clinic` without a tenant slug, branding, or contact profile, and `ProcedureTemplate` as clinic-owned chairside content with an optional external `aftercareUrl`. Aftercare later added its own models. The chairside application was subsequently removed. Dormant `ProcedureTemplate` rows are not the Guide Template library.

### 18.5 Host architecture

```text
app.<platform-domain>          Care Guide / staff administration
<tenant>.<platform-domain>     patient-facing aftercare
```

Do not require the practice slug in the patient URL path for tenant identity.

Do not hard-code the final commercial domain. Do not prematurely lock hosting to Vercel, Cloudflare, or another provider. Specify product requirements; choose infrastructure later.

### 18.6 Multi-tenancy

Application-level tenant isolation is acceptable for MVP if consistent and tested. Do not introduce RLS or other isolation complexity unless justified.

### 18.7 Custom domains

Not MVP. A future premium tier may allow `aftercare.pacificdental.com.au` instead of `pacificdental.<platform-domain>`. Therefore hostname must ultimately be tenant configuration.

### 18.8 Demo and brand assets

Do not use real Pacific Dental (or other unlicensed) brand assets in the product or seed data.

---

## 19. MVP scope

Care Guide MVP is complete when a Care Guide operator can onboard at least two practices as configuration, publish branded dental aftercare guides on tenant hostnames, give each published guide a durable URL and QR code, present a mobile-first anonymous patient experience with contact CTAs, and inspect basic anonymous usage — without patient accounts and without any dependency on `ProcedureSession`.

### 19.1 In scope (agreed ten capabilities)

1. Branded practice subdomain
2. Practice branding / contact / emergency configuration
3. Curated aftercare-guide library
4. Selective procedure enablement
5. Practice additions / overrides
6. Permanent URLs + QR codes
7. Mobile-first patient presentation
8. Call / contact / booking CTAs
9. Basic usage analytics
10. Care Guide operator admin

Plus:

- public tenant homepage of enabled published guides;
- draft / published publishing;
- version-aware provenance direction (see §13);
- Dental as the initial vertical;
- fictional demo tenant for development.

### 19.2 MVP delivery via phases

| Phase | Outcome                                                                                      | Commercial MVP?        |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------- |
| 0     | This documentation / architecture contract                                                   | No                     |
| 1     | One dental tenant technical vertical slice                                                   | No                     |
| 2     | Operator admin operating product                                                             | No                     |
| 3     | Remaining MVP hardening (QR, analytics, second tenant, isolation tests, production concerns) | **Yes, after Phase 3** |

Phase 1 is a **technical vertical slice**, not the completed commercial MVP.

---

## 20. Explicit non-goals

The following are **not** part of the first commercial MVP unless later explicitly brought back into scope:

- patient accounts;
- patient login;
- patient profiles;
- patient health records;
- personalised patient treatment history;
- native patient mobile application;
- provider marketplace;
- provider discovery;
- maps / geospatial search;
- appointment-management replacement;
- practice-management replacement;
- social / community functionality;
- custom customer domains;
- PMS integration;
- automated SMS / email delivery;
- multi-specialty rollout;
- clinic self-service administration;
- billing / subscription automation;
- existing chairside sessions as part of aftercare.

Keep the product narrow.

---

## 21. Success criteria

### 21.1 Technical / product validation

We must be able to prove:

1. A patient can open `<tenant>.<platform-domain>/<guide>` with no authentication.
2. The page immediately presents that tenant’s branding.
3. The guide is useful on a mobile phone.
4. The guide remains useful after the treatment day.
5. A second practice can be configured without forking or duplicating application code.
6. The same canonical guide can be enabled by multiple practices.
7. Each practice can have its own additions / overrides.
8. Publishing controls what patients see.
9. QR code and URL point to the same durable guide.
10. Basic anonymous analytics can measure usage.

### 21.2 Commercial validation

Care Guide should eventually allow us to determine whether practices will pay for:

- professionally presented branded aftercare;
- maintained guide content;
- easier patient access;
- QR distribution;
- practice-specific customisation;
- contact / booking re-engagement;
- basic usage reporting.

This PRD does not define pricing.

---

## 22. Development phases

Use this sequence unless repository evidence later provides a strong reason to adjust.

### Phase 0 — Product reset / architecture contract

**This document.**

Define:

- new product domain;
- terminology;
- boundaries;
- chairside parking;
- aftercare architecture;
- MVP acceptance criteria.

No feature implementation.

### Phase 1 — Branded aftercare vertical slice

Prove **one** dental tenant end-to-end.

Include:

- Clinic tenant slug;
- hostname tenant resolution;
- practice branding;
- contact / emergency configuration;
- new aftercare guide domain model;
- canonical guide;
- clinic enablement;
- clinic-specific additions / overrides;
- draft / published concept;
- public tenant homepage;
- public guide route;
- mobile-first rendering;
- local hostname simulation;
- **no dependency on `ProcedureSession`**.

This is a technical vertical slice, not the completed commercial MVP.

Phase 1 does **not** require the full operator admin product, production domain, hardened QR workflow, or analytics product — except insofar as the public slice must be configurable for that one tenant (seed, fixtures, or minimal internal configuration are acceptable to prove the slice).

### Phase 2 — Care Guide operator admin

Build the internal operating product.

**Phase 2A (implemented locally):** clinic self-service foundation plus platform operator All Clinics. See [WORKING-MEMORY.md](WORKING-MEMORY.md) and [../architecture/CLINIC-PORTAL.md](../architecture/CLINIC-PORTAL.md).

Remaining Phase 2 work includes:

- manage canonical library (beyond listing real templates that already exist);
- generate / access QR codes;
- unpublish / archive lifecycle;
- invitation / user assignment workflow.

No Check-ins, RecoveryPlan persistence, analytics, or billing in 2A.

### Phase 3 — Commercial MVP completion

Complete the agreed MVP with:

- QR workflow hardening;
- basic anonymous analytics;
- analytics by practice / guide;
- second-tenant validation;
- tenant-isolation tests;
- publication / version hardening;
- content review metadata where required;
- slug / hostname validation;
- production domain / deployment configuration;
- appropriate robots / SEO policy;
- production quality / security review.

After this phase, the agreed Care Guide MVP can be considered ready for controlled real-practice testing.

### Later phases (not near-term scope)

- remaining clinic self-service (archive/delete, invitations, teams);
- multi-location practices;
- custom customer domains;
- automated SMS / email delivery;
- multilingual guides;
- advanced analytics;
- subscription / billing;
- PMS integrations;
- patient-specific experiences where justified;
- additional specialties;
- optional chairside product.

Do **not** turn this future list into near-term scope.

---

## 23. Future roadmap

### 23.1 Product expansion

See §8.2 (verticals) and §22 (later phases).

### 23.2 Commercial model direction

Do not create detailed pricing in v1.0.

Expected model: **recurring B2B SaaS**, likely per practice / location.

Potential future plan differentiation (possibilities, not MVP dependencies):

- number of locations;
- guide customisation;
- advanced analytics;
- clinic self-service;
- custom domains;
- multilingual guides;
- SMS / email delivery;
- integrations;
- Care Guide attribution removal.

### 23.3 Custom domains

Future premium example:

```text
aftercare.pacificdental.com.au
```

instead of:

```text
pacificdental.<platform-domain>
```

Not MVP.

### 23.4 Optional chairside add-on

The old chairside workflow was removed as legacy. A future chairside product would be a new decision. It must not be named, positioned, or developed as part of the current aftercare MVP, and it must not revive the removed routes by reusing dormant `ProcedureSession` tables. See §26.

---

## 24. Risks

| Risk                                     | Why it matters                                                                     | Mitigation in this contract                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Chairside gravity                        | Implementers reuse dormant `ProcedureSession` tables because they remain in Prisma | Application removed; aftercare must not depend on those models; new domain model (ADR 0001, 0005, 0009)        |
| Terminology collision                    | `ProcedureTemplate` is mistaken for Guide Template                                 | Distinct glossary; ban on reusing that name for aftercare                                                      |
| Domain / hosting lock-in                 | Premature Vercel/Cloudflare/domain choices                                         | Product requirements only; `<platform-domain>` placeholder                                                     |
| Clinical copy liability                  | Invented or scraped aftercare instructions                                         | No authoritative clinical authoring in Phase 0; no copying from arbitrary websites; governance concepts in §13 |
| Real-brand misuse                        | Using Pacific Dental assets without permission                                     | Conceptual examples only; fictional demo clinic                                                                |
| Privacy scope creep                      | “Personalised aftercare” sneaks into MVP                                           | Hard privacy boundary; no patient PII                                                                          |
| Over-building isolation                  | RLS / complex tenancy delays slice                                                 | App-level isolation acceptable for MVP                                                                         |
| Over-building verticals                  | Several specialties at once                                                        | Dental first                                                                                                   |
| Treating Phase 1 as commercial MVP       | Shipping an incomplete operating product                                           | Phases 1–3 distinguished; ten capabilities required for MVP                                                    |
| Disposable-content modelling             | Overwriting published clinical text                                                | Version-aware publishing direction                                                                             |
| Patient UX copied from chairside display | Large-format session UI reused for phones                                          | Separate UX requirement; mobile-first web                                                                      |
| Analytics identifying patients           | Health-data over-collection                                                        | Anonymous usage only                                                                                           |

---

## 25. Open product decisions

These are intentionally unresolved in PRD v1.0. Implementation must not pretend they are closed.

| ID    | Decision                                                              | Notes                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1  | Commercial `<platform-domain>`                                        | Not selected. Never hard-code a guessed final domain.                                                                                                                                                   |
| OD-2  | Hosting / DNS provider                                                | Undecided. Do not lock the PRD to a vendor.                                                                                                                                                             |
| OD-3  | Exact 3–5 guides for the first technical slice                        | Planning library exists; slice set can be chosen in Phase 1.                                                                                                                                            |
| OD-4  | Canonical-template update rollout UX                                  | The pin invariant is closed: a library update must never silently mutate a published Practice Guide (ADR 0010). Remaining open: notify / auto-draft / freeze UX when a newer canonical revision exists. |
| OD-5  | Operator identity model                                               | **Closed in Phase 2A:** `User.platformRole` `NONE` \| `OPERATOR`, distinct from clinic `ADMIN`. See ADR 0016.                                                                                           |
| OD-6  | Public robots / SEO policy                                            | **Closed in Phase 2A.5:** marketing indexable; staff/operator/preview `noindex`; tenant aftercare `noindex` by default with future opt-in. See [SEO.md](../architecture/SEO.md).                        |
| OD-7  | QR encoding details                                                   | Product requires a QR for the durable URL. Image format, print sizes, and whether a `?src=qr` (or similar) marker is used are implementation/product follow-ups.                                        |
| OD-8  | Analytics implementation                                              | Vendor vs first-party; retention; dashboard density. Product metrics are defined; stack is not.                                                                                                         |
| OD-9  | Demo clinic naming for aftercare                                      | Keep “Rivers Care Demo Clinic” or introduce another fictional aftercare demo. Must not impersonate Pacific Dental.                                                                                      |
| OD-10 | Default language / locale                                             | English assumed for Dental MVP unless later specified.                                                                                                                                                  |
| OD-11 | Attribution copy and placement                                        | Default “Powered by Care Guide”; visual treatment should stay small. Exact placement is design work.                                                                                                    |
| OD-12 | Whether unpublished guide URLs 404 or show a generic unavailable page | Must not show unpublished content. Exact empty/unavailable copy is open.                                                                                                                                |
| OD-13 | Multi-location within one customer                                    | Likely future plan dimension; MVP may be one `Clinic` = one tenant hostname.                                                                                                                            |
| OD-14 | Legal / clinical disclaimer on patient pages                          | Likely needed; exact copy is not in this PRD.                                                                                                                                                           |

---

## 26. Relationship to the removed chairside product

### 26.1 Classification

The chairside / live-session workflow was originally classified as a parked product capability (see [ADR 0009](../adr/0009-existing-chairside-product-is-parked.md)).

**Subsequent product state: removed as legacy.**

Do **not** incorporate it into the aftercare architecture. Do **not** restore the routes, realtime client, or Supabase dependency as part of aftercare work.

### 26.2 What existed (historical repository truth)

Before removal, clinic staff could authenticate and operate a live procedure session:

- staff auth (`/login`, `/dashboard`, Auth.js, `ClinicMembership`) — **this auth remains; it is not chairside**;
- rooms and doctors;
- clinic-owned `ProcedureTemplate` + linear `ProcedureStageTemplate` stages (calm / patient / detailed copy);
- selected-area options;
- `ProcedureSession` (`DRAFT` / `ACTIVE` / `COMPLETED`) with `displayToken`;
- staff control at `/session/[id]/control` and creation at `/sessions/new`;
- patient display at `/display/[token]`;
- Supabase Realtime for live stage updates;
- stage transition history;
- on completion, optional external `ProcedureTemplate.aftercareUrl` (“Open aftercare instructions”).

That last point was a **link out of a completed live session**. It was not Care Guide Aftercare SaaS.

### 26.3 Current repository truth

The application no longer serves chairside screens:

- `/sessions/new`, `/session/[id]/control`, `/display/[token]`, and `/dashboard/procedures` return 404;
- `lib/sessions`, `lib/procedures`, and `lib/realtime` are gone;
- `@supabase/supabase-js` and the Supabase env vars are gone;
- demo seed no longer creates rooms, doctors, or chairside templates.

Dormant Prisma models and their production tables remain (`ProcedureSession`, `ProcedureTemplate`, `Room`, `Doctor`, and related enums). Keeping them avoids a destructive production migration. Do not query them from aftercare. A later reviewed migration may drop them.

### 26.4 Future positioning

A future chairside add-on would be a new product decision. **Do not name or develop that product now.** Do not treat the dormant tables as that product.

### 26.5 Binding architectural rule

The aftercare domain must remain independent from the chairside session domain.

A permanent aftercare guide is not a completed session.

---

## Appendix A — Glossary

See §12.1. Additional removed-domain terms (do not use for aftercare modelling). The Prisma models may still exist as dormant tables:

| Dormant term             | Historical meaning                             |
| ------------------------ | ---------------------------------------------- |
| `ProcedureSession`       | In-chair live procedure instance               |
| `ProcedureTemplate`      | Clinic-owned chairside walkthrough template    |
| `ProcedureStageTemplate` | Ordered in-chair stage with mode-specific copy |
| `displayToken`           | Secret-ish token for `/display/[token]`        |
| `aftercareUrl`           | Optional external URL on a chairside template  |

## Appendix B — Example URLs (non-normative domain)

```text
app.<platform-domain>                         operator / staff admin host
pacificdental.<platform-domain>/              tenant aftercare home
pacificdental.<platform-domain>/extraction    published extraction guide
```

Replace `pacificdental` with the practice tenant slug. Replace `<platform-domain>` when a commercial domain is chosen (OD-1).
