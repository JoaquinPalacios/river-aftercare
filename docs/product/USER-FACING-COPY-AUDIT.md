# User-facing copy audit — 8 October 2026

Starting `main`: `a03cb7871e812460cf94d4cc942f3b6744246f84`.

This audit treats the current application as the product. `docs/product/PRD.md` still describes an earlier Dental-only, single-site direction and is not the public copy source. Public prices and allowances come from `lib/marketing/plans.ts` and `lib/entitlements/plan-policy.ts`. Capacity comes from `lib/clinics/site-location-allowance.ts` and `lib/clinics/group-capacity.ts`. Specialties come from `lib/aftercare/service-category.ts`.

Pages were read in source, including shared components, metadata, empty states, and validation messages. Marketing and patient strings that changed are covered by the existing render tests. Operator and clinic pages were read from the components that own their copy. Legal pages were read and not restyled.

**68 surfaces** are listed below. Dynamic tenants, locations, and guides are representative states, not one row per record. Dialogs and validation messages are recorded with the page that owns them.

## Canonical offering

River Aftercare is operator-assisted aftercare publishing for healthcare practices. A clinic publishes branded guides on its own hostname. Patients open those pages in the browser from a link or QR code. They do not install an app, create an account, or sign in.

What a clinic buys is one of three commercial plans:

| Plan      | Public price                        | What the product actually includes                                                                                                                                                                                                                                                                                   |
| --------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Essential | A$79 per month or A$790 per year    | 1 Clinic Site and 1 Location. Up to 2 original custom guides, 2 editable River Aftercare templates, and 4 clinic-owned guides combined. Up to 2 team members. Branding, curated typography, QR, print/PDF, durable URLs, contact and emergency details, Light / Dark / System. Standard support. No assisted setup.  |
| Practice  | A$149 per month or A$1,490 per year | Same publishing tools, with up to 30 custom guides, 30 editable templates, and 40 clinic-owned guides combined. Up to 5 team members. Assisted setup. Priority support. Included capacity is still 1 site and 1 location. Further locations are arranged with River Aftercare and are not priced on the public page. |
| Group     | Custom pricing                      | Operator-prepared. Public page does not publish the internal catalogue (base A$449 / A$4,490, 2 sites and 5 locations, additional site bundles).                                                                                                                                                                     |

Annual billing is 12 months for the price of 10. There is no free plan, no self-serve trial, and no public checkout. Request a demo and Talk to us go to `/contact`. An operator creates the clinic, chooses Essential, Practice, or Group, and may grant complimentary access or a negotiated price. The clinic administrator accepts the terms and pays in Stripe Checkout. Access follows `invoice.paid`.

Pinned River Aftercare templates used as supplied do not count toward the clinic-owned limits. Drafts and unpublished guides do. Editing a pinned template on Essential or Practice creates the clinic’s own copy and uses an editable-template place. Both plans use the same editor. Group and clinics with no entitlement are not on those numeric caps.

Specialties a site can be classified as: Dental, Physiotherapy, Chiropractic, and Cosmetic & Aesthetic. A clinic can select more than one. Other treatment-based practices can enquire; they are not separate product pages.

Patients receive the published guide: the clinic’s name, logo, colours, terminology, contact, and emergency details, plus the guide sections. Print / Save as PDF uses the same document. QR codes are created by staff from a published guide, not printed on the patient page. The shared demo (`demo` / `demodental`) can show Today and Timeline. That simulated day is a demonstration, not a per-patient recovery record.

Not in the product: patient accounts, check-ins, exercise tracking, messaging, CRM, a practice-management system, a health record, live monitoring, custom domains, public self-serve upgrade from Essential to Practice, moving a Clinic Site into a new Group, and multi-clinic sign-in.

## Canonical terminology

