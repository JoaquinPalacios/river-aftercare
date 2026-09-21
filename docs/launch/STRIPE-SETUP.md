# Stripe TEST MODE setup — River Aftercare Billing

**Status:** Operator documentation for manual Dashboard configuration. This repository does not create Stripe Dashboard objects, live-mode keys, or charges.

Phase 1 ships the webhook endpoint and local projection. Phase 2 ships demo-approved hosted Checkout (card + AU BECS) for an operator-prepared Essential or Practice offer. Do **not** enable live mode. Do **not** configure GST, Stripe Tax, or Tax Invoice extras. Accountant confirmation is still pending; River Aftercare is not currently GST registered.

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

Do **not** subscribe to `invoice.created` unless River later mutates draft invoices. A failing `invoice.created` listener can delay automatic finalization.

Pin the Dashboard endpoint API version to the Stripe Node SDK default for this repository: **`2026-08-26.dahlia`** (`stripe@22.6.2`, `Stripe.API_VERSION`). Do not copy an older version from a blog post.

## Authoritative paid signal

`checkout.session.completed` means Checkout was submitted. It is **not** proof that a delayed method such as BECS has settled.

River activates paid entitlement from **`invoice.paid`**, after the Price ID maps to Essential or Practice, and never from Checkout completion alone.

## Customer Portal — later phase (do not implement yet)

When Portal is configured later, the approved launch settings are:

| Capability                    | Setting                         |
| ----------------------------- | ------------------------------- |
| Invoice history               | Enabled                         |
| Payment method update         | Enabled                         |
| Cancellation                  | Enabled                         |
| Cancellation mode             | At period end (`at_period_end`) |
| Immediate cancellation        | Disabled                        |
| Subscription / plan switching | **Disabled**                    |

Essential → Practice is immediate (proration may apply). Practice → Essential is at next renewal with entitlement-conflict checks. Do not expose generic Stripe Portal plan switching until that workflow is built deliberately.

## GST / tax

Do not configure Stripe Tax. Do not add a 10% GST rate. Do not claim Tax Invoice support from this phase.

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
