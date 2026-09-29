# Stripe setup — River Aftercare Billing

**Status:** Operator documentation. This repository does not create Stripe Dashboard objects, live-mode keys, or charges.

Stripe stays optional until a billing operation runs. Patient and marketing pages do not require Stripe. Checkout, the Customer Portal, and `POST /api/stripe/webhook` fail clearly when the configuration for that operation is missing or has the wrong mode.

There is no publishable Stripe key and no `@stripe/stripe-js` client. Every variable below is server-only. Never prefix one with `NEXT_PUBLIC_`. Never commit a secret, Price ID, or Portal configuration id.

Do not configure GST, Stripe Tax, a tax rate, or Tax Invoice extras. River Aftercare is not registering for GST at this stage. Public prices make no GST claim.

Related: [BILLING.md](../architecture/BILLING.md), [LEGAL-REQUIREMENTS.md](LEGAL-REQUIREMENTS.md), `.env.example`.

## Environment split

Price IDs use the `price_` prefix in both test and live mode. The prefix does not say which mode they belong to. The webhook signing secret uses `whsec_` in both modes. The Customer Portal configuration id uses `bpc_` in both modes. Isolation is the environment, not the prefix.

|                         | Vercel Production               | Vercel Preview                   | Local development and test                               |
| ----------------------- | ------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `VERCEL_ENV`            | `production`                    | `preview`                        | unset, `development`, or `test`                          |
| `STRIPE_SECRET_KEY`     | `sk_live_...` or `rk_live_...`  | `sk_test_...` or `rk_test_...`   | `sk_test_...` or `rk_test_...` when Stripe is configured |
| Rejected secret         | any `sk_test_` / `rk_test_` key | any `sk_live_` / `rk_live_` key  | any `sk_live_` / `rk_live_` key                          |
| Price IDs               | live-mode `price_...`           | test-mode `price_...`            | test-mode `price_...` when Stripe testing is needed      |
| `STRIPE_WEBHOOK_SECRET` | live endpoint `whsec_...`       | test endpoint or CLI `whsec_...` | test endpoint or CLI `whsec_...`                         |
| Portal configuration    | live-mode `bpc_...`             | test-mode `bpc_...`              | test-mode `bpc_...` when Manage billing is tested        |

Credentials are never shared between environments. A test Price ID, test webhook secret, or test Portal configuration must not be copied into Vercel Production. A live secret must not be copied into Preview or a local `.env`.

Prefer a restricted key (`rk_live_...` in production, `rk_test_...` elsewhere) with Billing, Checkout, Customers, and webhook read access. An `sk_live_...` or `sk_test_...` secret key is also accepted for that same mode. Other strings are rejected.

Missing variables do not stop the rest of the app. Production and Preview configuration checks require the full set below. Local Stripe may be absent.

Check a prepared environment without calling Stripe or Vercel:

```text
pnpm stripe:config:check
```

The command reads the current process environment only. It prints names and status, including `Stripe mode: live` or `Stripe mode: test`. It does not print secret keys, webhook secrets, Price IDs, or Portal configuration ids. To review a production-shaped set before adding it to Vercel, export `VERCEL_ENV=production` and the production values in that shell, then run the command. Do not paste the values into Cursor.

## Vercel Production variable names