| Use                                                                        | Do not use in public or patient copy                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| River Aftercare                                                            | Care Guide, as the product name                                                          |
| Aftercare guide, patient guide, or the clinic’s chosen instructions label  | A fixed “recovery guide” for every specialty                                             |
| Essential, Practice, Group                                                 | Free plan, trial                                                                         |
| Request a demo                                                             | Book a demo, Buy now                                                                     |
| Clinic-owned guide, custom clinic guide, editable River Aftercare template | “Active custom guides” when drafts also count                                            |
| Assisted setup                                                             | A universal feature of every plan                                                        |
| Clinic Site and Location, in staff and operator tools                      | A claim that every plan includes many locations                                          |
| Complimentary access, negotiated price                                     | A fourth public plan                                                                     |
| Sample, for the demo templates                                             | A claim that the Tooth Extraction or Home Exercise Plan sample is the production library |

Instructions labels a clinic can choose: Aftercare instructions, Post-treatment instructions, Post-procedure instructions, Post-operative instructions, Recovery instructions.

## Corrections

### Homepage pillar — Product inconsistency corrected

- Surface: `/`, “Why clinics use it”
- Previous: the third point was “Assisted setup”
- Now: “Clinic-controlled publishing”
- Reason: Assisted setup is included on Practice and described as custom onboarding on Group. Essential does not include it (`PLAN_COMPARISON_ROWS` in `lib/marketing/plans.ts`).
- Source: `lib/marketing/plans.ts`, `lib/entitlements` is not involved; the comparison row marks Essential as not included.

### Clinic-type plan copy — Product inconsistency corrected

- Surfaces: `/dental`, `/physiotherapy`, `/chiropractic`, `/cosmetic-clinics` (guidance notes, workflow step, and the create/adapt FAQs; dental also has the “how many guides” FAQ)
- Previous: Essential was “up to 2 active custom clinic guides”. Practice was “up to 30 active custom guides, with broader creation and adaptation, local instructions and section controls.” The adapt step said “where your plan allows, local instructions and supported section changes.” Branding FAQs ended with “Practice provides additional branding control” and mentioned only Light and Dark.
- Now: `PUBLIC_PLAN_ALLOWANCE_SUMMARY` — Essential: templates, up to 2 custom guides, up to 2 editable templates, within 4 clinic-owned guides. Practice: up to 30 custom guides, up to 30 editable templates, within 40 clinic-owned guides. The adapt step is “your clinic’s approved instructions.” Branding FAQs say Light, Dark and System are included, and they no longer claim extra Practice branding. The dental count FAQ also says pinned templates used as supplied do not count.
- Reason: Both plans use the same editor, branding, and presentation modes. The difference is the allowance. “Active” contradicted the rule that drafts and unpublished guides count. Pricing tests already forbid “Guide and section controls”, “Local clinic instructions”, “active custom”, and “Richer branding”.
- Source: `lib/entitlements/plan-policy.ts`, `docs/architecture/CLINIC-PORTAL.md` (guide lifecycle), `lib/marketing/plans.ts`.

### Contact title — Copy corrected

- Surface: `/contact` document title
- Previous: “Book a Demo | River Aftercare”
- Now: “Request a Demo | River Aftercare”
- Reason: The page and every commercial CTA say Request a demo. The form sends an enquiry. It does not book a time.
- Source: `app/(marketing)/components/contact-form.tsx`, `LAUNCH_PLANS` CTAs.

### Patient ledes — Product inconsistency corrected

- Surfaces: tenant home, location home, ordinary guide, location guide, print, staff draft preview, operator template preview, empty guide list
- Previous: “Clear recovery information…”, “Recovery information from…”, “Recovery guide from… This page uses the same recovery information…”, and “Contact the practice if you need recovery information after treatment.” Staff preview preferred the short introduction when one was saved.
- Now: the clinic’s instructions label, via `patientIndexLede`, `patientGuideLede`, and `patientPrintLede`. Example: “Clear post-treatment instructions from Riverside Dental Demo.” Preview uses the same guide lede as the public page. The empty list says “Contact the practice if you need them.”
- Reason: The kicker already used the clinic’s label. The lede always said recovery, including for home-care guides and for Post-treatment, Post-procedure, Post-operative, and Aftercare labels. The short introduction is stored and is required to stay off the public page (`tests/practice-guide-lifecycle.test.ts`).
- Source: `lib/aftercare/instruction-terminology.ts`, `app/(aftercare)/_sites/[tenant]/`.

