# Stripe TEST MODE setup — River Aftercare Billing

**Status:** Operator documentation for manual Dashboard configuration. This repository does not create Stripe Dashboard objects, live-mode keys, or charges.

Phase 1 ships the webhook endpoint and local projection. Phase 2 ships demo-approved hosted Checkout (card + AU BECS) for an operator-prepared Essential or Practice offer. Do **not** enable live mode. Do **not** configure GST, Stripe Tax, or Tax Invoice extras. Accountant approval to register has been received; GST implementation is a separate task and public prices still make no GST claim.

Safe testing uses a local or other non-production database, Stripe TEST MODE keys, and Stripe CLI webhook forwarding. Do not point test Checkout or test webhooks at production Clinic billing records. Vercel Preview should receive test keys only when that preview uses a non-production database.

Related: [BILLING.md](../architecture/BILLING.md), [LEGAL-REQUIREMENTS.md](LEGAL-REQUIREMENTS.md), `.env.example`.

## Products and Prices (TEST MODE)

Create two Products. Monthly and yearly are Prices on the same Product. Currency **AUD**. Do not mark tax inclusive. Do not attach a GST tax rate. Do not enable automatic tax.

| Product                   | Recurring Price |
| ------------------------- | --------------- |
| River Aftercare Essential | A$79 / month    |
| River Aftercare Essential | A$790 / year    |
| River Aftercare Practice  | A$149 / month   |
| River Aftercare Practice  | A$1,490 / year  |

Do **not** create a Group Product or Group Price. Group remains custom / operator-managed.

Copy the four resulting `price_...` identifiers into server-only environment variables:

- `STRIPE_ESSENTIAL_MONTHLY_PRICE_ID`
- `STRIPE_ESSENTIAL_YEARLY_PRICE_ID`
- `STRIPE_PRACTICE_MONTHLY_PRICE_ID`
- `STRIPE_PRACTICE_YEARLY_PRICE_ID`

Never commit secrets or Price IDs. Never prefix these with `NEXT_PUBLIC_`.

Vercel Preview should use **test-mode** keys and test Price IDs only. Phase 1 refuses live `sk_live_` / `rk_live_` secrets.

Prefer a restricted test key (`rk_test_...`) with Billing, Checkout, Customers, and webhook read access over an unrestricted `sk_test_...`.

## Payment methods

Phase 2 Checkout sends an explicit allow-list:

- `card`
- `au_becs_debit`

`payment_method_types` is set on the Checkout Session so Dashboard dynamic methods cannot add Afterpay, PayPal, BNPL, or cash. Link wallets are not offered (`wallet_options.link.display` `never`). Stripe still shows its own BECS mandate. River does not recreate that text.

Also enable card and Australian BECS Direct Debit in the TEST MODE Payment Method Configuration. BECS identity verification on the Stripe account may be required before BECS appears. That remains a Dashboard task.

Do not enable Stripe Tax. Do not add a GST rate.

## Webhook endpoint

Production (staff host only; marketing and tenant hosts 404 `/api/*`):

```text
https://app.riveraftercare.com.au/api/stripe/webhook
```

Local development with Stripe CLI:

```text
stripe listen --forward-to http://app.localhost:3000/api/stripe/webhook
```

Use the CLI signing secret (`whsec_...`) in local `STRIPE_WEBHOOK_SECRET`. That secret is not the Dashboard endpoint secret.

Subscribe to at least:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `subscription_schedule.updated`
- `subscription_schedule.released`
- `subscription_schedule.completed`
- `subscription_schedule.canceled`

Do **not** subscribe to `invoice.created` unless River later mutates draft invoices. A failing `invoice.created` listener can delay automatic finalization.

Pin the Dashboard endpoint API version to the Stripe Node SDK default for this repository: **`2026-08-26.dahlia`** (`stripe@22.6.2`, `Stripe.API_VERSION`). Do not copy an older version from a blog post.

## Authoritative paid signal

`checkout.session.completed` means Checkout was submitted. It is **not** proof that a delayed method such as BECS has settled.

River activates paid entitlement from **`invoice.paid`**, after the Price ID maps to Essential or Practice, and never from Checkout completion alone.

