# Legal launch requirements — River Aftercare

Public `/privacy` and `/terms` are published without a draft banner. On 28 November 2026 the owner confirmed legal approval of the Terms and Privacy text dated **28 November 2026**. That confirmation covers the wording already deployed. This record does not change the legal wording, `TERMS_ACCEPTANCE_VERSION`, `PRIVACY_ACKNOWLEDGEMENT_VERSION`, or any stored `LegalAcceptance` row.

`LEGAL_DOCUMENT_STATUS` is `OWNER_APPROVED`. `TERMS_PAGE_LEGALLY_APPROVED` and `PRIVACY_PAGE_LEGALLY_APPROVED` are `true`. Source robots for both pages are `index, follow`. A route is included in the sitemap when `resolveMarketingSeo(...).robots.index` is true, so `/privacy` and `/terms` are included. `lastModified` stays `2026-11-28`. A stored `MarketingPageSeo.index` value still overrides that code default. `llms.txt` continues to list both paths. `robots.txt` already allows them.

Do not enable `REGISTRATION_ENABLED`. Do not enable `STRIPE_PROMOTIONAL_REDEMPTION_ENABLED`, `STRIPE_PROMOTIONAL_REDEMPTION_LIVE_ENABLED`, or `STRIPE_PROMOTION_WITH_TRIAL_ENABLED`.

## Document versions

| Document | Last updated         | Acceptance identifier                          | Previous published version             |
| -------- | -------------------- | ---------------------------------------------- | -------------------------------------- |
| Terms    | **28 November 2026** | `TERMS_ACCEPTANCE_VERSION` `2026-11-28`        | `2026-10-01`, and earlier `2026-09-21` |
| Privacy  | **28 November 2026** | `PRIVACY_ACKNOWLEDGEMENT_VERSION` `2026-11-28` | `2026-09-21`                           |

The version identifier is the document's last-updated ISO date in `lib/legal/status.ts`. New registration intents store the versions current at submission. Provisioning writes those stored versions on a `LegalAcceptance` row with source `REGISTRATION`. Billing setup writes a separate append-only row with source `BILLING_CHECKOUT` for the versions current at that acceptance. Checkout looks for the current `BILLING_CHECKOUT` versions. It does not treat a `REGISTRATION` row as Checkout acceptance.

Historical rows are not rewritten. Accepting `2026-11-28` does not replace a stored `2026-10-01` or `2026-09-21` row. This change does not add a prompt that forces an already active subscriber to accept again. A later Checkout, and any flow that already requires the current billing acceptance, uses `2026-11-28`.

## What changed on 28 November 2026

The 21 September 2026 Privacy Policy and the 1 October 2026 Terms described the intended Stripe launch shape. Self-service registration, hosted Checkout, the Customer Portal, subscription enforcement, and the catalogue trial have since been implemented and exercised in Stripe Sandbox. The 28 November wording corrects clauses 18, 19, 20, and 22 of the Terms, the directly related cross-references, and the Privacy Policy passages that were no longer accurate. Numbering, defined terms, the business identity, New South Wales governing law, the mutual liability cap, the Australian Consumer Law clause, and the no-cancellation-fee rule are unchanged.

Terms corrections:

- A standard 14-day free trial for an eligible new Essential or Practice clinic, monthly or annual.
- No trial where the clinic has already had a subscription or has already started a trial. If that history cannot be confirmed, the trial does not start and payment is not opened.
- Group, complimentary access, negotiated prices, and other Customer Commercial Terms are not the standard trial.
- The standard trial is not described as a public promotion code. Promotional redemption stays disabled.
- A payment method is collected through Stripe before the trial starts. Access during the trial begins when the subscription is verified with a payment method, not when a subscription fee is collected. There is no subscription fee during the trial.
- Unless cancelled before the trial ends, the trial converts to a paid subscription. The first subscription payment becomes due at the trial end, at the price disclosed during billing setup. These Terms do not hardcode a price.
- Currency remains Australian dollars. The tax sentence remains “GST will be charged where applicable.” No GST registration claim, Stripe Tax claim, or inclusive/exclusive price label was added.
- Cancellation is online from Billing, using Manage billing, which opens the billing portal. There is no cancellation fee and no separate River Aftercare approval.
- A trial cancelled before the first charge keeps access until the trial ends and does not create the first subscription charge.
- A paid subscription cancelled at period end keeps access through the paid-through date, and future recurring charges stop.
- Past-due payment keeps access while recovery continues. An unpaid subscription may restrict editing and other workspace access. Billing stays open so the customer can update the payment method. No fixed retry count or grace period is promised.
- Published guides ordinarily remain while access is only restricted for non-payment. The up-to-60-day public-guide window starts when the subscription ends. A collected paid period is measured from the end of that paid period. A never-paid trial is measured from the end of the subscription. Public availability is not deletion.
- The separate 30-day export window is a request to `admin@riveraftercare.com.au`, including after a never-paid trial. There is no automated download and no automated deletion facility. The Terms do not promise deletion on a particular day.
- Stripe currently sends the billing notices: seven days before a trial ends, seven days before an upcoming renewal, and a notice when a card or Australian bank debit fails. Those are operational settings, not a contractual guarantee, and not a River Aftercare 30-day annual reminder.
- The billing portal does not change plan. An upgrade, or a plan change the Service does not offer, may require assistance. A downgrade the Service offers is scheduled from Billing and takes effect at the next renewal.