### Operator demo preview — Copy corrected

- Surface: `/operator/templates/[templateId]/demo-preview`
- Previous: “Recovery information from {clinic}, composed from sample revision …”
- Now: “{instructions label} from {clinic}, composed from sample revision …”
- Reason: The designated samples include a home-care guide as well as a recovery guide.
- Source: `lib/aftercare/instruction-terminology.ts`, `lib/demo-adoption/designated-demos.ts`.

### Short introduction — Copy corrected

- Surface: `/guides/[guideId]/edit`
- Previous: the field was labelled “Short introduction” with no explanation.
- Now: “For clinic reference. This text is not shown on the patient page.”
- Reason: The value is saved on the revision and is not rendered on the patient site. Without the note, the field reads as the patient lede.
- Source: `lib/clinic-portal/publish-practice-guide.ts` persists it; `app/(aftercare)` does not render it.

### New custom guide starter — Copy corrected

- Surface: the first section created with Create custom guide
- Previous title and body: “About this guide” / “Add the recovery information your patients should follow after this treatment.”
- Now: “Introduction” / “Add the guidance your patients should follow.”
- Reason: “About this guide” is the platform disclaimer heading, so a new guide started with two identical headings. “Recovery information” is not accurate for every specialty. Existing guides are not rewritten.
- Source: `lib/aftercare/patient-aftercare-disclaimer.ts`, `lib/aftercare/guide-section-kind-label.ts`.

## Route inventory

Disposition key: **OK** reviewed and left unchanged. **Copy corrected** or **Product inconsistency corrected** as above. **Needs product decision** left unchanged and listed again in the next section. **Legal/clinical review recommended** left unchanged. **Source reviewed** means the running browser was not required to judge the string; the owning component was read.

### Marketing

| #   | Surface                                                                  | Disposition                                                                                                  |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | `/` homepage, including how-it-works, clinic types, and closing CTA      | Product inconsistency corrected (Assisted setup). Remainder OK.                                              |
| 2   | `/pricing` plans, comparison, onboarding notes, typography footnote      | OK. Allowances, annual “2 months free”, Group “Custom pricing”, and the scope note match the implementation. |
| 3   | `/contact` form, validation, success state                               | Copy corrected (title only). Form and success copy OK. Success offers Homepage, Dental demo, and Pricing.    |
| 4   | `/about`                                                                 | OK. Responsibility split and exclusions match the product.                                                   |
| 5   | `/clinics` hub                                                           | OK. Four specialties plus an enquiry path for other treatment-based practices.                               |
| 6   | `/dental`                                                                | Product inconsistency corrected. Demo and “not clinically reviewed” wording left in place.                   |
| 7   | `/physiotherapy`                                                         | Product inconsistency corrected. Tracking exclusion and sample-versus-production distinction left in place.  |
| 8   | `/chiropractic`                                                          | Product inconsistency corrected.                                                                             |
| 9   | `/cosmetic-clinics`                                                      | Product inconsistency corrected.                                                                             |
| 10  | Marketing header, Clinics menu, footer, Sign in                          | OK.                                                                                                          |
| 11  | Marketing 404 and error                                                  | OK. `lib/errors/copy.ts`.                                                                                    |
| 12  | `/llms.txt`                                                              | OK. It repeats the public description and the tracking exclusion.                                            |
| 13  | Homepage and pillar decorative URLs `riverside.[your-domain]/extraction` | Needs product decision.                                                                                      |
| 14  | `/sitemap.xml`, `/robots.txt`                                            | OK. Not prose. Titles that changed update `lastModified` for `/`, `/contact`, and the four clinic pages.     |

