# Stripe TEST MODE setup — River Aftercare Billing Phase 1

**Status:** Operator documentation for later manual configuration. This repository does not create Stripe Dashboard objects, live-mode keys, or charges.

Phase 1 ships the webhook endpoint and local projection only. Do **not** enable live mode. Do **not** configure GST, Stripe Tax, or Tax Invoice extras yet. Accountant confirmation is still pending; River Aftercare is not currently GST registered.

Related: [BILLING.md](../architecture/BILLING.md), [LEGAL-REQUIREMENTS.md](LEGAL-REQUIREMENTS.md), `.env.example`.

## Products and Prices (TEST MODE)

Create two Products. Monthly and yearly are Prices on the same Product. Currency **AUD**. Do not mark tax inclusive. Do not attach a GST tax rate. Do not enable automatic tax.

| Product | Recurring Price |
| ------- | --------------- |
| River Aftercare Essential | A$79 / month |
| River Aftercare Essential | A$790 / year |
| River Aftercare Practice | A$149 / month |
| River Aftercare Practice | A$1,490 / year |

Do **not** create a Group Product or Group Price. Group remains custom / operator-managed.

Copy the four resulting `price_...` identifiers into server-only environment variables:

- `STRIPE_ESSENTIAL_MONTHLY_PRICE_ID`
- `STRIPE_ESSENTIAL_YEARLY_PRICE_ID`
- `STRIPE_PRACTICE_MONTHLY_PRICE_ID`
- `STRIPE_PRACTICE_YEARLY_PRICE_ID`

Never commit secrets or Price IDs. Never prefix these with `NEXT_PUBLIC_`.

Vercel Preview should use **test-mode** keys and test Price IDs only. Phase 1 refuses live `sk_live_` / `rk_live_` secrets.

Prefer a restricted test key (`rk_test_...`) with Billing, Checkout, Customers, and webhook read access over an unrestricted `sk_test_...`.

## Payment methods (intended, not wired in this phase)

Dashboard Payment Method Configuration should later offer:

- Card
- Australian BECS Direct Debit

Do not pass `payment_method_types` in application code when Checkout is built. Omit it so Dashboard configuration can change without a deploy.

BECS identity verification on the Stripe account may be required before BECS appears. That is a Dashboard task, not application code.

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

| Capability | Setting |
| ---------- | ------- |
| Invoice history | Enabled |
| Payment method update | Enabled |
| Cancellation | Enabled |
| Cancellation mode | At period end (`at_period_end`) |
| Immediate cancellation | Disabled |
| Subscription / plan switching | **Disabled** |

Essential → Practice is immediate (proration may apply). Practice → Essential is at next renewal with entitlement-conflict checks. Do not expose generic Stripe Portal plan switching until that workflow is built deliberately.

## GST / tax

Do not configure Stripe Tax. Do not add a 10% GST rate. Do not claim Tax Invoice support from this phase.

## What Joaquín still does in TEST MODE

1. Create the two Products and four AUD Prices above.
2. Store the four Price IDs and a test restricted key + webhook secret in local / Preview env.
3. Enable card + AU BECS in the TEST MODE Payment Method Configuration.
4. Register the staff-host webhook and the events listed above.
5. Do not create live-mode catalogue, keys, or endpoints in this phase.