Privacy corrections, and only those:

- Clinic registration fields, hashed password, email-confirmation link, and later password-reset or email-change messages.
- Cloudflare Turnstile on registration as well as the Contact form. Form contents are not sent to Turnstile.
- Free-trial status as subscription information. Full card and bank-account details remain with Stripe.
- Resend for registration confirmation and account-security email. Stripe sends invoice and payment-failure email, and may send the trial-ending and upcoming-renewal notices. River Aftercare does not send a second payment-failure email.
- The same 60-day / 30-day distinction as the Terms, including a never-paid trial. The 30-day export is a request to `admin@riveraftercare.com.au`. There is no automated download or deletion facility, and no promise of deletion on a fixed day.

## Sandbox acceptance already completed

On 28 November 2026, Essential and Practice completed autonomous registration, 14-day trial activation, collection, renewal, and cancellation in Stripe Sandbox account `acct_1UILQNGYMJ0lopfP`. Group stayed operator-prepared. The object record is in [../architecture/BILLING.md](../architecture/BILLING.md). That record is product evidence for this wording. It is not legal approval, and it was not a Production or live-Stripe test.

Implemented behaviour this wording relies on:

- Eligible Essential and Practice Checkout uses `trial_period_days: 14` and `payment_method_collection: always` for card and AU BECS. Catalogue Prices themselves do not carry a trial.
- A trialing subscription with a default payment method becomes `ACTIVE` / `TRIALING`. Missing payment-method evidence does not open the workspace. `checkout.session.completed` alone does not. The opening A$0 invoice does not set `paidThrough`.
- A prior Stripe subscription, or a stored `trialEndsAt`, withholds another trial. A missing or failed history lookup refuses Checkout.
- Cancel at period end during the trial keeps access until the subscription ends and does not charge. A never-paid deletion leaves `paidThrough` empty. `publicGuideRetentionUntil` is 60 days from `paidThrough` when that date exists, otherwise from the subscription end.
- `PAST_DUE` keeps entitlement `ACTIVE`. Terminal `unpaid` becomes `RESTRICTED`: product routes close, Billing stays open, and already-published guides stay up because retention is evaluated only once entitlement is `ENDED`.
- Manage billing opens the Stripe Customer Portal only when the configuration allows invoices, payment-method updates, and cancel-at-period-end. Plan switching in the portal stays off.
- Plan changes are refused while the trial end is still in the future.
- There is no self-service export and no job that deletes account data on day 31 or unpublishes guides on a cron. Public-guide availability is checked on the patient request.

## Inconsistencies reported, not patched in the product

- The 30-day export is a request to `admin@riveraftercare.com.au`, the address already named in clause 32 and the Privacy Policy. The application has no export action, no download, and no 30-day timer. What can be provided, where an operator can extract it, is Customer Content and clinic configuration already held for that clinic: clinic-created or clinic-adapted guides, clinic information, and branding. Full card and bank details stay with Stripe. Do not read clause 22 as a claim that a download exists.
- “May delete” account data after that request period is permission. Nothing in the application deletes operational clinic data automatically when the 30 days pass. The Terms and Privacy Policy now say there is no automated deletion facility. Public-guide removal after 60 days is implemented separately and does not delete the account.
- Clause 19 no longer promises a River Aftercare reminder about 30 days before an annual renewal, and it no longer says there is no extra reminder before a monthly renewal. The in-product annual notice and `GET /api/cron/billing-notices` still exist, and `vercel.json` still does not schedule that route. This change does not schedule it and does not treat it as a customer promise. The wording records the Stripe Live customer-email settings supplied for this correction: a trial-ending reminder seven days before expiry, upcoming-renewal notifications enabled, the upcoming-renewal event seven days before renewal, and failed card and bank-debit notifications enabled. Those are current operational settings, not a guarantee that the period will stay seven days.
- “An upgrade to a higher plan may take effect immediately” remains the commercial rule where an upgrade is made. The implemented immediate upgrade is operator-assisted Essential to Practice. The billing portal does not switch plans. The Terms now say an upgrade, or a plan change the Service does not offer, may require assistance. The self-service Practice to Essential downgrade is scheduled from Billing and still takes effect at the next renewal, with no automatic pro-rata refund. Monthly and annual switching is not implemented.
- Stripe’s retry timing is not fixed in this repository. The Terms do not state a grace period or a retry count. Confirm the live Stripe dunning settings before launch and do not add a day count unless those settings are verified.
- Neon point-in-time history was observed at about 6 hours in an earlier check. The Privacy Policy does not turn that observation into a backup-retention promise. It still says provider backups follow the provider’s normal cycle.