### Patient

| #   | Surface                                                             | Disposition                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | `https://{site}/` guide index                                       | Product inconsistency corrected.                                                                                                                                                             |
| 16  | `https://{site}/{guide}` ordinary clinic                            | Product inconsistency corrected.                                                                                                                                                             |
| 17  | `https://{site}/{guide}` shared demo, Today / Timeline / Full guide | OK. Demo ledes already distinguish a timeline (“what matters today in your recovery”) from a home-care document. Banner: “Sample content only · Not clinical advice · Changes aren't saved.” |
| 18  | `https://{site}/{guide}/print`                                      | Product inconsistency corrected. “Recovery guide” remains the heading of a recovery-timeline section only.                                                                                   |
| 19  | `https://{site}/{location}` location index                          | Product inconsistency corrected.                                                                                                                                                             |
| 20  | `https://{site}/{location}/{guide}` and its print view              | Product inconsistency corrected.                                                                                                                                                             |
| 21  | Empty published list                                                | Copy corrected.                                                                                                                                                                              |
| 22  | Unknown guide, inactive clinic, unknown host                        | OK. “This aftercare page is not available.”                                                                                                                                                  |
| 23  | Retired hostname 410                                                | OK. “This aftercare page is no longer available.”                                                                                                                                            |
| 24  | Patient error                                                       | OK.                                                                                                                                                                                          |
| 25  | About this guide disclaimer                                         | Legal/clinical review recommended. Wording left unchanged.                                                                                                                                   |
| 26  | Practice header, contact, emergency, Powered by River Aftercare     | OK. Contact actions appear only when the clinic has supplied them.                                                                                                                           |
| 27  | Patient metadata titles                                             | OK. They use the clinic name and instructions label.                                                                                                                                         |

### Clinic and staff

| #   | Surface                                                           | Disposition                                                                                                        |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 28  | `/dashboard` including Getting started and billing notices        | OK. Getting started describes categories, templates, and publication without promising that payment happens there. |
| 29  | `/guides` list, limits, retained guides, empty state              | OK. Usage labels match the allowances (“custom guides”, “editable River templates”, “clinic-owned guides”).        |
| 30  | `/guides/new`                                                     | OK. Sample templates stay off ordinary clinics.                                                                    |
| 31  | `/guides/[guideId]/edit`                                          | Copy corrected (short introduction). Timeline-absent note and unsaved-changes dialog OK.                           |
| 32  | New custom guide starter section                                  | Copy corrected.                                                                                                    |
| 33  | `/guides/[guideId]/preview`                                       | Product inconsistency corrected.                                                                                   |
| 34  | `/practice` profile, branding, members                            | OK.                                                                                                                |
| 35  | `/practice/sites` and `/practice/sites/[siteId]`                  | OK. Site and location language matches the model.                                                                  |
| 36  | `/account` and `/account/security`                                | OK.                                                                                                                |
| 37  | `/account/help`                                                   | OK. Problem, question, and feature suggestion. Success says the message goes to the River Aftercare team.          |
| 38  | `/account/billing`, setup, and complete                           | OK. Checkout failure keeps the saved-details explanation. No public GST label.                                     |
| 39  | Staff navigation, including Help & feedback and View patient site | OK.                                                                                                                |
| 40  | Staff 404 and error                                               | OK.                                                                                                                |
| 41  | Share, copy link, and QR on a published guide                     | OK. QR is a staff action for a published URL.                                                                      |

### Operator

