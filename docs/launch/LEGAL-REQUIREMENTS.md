# Legal launch requirements — River Aftercare

Public `/privacy` is the current published Privacy Policy (no draft banner). Public `/terms` remains a **production-facing draft for legal review**. Terms do not complete the production launch gate and have **not** received final legal approval.

## About

Public `/about` is published from factual product docs. It does not claim certification, regulatory approval, customer counts, or health outcomes.

## Privacy

**Status:** Published at `/privacy` on 19 September 2026. The public draft banner has been removed. `PRIVACY_PAGE_LEGALLY_APPROVED` remains `false` until an explicit operator/legal-approval change.

The published policy covers operator identity (Pedro Joaquin Palacios, sole trader trading as River Aftercare, ABN 32 671 297 130, Tweed Heads South NSW), privacy contact `admin@riveraftercare.com.au`, scope, current processing, the patient-data boundary, cookies/local browser storage, aggregated hosting analytics, named production providers, overseas processing, security measures, data-breach response, retention, access/correction/deletion, complaints, children, and contact.

Named production providers in the public copy: Vercel, Neon (Sydney), Cloudflare (object storage and Turnstile), Resend, Hostinger, and Google.

Unresolved / do not over-claim:

- GST registration status (not stated in public copy)
- counsel-approved APP-entity / NDB applicability language beyond the published “where applicable law requires” wording
- flipping `PRIVACY_PAGE_LEGALLY_APPROVED` or source `noindex` without an explicit decision
- `/terms` still uses `[FULL LEGAL NAME]` and `[PRIVACY EMAIL]` placeholders

Do not treat the page as Privacy Act certification or HIPAA compliance.

## Terms

**Status:** Production-facing draft implemented at `/terms`. **LEGAL REVIEW STILL REQUIRED.** Not approved. The draft banner remains.

The published draft covers B2B Customer definition (public guide readers are not Customers), clinical responsibility, patient-data boundary, invoice billing in AUD (monthly in advance, 14-day payment, bank transfer initially), month-to-month subscription, cancellation at period end, overdue suspension after notice, NSW governing law with non-exclusive jurisdiction, liability cap, and a narrowed third-party indemnity.

Unresolved before production:

- full legal name of the sole trader in the Terms placeholders
- River Aftercare business-name registration status
- GST registration status
- legal/privacy email in the Terms draft (Privacy already uses `admin@riveraftercare.com.au`)
- counsel review of limitation of liability, indemnity, and Terms generally

Do not treat the draft as a finished contract.

## Medical / content disclaimer

Patient pages already avoid invented clinical authority. A reviewed disclaimer for clinic-published instructions remains part of the legal pack.

## Launch TODO (do not fabricate)

| Fact                     | Repository truth                                                               |
| ------------------------ | ------------------------------------------------------------------------------ |
| Legal entity name        | Privacy names **Pedro Joaquin Palacios**. Terms still show `[FULL LEGAL NAME]` |
| ABN                      | 32 671 297 130                                                                 |
| ACN                      | Not applicable — not currently an Australian company                           |
| Public location          | Tweed Heads South, New South Wales, Australia (no residential street address)  |
| Governing law            | New South Wales, Australia (non-exclusive jurisdiction)                        |
| Legal / privacy email    | Privacy uses `admin@riveraftercare.com.au`. Terms still show `[PRIVACY EMAIL]` |
| GST registration         | Unknown — public copy says GST will be charged where applicable                |
| Production subprocessors | Named in `/privacy`: Vercel, Neon, Cloudflare, Resend, Hostinger, Google       |