## Current law and later subscription rules

This section is a review note. It is not legal advice and it does not say the drafts comply.

Current, already in force:

- [Australian Consumer Law](https://www.accc.gov.au/business/selling-products-and-services/contracts) guarantees and remedies can apply to a business customer. Clause 24 keeps those rights, including the section 64A services limit where it is available. Many clinic subscriptions are well under the ACL monetary threshold. Do not describe the Service as outside the consumer guarantees merely because the customer is a clinic.
- Unfair contract terms in standard form contracts have applied, with penalties, since 9 November 2023. A small-business contract can qualify where the business has fewer than 100 employees or its annual turnover is under $10 million. The ACCC’s contract guidance treats a unilateral price change as less likely to be unfair where the customer can end the contract without penalty. Clause 23 gives at least 30 days’ direct notice of a recurring-price increase and a cancellation right with no cancellation penalty. That is not a finding that every term is fair.
- The ACCC does not give legal advice on an individual contract. Only a court decides whether a term is unfair.

Not yet in force:

- The [Competition and Consumer Amendment (Unfair Trading Practices) Act 2026](https://www.legislation.gov.au/C2026A00064/asmade) (No. 64, 2026, assented 6 July 2026) commences as a whole on **1 July 2027**.
- New subscription-contract rules include section 48B (a free introductory period that converts to an automatic payment is a subscription contract), section 48D (disclosure when offering), section 48E (prescribed information while the contract is in effect, and only where regulations prescribe the contract and it meets the consumer or small-business requirement), and section 48F (an easy, straightforward exit, online if the contract is entered online).
- The application provision in the Act expressly applies sections 48B, 48E, and 48F to contracts entered on or after commencement, and to earlier contracts only when renewed, extended, continued, or varied on or after that date. Section 48D is not named in that application provision. Counsel should confirm when the offer-stage disclosure rule attaches.
- Section 48F’s small-business test matches the unfair-contract threshold: a standard form contract and either fewer than 100 employees or turnover under $10 million. Most clinic customers should be assessed as if they qualify. The consumer test is personal, domestic, or household use. The unfair-trading-practice prohibition is also limited to consumers and does not apply to a supply in the course of the consumer carrying on a business, or where the consumer is a body corporate.
- Regulations can still prescribe the manner and content of disclosure and of ongoing notices. Those instruments were not treated as settled by this wording.

Readiness before 1 July 2027, without claiming the drafts already satisfy the new Act:

- The trial-to-paid conversion, the disclosed price, the billing period, and the cancellation path are now stated in the Terms and on the billing page.
- Cancellation is online: Billing, then Manage billing, then the Stripe portal’s cancel-at-period-end flow. There is no fee and no operator approval. Counsel should decide whether the Stripe step is “only steps that are reasonably necessary” under section 48F.
- The current ongoing billing notices are Stripe’s, at seven days before trial end and seven days before renewal, plus failed card and bank-debit notices. Section 48E does not operate until a contract is prescribed and the Act has commenced. Counsel should say whether a different period is required before then, or once regulations exist. The unscheduled River Aftercare annual-notice handler is not that notice.
- No clause was rewritten into a “subscription contract” label. Adding that label before counsel settles section 48D would get ahead of the statute.

[OAIC Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles) guidance was used only as the current principles framework. The drafts do not say River Aftercare is an APP entity, is exempt, or is certified.

## Questions for an Australian solicitor

1. Privacy Act 1988 (Cth): does the small-business exemption apply, and does any health-service, health-information, or other exception displace it? The product forbids identifiable patient information and is not a health record, but free-text guide fields can receive it if a clinic ignores that rule.
2. Which state and territory health-records laws apply in addition to the named Health Records and Information Privacy Act 2002 (NSW), given clinics and readers may be outside New South Wales?
3. Is “GST will be charged where applicable” the right customer sentence while River Aftercare is not registered for GST, is not charging GST, and rejects a Stripe Price with inclusive tax behaviour? Do not add an including-GST or excluding-GST price label unless counsel and the accountant both ask for it.
4. Unfair contract terms: liability cap, no pro-rata refund of a paid period, suspension discretion, early removal of public guides, and the “may delete” retention sentence. The cancellation-without-fee and price-increase notice were kept.
5. From 1 July 2027: whether these subscription contracts meet the small-business requirement; when section 48D applies; what regulations require beyond this wording; and whether Billing → Manage billing → Stripe portal is a straightforward online exit.
6. Whether Stripe’s current seven-day trial-ending and seven-day renewal notices, together with failed card and bank-debit notices, are a sufficient operational notice. The drafts do not guarantee that period, and they no longer promise a separate 30-day annual reminder. Also confirm that a request to `admin@riveraftercare.com.au` for guides, clinic information and branding, with no automated download or deletion, is the export and deletion position to publish.
7. Whether a never-paid trial’s 60-day public-guide window, measured from subscription end, is the retention position counsel wants published.

## Outstanding production checks

These are launch gates. This change does not perform them.

- Owner approval of the 28 November 2026 Terms and Privacy wording is recorded. `TERMS_PAGE_LEGALLY_APPROVED` and `PRIVACY_PAGE_LEGALLY_APPROVED` are true, `LEGAL_DOCUMENT_STATUS` is `OWNER_APPROVED`, and both pages are `index, follow` and included in the sitemap. The wording and historical acceptance rows were not changed.
- `REGISTRATION_ENABLED` stays off until the registration launch checklist in [REGISTRATION-SECURITY.md](REGISTRATION-SECURITY.md) is done, including the registration migration and real Turnstile keys.
- Promotional redemption flags stay off. Public pages advertise the 14-day trial only.
- Stripe Live prices, portal configuration, and dunning. The customer-email settings recorded here were supplied for this wording and were not re-checked from this environment. Sandbox evidence is not live configuration.
- Do not schedule `GET /api/cron/billing-notices` in order to perform a 30-day annual reminder. The Terms do not promise that email.
- Confirm Resend, Neon Sydney, Cloudflare, Vercel, Hostinger, and Google remain the providers named in the Privacy Policy. Do not add a provider, a region, or a certification that has not been verified.

## About

Public `/about` is published from factual product docs. It does not claim certification, regulatory approval, customer counts, or health outcomes.

## Medical / content disclaimer

Real-clinic published-guide pages, print, and authenticated preview that reuses `PatientPage` show a platform-level **About this guide** disclaimer. Copy is fixed product wording, not clinic-configurable, and not River Aftercare clinical review. Clinic-authored emergency instructions remain separate. `demodental` keeps its existing sample / not-clinical-advice messaging and does not receive this disclaimer.

This disclaimer is not counsel-approved.

## Launch facts

| Fact                                         | Repository truth                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legal entity name                            | **Pedro Joaquin Palacios**, sole trader trading as River Aftercare                                                                                                                                                                                                                                        |
| ABN                                          | 32 671 297 130                                                                                                                                                                                                                                                                                            |
| ACN                                          | Not applicable for the seller. A customer may supply an ABN or an ACN. Neither is required.                                                                                                                                                                                                               |
| Public location                              | Tweed Heads South, New South Wales, Australia                                                                                                                                                                                                                                                             |
| Governing law                                | New South Wales, Australia, non-exclusive jurisdiction                                                                                                                                                                                                                                                    |
| Legal / privacy email                        | `admin@riveraftercare.com.au`                                                                                                                                                                                                                                                                             |
| GST                                          | **Not registered.** Not registering at this stage. Do not charge GST or enable Stripe Tax. Public prices must not say GST is included or excluded. Terms stay “GST will be charged where applicable.”                                                                                                     |
| Registration                                 | Implemented. Production flag `REGISTRATION_ENABLED` stays off until the launch checklist is approved.                                                                                                                                                                                                     |
| Promotional redemption                       | Implemented only behind disabled flags. Do not describe it as publicly available.                                                                                                                                                                                                                         |
| Billing                                      | Stripe-hosted Checkout, Customer Portal, entitlement enforcement, and the 14-day catalogue trial are implemented. Sandbox acceptance on 28 November 2026 is recorded in [../architecture/BILLING.md](../architecture/BILLING.md). Live Stripe and production enforcement are not verified by this change. |
| Legal approval                               | Owner confirmed on 28 November 2026. `TERMS_PAGE_LEGALLY_APPROVED=true`, `PRIVACY_PAGE_LEGALLY_APPROVED=true`, `LEGAL_DOCUMENT_STATUS=OWNER_APPROVED`. Both pages are `index, follow` and are included in the sitemap. Wording and acceptance versions stay `2026-11-28`.                                 |
| Production subprocessors named in `/privacy` | Vercel, Neon (Sydney), Cloudflare, Resend, Hostinger, Google, and Stripe.                                                                                                                                                                                                                                 |