Set these on Vercel Production after the live Dashboard objects exist. Use the live-mode value for each one.

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID`
- `STRIPE_ESSENTIAL_MONTHLY_PRICE_ID`
- `STRIPE_ESSENTIAL_YEARLY_PRICE_ID`
- `STRIPE_PRACTICE_MONTHLY_PRICE_ID`
- `STRIPE_PRACTICE_YEARLY_PRICE_ID`
- `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID`
- `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID`
- `STRIPE_GROUP_MONTHLY_PRICE_ID`
- `STRIPE_GROUP_YEARLY_PRICE_ID`
- `STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID`
- `STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID`

The ten Price IDs must be unique. Preview uses the same names with test-mode values. Local uses the same names when a test is needed.

A missing Group base Price for the prepared interval blocks that Group Checkout. A missing Additional Site Price blocks only an offer whose quantity is above zero. Essential and Practice continue to work. If the Practice Additional Location Price IDs are missing, base-only Practice billing continues to work and a retrieved base-only activation stores quantity 0. A new Practice activation still requires that retrieved subscription. An unrecognised extra subscription item still fails closed. An Additional Site Price and an Additional Location Price are not plans.

## Live catalogue Joaquín creates after merge

Create these objects in Stripe **live mode**. Currency **AUD**. Do not mark prices tax inclusive. Do not attach a GST tax rate. Do not enable automatic tax. Annual billing is 12 months for the price of 10. Do not invent another product. Public Group pricing stays Custom. Do not add a public Group Checkout button.

| Product                                        | Price                 | Capacity                                    |
| ---------------------------------------------- | --------------------- | ------------------------------------------- |
| River Aftercare Essential                      | A$79 / month          | 1 Clinic Site and 1 Location                |
| River Aftercare Essential                      | A$790 / year          | 1 Clinic Site and 1 Location                |
| River Aftercare Practice                       | A$149 / month         | 1 Clinic Site and the first Location        |
| River Aftercare Practice                       | A$1,490 / year        | 1 Clinic Site and the first Location        |
| River Aftercare Practice — Additional Location | Graduated monthly     | First extra Location A$79, then A$59 each   |
| River Aftercare Practice — Additional Location | Graduated yearly      | First extra Location A$790, then A$590 each |
| River Aftercare Group                          | A$449 / month         | 2 Clinic Sites and 5 Locations              |
| River Aftercare Group                          | A$4,490 / year        | 2 Clinic Sites and 5 Locations              |
| River Aftercare Group Additional Site          | A$50 / month per unit | Each unit adds 1 Clinic Site and 1 Location |
| River Aftercare Group Additional Site          | A$500 / year per unit | Each unit adds 1 Clinic Site and 1 Location |

Essential has no additional-location Price. Practice Additional Location is one quantity-based graduated Price per interval, not a second base plan and not a quantity on the Practice base Price. In the Dashboard graduated Price, the first unit is the A$79 or A$790 tier and every following unit is the A$59 or A$590 tier. Group has no standalone Additional Location Price. Group Additional Site is a per-unit recurring Price, not a graduated Price.

Group Checkout starts only after an operator prepares the Group plan, interval, and additional-site quantity for that Account. The account administrator accepts Terms and pays. A base-only offer sends Group base quantity 1 and does not require the Additional Site Price. A quantity above zero also sends the matching-interval Additional Site Price at that quantity. `invoice.paid` stores that purchased quantity, including zero. Checkout completion and pending BECS do not. An existing Group whose purchased quantity is still null stays null. Practice add-on Checkout is not implemented. Buying or changing a Group or Practice quantity after activation is not implemented. `SITE_TO_NEW_GROUP` is not implemented.

Copy each live `price_...` id into the matching Production variable above.

Repeat the same catalogue in Stripe **test mode** for Preview and local testing. Those `price_...` ids are different objects. Put them only in Preview or local env.

## Payment methods

Checkout sends an explicit allow-list:

- `card`
- `au_becs_debit`

`payment_method_types` is set on the Checkout Session so Dashboard dynamic methods cannot add Afterpay, PayPal, BNPL, or cash. Link wallets are not offered (`wallet_options.link.display` `never`). Stripe still shows its own BECS mandate. River does not recreate that text.

Enable card and Australian BECS Direct Debit in the Payment Method Configuration for the mode you are configuring. BECS identity verification on the Stripe account may be required before BECS appears. That remains a Dashboard task. Do it separately for test mode and live mode.

## Webhook

Production endpoint, staff host only. Marketing and tenant hosts 404 `/api/*`:

```text
https://app.riveraftercare.com.au/api/stripe/webhook
```

The route reads the raw body with `request.text()` and verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`. That verification is unchanged.

The live endpoint has its own `whsec_` signing secret. Do not reuse the test-mode Dashboard secret or the Stripe CLI secret.

Preview and local use their own test-mode secrets. Local forwarding:

```text
stripe listen --forward-to http://app.localhost:3000/api/stripe/webhook
```

The CLI signing secret is not the Dashboard endpoint secret.

Subscribe the endpoint to exactly the event types the application consumes:

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

A signed event of any other type is ignored after verification. Do **not** subscribe to `invoice.created` unless River later mutates draft invoices. A failing `invoice.created` listener can delay automatic finalization.

Pin the Dashboard endpoint API version to the Stripe Node SDK default for this repository: **`2026-08-26.dahlia`** (`stripe@22.6.2`, `Stripe.API_VERSION`). Do not copy an older version from a blog post. Pin the live endpoint and the test endpoint separately.

`checkout.session.completed` means Checkout was submitted. It is not proof that a delayed method such as BECS has settled. River activates paid entitlement from **`invoice.paid`**, after the Price ID maps to the configured catalogue, and never from Checkout completion alone.

## Customer Portal

`STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` is required before Manage billing can open a session. The app retrieves that configuration and refuses the session when it does not match the rules below. There is no fallback to the Stripe account default.

Create one configuration in **live mode** for Production and a different configuration in **test mode** for Preview and local. A `bpc_` id from the wrong mode will not work on that environment's secret key. The id prefix does not encode the mode.

Do not enable the hosted portal login page. A login link would let someone reach the portal with the billing email and skip River’s clinic-admin check.

In Stripe Dashboard → Settings → Billing → Customer portal:

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

Essential → Practice is an operator action in River, not a Portal plan switch. It updates the existing subscription item to the Practice price for the current interval, with `proration_behavior=always_invoice`, `payment_behavior=pending_if_incomplete`, and `billing_cycle_anchor=unchanged`. Monthly ↔ annual is not a Portal or operator action.

Practice → Essential is self-service for a clinic ADMIN on `/account/billing`, scheduled for the next renewal of the same interval. Do not enable Portal subscription updates to do it. Returning from the portal does not change River entitlement; the webhook does.

## Production checklist

After this change is merged, and before Production billing is used:

1. In Stripe live mode, create the five products and ten prices in the catalogue above. Do not enable Stripe Tax.
2. Enable card and AU BECS on the live Payment Method Configuration.
3. Create the live Customer Portal configuration with subscription updates and quantity changes disabled. Copy its `bpc_...` id.
4. Add the live webhook endpoint `https://app.riveraftercare.com.au/api/stripe/webhook`, subscribe to the twelve events above, and pin API version `2026-08-26.dahlia`. Copy that endpoint's `whsec_...` secret.
5. Create a live restricted key (`rk_live_...`) or live secret key (`sk_live_...`).
6. Put those live values in Vercel Production under the variable names in this document. Do not reuse any test-mode value.
7. On a trusted machine, export `VERCEL_ENV=production` and those values, then run `pnpm stripe:config:check`. Expect `Stripe mode: live`, every catalogue row `configured`, and `Catalogue unique: yes`. The command must not print the secret values.
8. Leave Preview and local on test-mode keys, test Price IDs, a test webhook secret, and a test Portal configuration.

## Test and Preview checklist

Use Stripe test mode and a non-production database.

1. Create the same catalogue in test mode and store those Price IDs locally, and on Vercel Preview when that preview uses a non-production database.
2. Store a test restricted key and a test webhook secret. The app rejects `sk_live_` and `rk_live_` when `VERCEL_ENV` is not `production`.
3. Enable card and AU BECS in the test-mode Payment Method Configuration. Leave Stripe Tax off.
4. Register a test webhook, or forward with the Stripe CLI to `http://app.localhost:3000/api/stripe/webhook`. Pin API version `2026-08-26.dahlia` on a Dashboard test endpoint.
5. Create the test-mode Customer Portal configuration and store its `bpc_...` id only in Preview or local env.
6. As OPERATOR, open the clinic and choose Essential or Practice plus monthly or yearly, or Group plus monthly or yearly and an additional-site quantity of zero or more, then Prepare billing. A Group offer does not grant capacity.
7. Sign in as that clinic's ADMIN, complete billing identity and Terms acceptance, and continue to Stripe Checkout.
8. Pay with a [Stripe test card](https://docs.stripe.com/testing) or the AU BECS test debit. Card payment can become active after `invoice.paid`. BECS can stay on Payment processing until settlement.
9. The browser return to `/account/billing/complete` must not be treated as activation. Only the local projection after `invoice.paid` opens product access.

## Test-mode downgrade notes

Scheduling, guide selection, and Test Clock renewal checks stay in test mode on a non-production database. Do not repeat them against the live catalogue, the live Portal configuration, or production Clinic rows.

Guide selection on a disposable local Practice clinic, before any further Stripe action:

1. Create 5 original custom guides and 4 edited River-template copies. Essential base is 2, 2, and 4 combined.
2. As clinic ADMIN, open `/account/billing` and choose **Change plan**. That only opens the review. River must not call Stripe, and `commercialPlan` stays Practice.
3. Choose 3 custom guides and confirm. River rejects it.
4. Choose 2 custom guides and 2 edited templates and confirm. Billing should say guide selection is confirmed.
5. Choose **Schedule downgrade** on Billing. River stays Practice.
6. Choose **Keep Practice** on Billing. Preparation and the keep-set are cleared. No guide is retained or deleted.

Renewal without waiting for the real period end uses a **Test Clock**. An existing customer cannot be attached to a clock. Create a disposable one in test mode, attach a new Customer and a Practice subscription, schedule the downgrade, advance the clock, and forward the resulting webhooks. Expect the same subscription id, the Essential Price, and local `commercialPlan` Essential.

Also check cancellation in test mode: schedule a downgrade, then cancel at period end in the test Portal. The subscription should end at the paid-period boundary instead of continuing on Essential.