## Customer Portal — Phase 3 (manual TEST MODE configuration)

River does not create the Portal configuration. Joaquín creates one Billing Portal configuration in **TEST MODE** and stores its id in `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` (`bpc_...`). The app retrieves that configuration before every session and refuses to open the portal if it does not match the settings below. There is no fallback to the Stripe account default.

Do not enable the hosted portal login page. A login link would let someone reach the portal with the billing email and skip River’s clinic-admin check.

In Stripe Dashboard → Settings → Billing → Customer portal, create a configuration (or edit a non-default one) with:

| Capability                            | Setting                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Invoice history                       | Enabled                                                                                                      |
| Payment method update                 | Enabled                                                                                                      |
| Customer information updates          | Off, or on without **Tax ID**                                                                                |
| Cancellation                          | Enabled                                                                                                      |
| Cancellation mode                     | At period end (`at_period_end`)                                                                              |
| Cancellation proration                | None (`none`). Do not use `create_prorations` or `always_invoice`.                                           |
| Cancellation reasons                  | Optional. Collecting a reason does not change the period-end rule.                                           |
| Subscription updates / plan switching | **Disabled**                                                                                                 |
| Quantity / seat changes               | Disabled (they live under subscription updates)                                                              |
| Promotion codes                       | Disabled (they live under subscription updates)                                                              |
| Trials                                | Not offered. Do not enable subscription updates.                                                             |
| Hosted portal login page              | **Disabled**                                                                                                 |
| Default return URL                    | May be left blank. River sets `return_url` to the staff-host `/account/billing` when it creates the session. |

Copy the configuration id into server-only `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID`. Never prefix it with `NEXT_PUBLIC_`. Do not create this configuration in live mode as part of Phase 3.

Essential → Practice is an operator action in River, not a Portal plan switch. It updates the existing subscription item to the Practice price for the current interval, with `proration_behavior=always_invoice`, `payment_behavior=pending_if_incomplete`, and `billing_cycle_anchor=unchanged`. Monthly ↔ annual is not a Portal or operator action. A later self-service Essential → Practice upgrade should reuse that engine.

Practice → Essential is self-service for a clinic ADMIN on `/account/billing`, scheduled for the next renewal of the same interval. Do not enable Portal subscription updates to do it. The operator clinic page shows the preparation, selection, and scheduled date, and does not approve the change. The schedule events above let River reconcile cancellation against that schedule. The actual plan change is still projected from `customer.subscription.updated`, `invoice.paid`, and `invoice.payment_failed` when the Essential Price appears. Returning from the portal does not change River entitlement; the webhook does.

## GST / tax

Accountant approval to register for GST has been received. Do not configure Stripe Tax, a 10% GST rate, or Tax Invoice wording in the downgrade work. That is a separate task after the ATO effective date is known. Public prices stay the current AUD amounts with no GST claim.

## Phase 5 Sandbox acceptance — do not use live mode

Use Stripe **test mode** and a non-production database. Apply `prisma/migrations/20260923200000_add_scheduled_plan_downgrade`, `prisma/migrations/20260923220000_add_downgrade_guide_selection`, and `prisma/migrations/20260924010000_add_plan_downgrade_attempt` only on that database. Do not change the live Portal configuration, live Prices, or production data.

Scheduling again after Keep Practice allocates a new attempt id and checks the live Stripe schedule before River shows a scheduled downgrade. A failed schedule attempt keeps the confirmed guide selection. If a disposable local clinic was left on “Waiting for clinic administrator to choose guides” with an empty keep-set, confirm the test selection again. Do not backfill that row.

Guide selection on a disposable local Practice clinic, before any further Stripe action:

1. Create 5 original custom guides and 4 edited River-template copies. Essential base is 2, 2, and 4 combined.
2. As clinic ADMIN, open `/account/billing` and choose **Review downgrade**. River must not call Stripe, and `commercialPlan` stays Practice. The operator clinic page should say the customer is preparing the move, with no Prepare, Schedule, or Keep Practice button.
3. Choose 3 custom guides and confirm. River rejects it.
4. Choose 2 custom guides and 2 edited templates and confirm. Billing should say guide selection is confirmed. The operator panel should say guide selection is complete.
5. Choose **Schedule downgrade** on Billing. River stays Practice. The Stripe schedule shape is the one already accepted in Sandbox. No operator action is required.
6. Choose **Keep Practice** on Billing. Preparation and the keep-set are cleared. No guide is retained or deleted.