| #   | Surface                                                           | Disposition                                                                                                          |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 42  | `/operator/clinics` Active, Inactive, Archived                    | OK.                                                                                                                  |
| 43  | `/operator/clinics/new`                                           | OK. Practice name, slug, and the four categories.                                                                    |
| 44  | `/operator/clinics/[clinicId]` status, archive, unarchive, delete | OK. Unarchive explains the return to Inactive. Legacy tombstones say “Permanently deleted” and “previous lifecycle”. |
| 45  | `/operator/clinics/[clinicId]/setup`                              | OK. Complimentary or standard subscription, then the administrator invitation.                                       |
| 46  | `/operator/clinics/[clinicId]/team` and invite                    | OK.                                                                                                                  |
| 47  | `/operator/clinics/[clinicId]/split`                              | OK. Operator-only. Not advertised on marketing pages.                                                                |
| 48  | `/operator/templates` list, filters, bulk actions                 | OK.                                                                                                                  |
| 49  | `/operator/templates/new` and duplicate                           | OK. Production or Sample, one active sample per category.                                                            |
| 50  | `/operator/templates/[templateId]` and draft workspace            | OK. Save then Publish. Update live demo only where a designated demo exists.                                         |
| 51  | `/operator/templates/[templateId]/preview` and revision preview   | Product inconsistency corrected (lede).                                                                              |
| 52  | `/operator/templates/[templateId]/demo-preview`                   | Copy corrected.                                                                                                      |
| 53  | `/operator/seo`                                                   | OK. Operator editing of public metadata.                                                                             |
| 54  | Operator navigation                                               | OK. Clinics, Templates, SEO & Discovery.                                                                             |

### Auth, email, and shared errors

| #   | Surface                                                                         | Disposition                                                                                                               |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 55  | `/login`                                                                        | OK.                                                                                                                       |
| 56  | `/forgot-password`                                                              | OK. The success state does not reveal whether the address exists.                                                         |
| 57  | `/reset-password`                                                               | OK.                                                                                                                       |
| 58  | `/accept-invitation`                                                            | OK.                                                                                                                       |
| 59  | `/confirm-email-change`                                                         | OK.                                                                                                                       |
| 60  | Password-reset email                                                            | Source reviewed. OK.                                                                                                      |
| 61  | Invitation email                                                                | Source reviewed. OK.                                                                                                      |
| 62  | Email-change email                                                              | Source reviewed. OK.                                                                                                      |
| 63  | Annual renewal email                                                            | Source reviewed. OK. It states the stored plan and date. It does not invent an amount the local projection does not have. |
| 64  | Price-increase email                                                            | Source reviewed. OK. The sender exists; no route currently inserts a scheduled price change.                              |
| 65  | Contact enquiry email to River                                                  | Source reviewed. OK. Not shown to the clinic.                                                                             |
| 66  | Help and feedback email to River                                                | Source reviewed. OK.                                                                                                      |
| 67  | Global error                                                                    | OK.                                                                                                                       |
| 68  | Confirm, unsaved-changes, publish, and delete dialogs reviewed with their pages | OK, except the starter section and introduction note above.                                                               |

Dialogs and validation messages were read with the page that owns them (contact, guide editor, practice settings, site manager, template lifecycle, team removal, billing setup). They describe the action they perform. No separate route was invented for them.

## Confirmed accurate and left unchanged

`/pricing` is the public commercial source and already matched entitlements: custom versus editable templates, the combined ceiling, team sizes, QR and PDF, Light / Dark / System, assisted setup only on Practice, Group as custom, no GST label, and an explicit exclusion of monitoring, check-ins, CRM, messaging, and PMS integrations.

`/about`, `/clinics`, the homepage hero, and the four clinic-page problem/solution sections describe branded publishing without an app or login. They do not claim outcome statistics, time savings, or clinical results.

Physiotherapy keeps the statements that River Aftercare does not track exercise completion, adherence, or progress, and that the Home Exercise Plan sample is not a production template. Chiropractic and cosmetic pages still say template availability is confirmed during onboarding when no suitable template is available. Dental still says the Tooth Extraction demo is fictional and not clinically reviewed.

