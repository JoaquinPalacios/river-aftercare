# Legal launch requirements — River Aftercare

Public `/privacy` and `/terms` are the current published Privacy Policy and Terms & Conditions (no draft banners). Operator legal-approval flags remain `false` until an explicit approval change. Source robots remain `noindex, follow`.

These documents were updated on 21 September 2026 for the intended Stripe launch state. They are **not** legally approved. Do not merge or deploy them until Joaquín reviews the wording, an Australian solicitor reviews the near-final Terms/Privacy, and the corresponding billing functionality is ready to go live.

## About

Public `/about` is published from factual product docs. It does not claim certification, regulatory approval, customer counts, or health outcomes.

## Privacy

**Status:** Launch-ready published copy at `/privacy`, last updated **21 September 2026**. The public draft banner has been removed. `PRIVACY_PAGE_LEGALLY_APPROVED` remains `false` until an explicit operator/legal-approval change.

The published policy covers operator identity (Pedro Joaquin Palacios, sole trader trading as River Aftercare, ABN 32 671 297 130, Tweed Heads South NSW), privacy contact `admin@riveraftercare.com.au`, scope, current processing, billing identity (including ABN, or ACN where used instead), Stripe-hosted payment credentials, the patient-data boundary, cookies/local browser storage, aggregated hosting analytics, named production providers, overseas processing, security measures, data-breach response, retention (including up to 60 days’ public-guide availability and a separate 30-day export/exit window), access/correction/deletion, complaints, children, and contact.

Named production providers in the public copy: Vercel, Neon (Sydney), Cloudflare (object storage and Turnstile), Resend, Hostinger, Google, and Stripe (payment and billing processor).

Unresolved / do not over-claim:

- GST registration is not in force. River Aftercare is not registering for GST at this stage. Public pricing copy must not claim GST is included or excluded
- counsel-approved APP-entity / NDB applicability language beyond the published “where applicable law requires” wording
- flipping `PRIVACY_PAGE_LEGALLY_APPROVED` or source `noindex` without an explicit decision

Do not treat the page as Privacy Act certification or HIPAA compliance.

## Terms

**Status:** Launch-ready published copy at `/terms`, last updated **21 September 2026**. The public draft banner has been removed. `TERMS_PAGE_LEGALLY_APPROVED` remains `false` until an explicit operator/legal-approval change.

The published terms cover B2B Customer definition (public guide readers are not Customers), Authorised Users subject to plan allowances, clinical responsibility, the patient-data boundary, plan-dependent template use (Essential as supplied; Practice may adapt; Group per Customer Commercial Terms), confidentiality, Stripe-hosted billing in AUD (monthly or annual, charged in advance, automatic renewal, GST where applicable), period-end cancellation including via a billing portal where available, upgrades that may take effect immediately with a prorated adjustment, downgrades at next renewal, failed-payment retry then authoring restriction, up to 60 days’ public patient-guide availability after subscription end, a separate 30-day export window, Australian Consumer Law, NSW governing law with non-exclusive jurisdiction, a mutual liability cap, and mutual third-party indemnities.

Unresolved / do not over-claim:

- GST is not being charged at this stage (public copy says GST will be charged where applicable; do not add including-GST or excluding-GST price labels)
- flipping `TERMS_PAGE_LEGALLY_APPROVED` or source `noindex` without an explicit decision
- treating the page as counsel-certified or as a finished substitute for Customer Commercial Terms

## Medical / content disclaimer

Real-clinic published-guide pages, print, and authenticated preview that reuses `PatientPage` show a platform-level **About this guide** disclaimer. Copy is fixed product wording, not clinic-configurable, and not River Aftercare clinical review. Clinic-authored emergency instructions remain separate. `demodental` keeps its existing sample / not-clinical-advice messaging and does not receive this disclaimer.

This is **not** counsel-approved legal copy. Operator legal-approval flags were not changed. A reviewed legal pack remains outstanding.

## Launch TODO (do not fabricate)

| Fact                     | Repository truth                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legal entity name        | **Pedro Joaquin Palacios**, sole trader trading as River Aftercare                                                                                                                                                                                              |
| ABN                      | 32 671 297 130                                                                                                                                                                                                                                                  |
| ACN                      | Not applicable for the seller — not currently an Australian company. Customer billing identity may use an ACN where the customer has no ABN.                                                                                                                    |
| Public location          | Tweed Heads South, New South Wales, Australia (no residential street address)                                                                                                                                                                                   |
| Governing law            | New South Wales, Australia (non-exclusive jurisdiction)                                                                                                                                                                                                         |
| Legal / privacy email    | `admin@riveraftercare.com.au`                                                                                                                                                                                                                                   |
| GST registration         | **Not registered.** Not registering for GST at this stage. Do not charge GST or plan Stripe Tax. Public pricing copy must not claim GST is included or excluded. Terms remain “GST will be charged where applicable.”                                           |
| Production subprocessors | Named in `/privacy`: Vercel, Neon, Cloudflare, Resend, Hostinger, Google, and Stripe (payment/billing). Stripe Billing Phase 1 (test-mode webhook projection) exists in the app; Checkout, Customer Portal, live payments, and enforcement are not implemented. |