The current Sandbox subscription already has an attached intermediate schedule from a failed update (`sub_sched_1UJ119GYMJ0lopfPkhOj7nLh`, attempt `c14dbe30-ecfe-4136-8899-a2de4179b408`). Do not release it first. As clinic ADMIN, open Billing, confirm the saved guide selection is still there, and choose **Schedule downgrade**. River should update that same schedule: metadata filled in, Practice then Essential, both phases `proration_behavior: none`, still active and attached. Then test **Keep Practice**. Do not use **Cancel plan change** on that clinic before scheduling: the local schedule id was never stored, so cancel would delete the keep-set without touching Stripe.

Renewal retention uses a **Test Clock** and a disposable clinic, not the already-accepted Sandbox subscription. The Subscription Schedule request itself was already proven and must not be redesigned.

Renewal without waiting for the real period end uses a **Test Clock**. An existing customer cannot be attached to a clock. Create a disposable one:

1. In test mode, create a Test Clock.
2. Create a new Customer with that clock. Do not reuse the existing Sandbox customer.
3. Create a subscription on that customer with the Practice Price for the interval under test, quantity 1.
4. On a disposable local clinic only, store that test customer id and subscription id. Do not point this at production.
5. Schedule the downgrade from Billing as the clinic ADMIN.
6. Advance the clock to just after `current_period_end` and forward the resulting webhooks (`invoice.paid` or `invoice.payment_failed`, `customer.subscription.updated`, and the schedule events).
7. Expect the same subscription id, the Essential Price, local `commercialPlan` Essential, and the scheduled-change message gone. Guides in the keep-set stay active. Other clinic-owned guides show under Retained guides, are read-only, and a previously published one still opens at its existing URL. Extras are unchanged. A failed renewal payment should show Essential with the existing past-due retry message, with the same retention outcome, not a deleted clinic.

Also check cancellation: schedule a downgrade, then cancel at period end in the Portal. The subscription should end at the paid-period boundary instead of continuing on Essential. Removing that cancellation must leave the clinic on Practice and must not put the downgrade back. If the Portal cannot set either `cancel_at` / `cancel_at_period_end` or schedule `end_behavior: cancel` while a schedule is attached, stop and report that before inventing another mechanism.

## Local Checkout test path

1. Use the local PostgreSQL 18 database (or another non-production database). Apply `prisma/migrations/20260921180000_add_billing_checkout_onboarding` there. Do not apply it to production from this note.
2. Put test-mode `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four test Price IDs in local env. The app refuses `sk_live_` and `rk_live_`.
3. Forward webhooks with Stripe CLI to `http://app.localhost:3000/api/stripe/webhook`.
4. As OPERATOR, open the clinic and choose Essential or Practice plus monthly or yearly, then Prepare billing.
5. Sign in as that clinic's ADMIN, complete billing identity and Terms acceptance, and continue to Stripe Checkout.
6. Pay with a [Stripe test card](https://docs.stripe.com/testing) or the AU BECS test debit. Card payment can become active after `invoice.paid`. BECS can stay on Payment processing until settlement.
7. The browser return to `/account/billing/complete` must not be treated as activation. Only the local projection after `invoice.paid` opens product access.

## What Joaquín still does in TEST MODE

1. Create the two Products and four AUD Prices above. Do not create a Group Price.
2. Store the four Price IDs and a test restricted key + webhook secret in local env (and Preview only if that environment is not production data).
3. Enable card + AU BECS in the TEST MODE Payment Method Configuration. Leave Stripe Tax off.
4. Register the staff-host webhook (or local CLI forwarding) and the events listed above. Pin API version `2026-08-26.dahlia`.
5. Do not create live-mode catalogue, keys, endpoints, or charges in this phase.