Operator clinic lifecycle copy matches Active, Inactive, and Archived, including that unarchive returns the clinic to Inactive and that patient pages stay unavailable until reactivation. Legacy permanently deleted clinics stay on the history view.

Patient 404, 410, and the disclaimer were already specific. The disclaimer was not edited.

## Left unchanged — product, commercial, or legal decision

1. **Practice “Multi-location” is “Talk to us”.** Additional location prices exist in code and are deliberately not shown on the public page. Publishing A$79 / A$59, or saying locations are included, would change the commercial presentation. Left as “Talk to us”.
2. **Group stays “Custom pricing”.** The internal catalogue is 2 Clinic Sites, 5 Locations, and additional site bundles. The application comments say the public page must not import those amounts. Left as custom.
3. **“Practice / location” on the pricing cards.** Essential and the included Practice capacity are one site and one location. The public row does not explain Clinic Site versus Location. Staff and operator screens do. Changing the public label is a positioning choice, not a false number.
4. **Decorative hostname `riverside.[your-domain]/extraction`.** It is an illustration, and tests lock the string. It can be read as a custom domain. Custom domains are not offered. A River Aftercare hostname would be more literal and would also change the designed visual.
5. **“Published physiotherapy templates are available for a clinic to enable.”** The application can enable published non-sample templates. This repository does not contain the production clinical library, so this audit could not confirm that those templates are present in production. The sentence was not weakened and was not strengthened.
6. **Short introduction remains a stored field.** The editor now says patients do not see it. Removing the field, or showing it on the patient page, is a product decision. The lifecycle test requires it to stay off the public page.
7. **About: “Clinic-owned copy and adaptations require appropriate clinical review.”** The software no longer has a review or attestation step before Publish. The sentence reads as the clinic’s responsibility, which matches “your clinic remains responsible”, not as a product workflow. It was not rewritten into a new clinical claim.
8. **Terms, clause on GST “where applicable”.** Public prices are not labelled as including or excluding GST, and the product is not GST-registered. The clause is conditional. It was not edited.
9. **Privacy and Terms generally.** No typo or factual break was clear enough to justify an edit. Both documents should stay with counsel. `TERMS_PAGE_LEGALLY_APPROVED` remains false in code.
10. **Demo Today.** Marketing does not sell Today as a clinic feature. The demo banner says the content is a sample and not clinical advice. Selling per-patient “what matters today” would need a real recovery record, which is not built.

## Legal and clinical claims to keep in review

No new clinical, outcome, compliance, or guarantee claim was added.

These existing passages were left for separate review rather than rewritten:

- Patient “About this guide”: the guide is the practice’s information, it does not replace the treating practitioner, and the reader should follow instructions given directly to them.
- Demo banner and print sample line: “Not clinical advice.”
- Dental demo: “not clinically reviewed.”
- About and the clinic pages: the clinic approves what it publishes and remains responsible for clinical content.
- About exclusions: live monitoring, CRM, health record, messaging, emergency care, and personalised diagnosis or treatment.
- Cosmetic FAQ: no live monitoring and no emergency triage.
- Privacy: aggregated page-view and performance measurement through the hosting provider, and the statement that no service can be guaranteed completely secure.
- Terms: no uptime number, GST where applicable, and Australian Consumer Law guarantees.

No page found in this pass claims a cure rate, a time saving, a percentage, HIPAA compliance, or 24-hour support.

## Shared copy checked before editing

`PUBLIC_PLAN_ALLOWANCE_SUMMARY` is used by the four clinic pages and is derived from the same limits as the pricing cards. Pricing card bullets were not changed. Homepage “Assisted setup” was only the pillar point; the pricing cards and comparison table still say Assisted setup for Practice. Patient ledes go through one helper so the public page, print view, staff preview, and operator template preview stay aligned. The recovery-timeline heading “Recovery guide” was not changed, because that heading is the timeline section, not the whole guide.
