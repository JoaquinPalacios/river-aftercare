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
- `STRIPE_ESSENTIAL_MONTHLY_LEGACY_PRICE_IDS`
- `STRIPE_ESSENTIAL_YEARLY_LEGACY_PRICE_IDS`
- `STRIPE_PRACTICE_MONTHLY_LEGACY_PRICE_IDS`
- `STRIPE_PRACTICE_YEARLY_LEGACY_PRICE_IDS`
- `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID`
- `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID`
- `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_LEGACY_PRICE_IDS`
- `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_LEGACY_PRICE_IDS`
- `STRIPE_GROUP_MONTHLY_PRICE_ID`
- `STRIPE_GROUP_YEARLY_PRICE_ID`
- `STRIPE_GROUP_MONTHLY_LEGACY_PRICE_IDS`
- `STRIPE_GROUP_YEARLY_LEGACY_PRICE_IDS`
- `STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID`
- `STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID`

The ten current Price IDs must be unique. Preview uses the same names with test-mode values. Local uses the same names when a test is needed.

The legacy variables are optional comma-separated lists of retired `price_` ids. The Essential and Practice lists are required in any environment that already has subscriptions on a previous base amount. That includes the immediately previous Essential A$59 / A$590 and Practice A$129 / A$1,290 Prices, and any still-older A$79 / A$790 and A$149 / A$1,490 Prices. The Group lists are required when a subscription still uses the previous Group base amounts (A$449 / A$4,490). The two Additional Location lists are required when a subscription still has the previous graduated Additional Location Price. Leave a list unset when that environment has no such subscription. A legacy id must not repeat a current Price id. Checkout never uses a legacy id. Webhooks still map a legacy base id to the same plan and interval, and a legacy Additional Location id to the Practice location add-on, so an existing subscription can renew. Practice Additional Location stays A$59 / A$590, and Group Additional Site stays A$50 / A$500, so those current Price ids stay and have no new legacy entries. See [Price change](#price-change-for-essential-practice-and-group) below.

A missing Group base Price for the prepared interval blocks that Group Checkout. A missing Additional Site Price blocks only an offer whose quantity is above zero. Essential and Practice continue to work. If the Practice Additional Location Price IDs are missing, base-only Practice billing continues to work and a retrieved base-only activation stores quantity 0. A new Practice activation still requires that retrieved subscription. An unrecognised extra subscription item still fails closed. An Additional Site Price and an Additional Location Price are not plans.

## Live catalogue Joaquín creates after merge

Create these objects in Stripe **live mode**. Currency **AUD**. Do not mark prices tax inclusive. Do not attach a GST tax rate. Do not enable automatic tax. Annual billing is 12 months for the price of 10. Do not invent another product. Public Group pricing stays Custom. Do not add a public Group Checkout button.

| Product                                        | Price                 | Capacity                                        |
| ---------------------------------------------- | --------------------- | ----------------------------------------------- |
| River Aftercare Essential                      | A$49 / month          | 1 Clinic Site and 1 Location                    |
| River Aftercare Essential                      | A$490 / year          | 1 Clinic Site and 1 Location                    |
| River Aftercare Practice                       | A$119 / month         | 1 Clinic Site and the first Location            |
| River Aftercare Practice                       | A$1,190 / year        | 1 Clinic Site and the first Location            |
| River Aftercare Practice — Additional Location | A$59 / month per unit | Each Location above the included first Location |
| River Aftercare Practice — Additional Location | A$590 / year per unit | Each Location above the included first Location |
| River Aftercare Group                          | A$399 / month         | 2 Clinic Sites and 5 Locations                  |
| River Aftercare Group                          | A$3,990 / year        | 2 Clinic Sites and 5 Locations                  |
| River Aftercare Group Additional Site          | A$50 / month per unit | Each unit adds 1 Clinic Site and 1 Location     |
| River Aftercare Group Additional Site          | A$500 / year per unit | Each unit adds 1 Clinic Site and 1 Location     |

Essential has no additional-location Price. Practice Additional Location is one per-unit recurring Price per interval on the existing Additional Location product, not a second base plan and not a quantity on the Practice base Price. Every additional Location is A$59 per month or A$590 per year, including the first additional Location. There is no cheaper tier for later Locations. The previous graduated Prices stay active for subscriptions that already use them. Group has no standalone Additional Location Price. Group Additional Site stays a per-unit recurring Price.

Group Checkout starts only after an operator prepares the Group plan, interval, and additional-site quantity for that Account. The account administrator accepts Terms and pays. A base-only offer sends Group base quantity 1 and does not require the Additional Site Price. A quantity above zero also sends the matching-interval Additional Site Price at that quantity. `invoice.paid` stores that purchased quantity, including zero. Checkout completion and pending BECS do not. An existing Group whose purchased quantity is still null stays null. Practice add-on Checkout is not implemented. Buying or changing a Group or Practice quantity after activation is not implemented. `SITE_TO_NEW_GROUP` is not implemented.

Copy each live `price_...` id into the matching Production variable above. Do not edit the `unit_amount` of a Price that an existing subscription uses. Stripe Prices are immutable for amount. Create a new Price on the same Product instead.

## Price change for Essential, Practice, and Group

Public Essential is A$49 per month or A$490/year. Public Practice is A$119 per month or A$1,190/year. The public cards keep the “/year — 2 months free” line, and the annual note stays “Annual plans include 12 months for the price of 10.” Operator Group base stays A$399 per month or A$3,990 per year. Public Group pricing stays Custom. This change does not replace Group Prices or their environment variables. The yearly Stripe charge is still 10 monthly payments for 12 months of access.

Group Additional Site stays A$50 per month or A$500 per year. Practice Additional Location stays a flat per-unit Price: A$59 per additional Location per month, including the first additional Location, and A$590 per additional Location per year. There is no decreasing tier. Those two amounts did not change, so their current Price ids stay. Negotiated offers keep the amount stored on the offer. Feature limits are unchanged. GST treatment is unchanged: do not register for GST, do not mark Prices tax inclusive, and do not enable Stripe Tax.

This repository does not create, archive, or modify Stripe Prices or live subscriptions. Joaquín does that in the Dashboard, then sets environment variables, then deploys this code. Existing subscriptions are not migrated.

### Create the new Prices

In each mode that will charge the new amounts (live for Production, test for Preview and local):

1. Open the existing Essential Product. Add a new recurring AUD Price: A$49, interval month, `tax_behavior` not inclusive. Add a second recurring AUD Price: A$490, interval year, `tax_behavior` not inclusive.
2. Open the existing Practice Product. Add A$119 / month and A$1,190 / year the same way.
3. Leave the previous Essential A$59 / A$590 and Practice A$129 / A$1,290 Prices active. Also leave any older Essential A$79 / A$790 and Practice A$149 / A$1,490 Prices active. Do not archive a Price while a subscription, schedule, invoice, or quote still references it. Do not edit `unit_amount` on an existing Price.
4. Do not create a new Group base Price. Leave the current A$399 / month and A$3,990 / year Prices, and `STRIPE_GROUP_MONTHLY_PRICE_ID` and `STRIPE_GROUP_YEARLY_PRICE_ID`, unchanged. Leave any older Group A$449 / A$4,490 Prices active. Do not change the Group Additional Site Prices or their environment variables. Those amounts stay A$50 / A$500, so the existing Price ids remain the current ids and do not need a legacy list.
5. Do not create a replacement Practice Additional Location Price. The current per-unit Prices stay A$59 / month and A$590 / year. Confirm they are still `billing_scheme` `per_unit` before this deploy. See [Verify `billing_scheme`](#verify-billing_scheme-before-use). Do not edit the graduated Prices.
6. Leave the graduated monthly Price (first unit A$79, then A$59) and the graduated yearly Price (first unit A$790, then A$590) active while any subscription, schedule, invoice, or quote references them.

### Verify `billing_scheme` before use

The current Practice Additional Location Prices must be standard per-unit Prices. `cataloguePriceMismatchReason` refuses a retrieved catalogue Price whose `billing_scheme` is present and not `per_unit`. Do not relax that check to accept Volume or Graduated Prices.

Stripe Dashboard **Volume** pricing, including one tier of A$59 or A$590 for every quantity, stores `billing_scheme` `tiered` and `tiers_mode` `volume`. `unit_amount` is null. The amount sits on the tier (`up_to` `inf`). **Graduated** pricing is also `billing_scheme` `tiered`, with `tiers_mode` `graduated`. `billing_scheme` cannot be changed on an existing Price. A tiered id cannot be repaired into the current Additional Location variable. Create a replacement Price with Standard pricing: set `unit_amount`, leave `billing_scheme` at `per_unit`, and do not send `tiers` or `tiers_mode`.

`pnpm stripe:config:check` does not call Stripe. It cannot see `billing_scheme`, `tiers_mode`, or `unit_amount`. Confirm the objects in the Dashboard, or retrieve them, before those ids go in the current variables. Use the same mode as the secret key: test ids with a test key, live ids with a live key. Do not print the secret.

```text
GET /v1/prices/price_...
```

The Stripe CLI equivalent is `stripe prices retrieve price_...` in that mode.

Accept an id as `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID` only when every field below matches. The yearly variable uses the yearly column.

| Field                      | Monthly Price   | Yearly Price     |
| -------------------------- | --------------- | ---------------- |
| `active`                   | true            | true             |
| `currency`                 | `aud`           | `aud`            |
| `type`                     | `recurring`     | `recurring`      |
| `billing_scheme`           | `per_unit`      | `per_unit`       |
| `tiers_mode`               | null            | null             |
| `tiers`                    | null            | null             |
| `unit_amount`              | `5900`          | `59000`          |
| `unit_amount_decimal`      | equal to `5900` | equal to `59000` |
| `recurring.interval`       | `month`         | `year`           |
| `recurring.interval_count` | `1`             | `1`              |
| `tax_behavior`             | not `inclusive` | not `inclusive`  |

If `billing_scheme` is `tiered`, that id is not the current Price. That includes `tiers_mode` `volume` with a single tier whose `unit_amount` is 5900 or 59000. Leave the tiered Price active. Put it in `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_LEGACY_PRICE_IDS` or `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_LEGACY_PRICE_IDS` only when a subscription, schedule, invoice, or quote already uses it. Then create the replacement per-unit Prices and point the current variables at those new ids.

Checkout does not send the Additional Location Price today, because buying locations is not implemented. A tiered id in the current variable still is not acceptable. A later retrieve of that id as the current Additional Location Price returns `catalogue_price_mismatch_billing_scheme` and does not charge it. The same `per_unit` rule applies to every Price Checkout does retrieve: Essential, Practice, Group base, and Group Additional Site. Confirm those objects the same way. Group Additional Site stays on its existing A$50 / A$500 Prices; do not replace them as part of this amount change.

### Environment variables

Set these in the same change, before the deployment that serves this code:

| Variable                                                       | Value                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `STRIPE_ESSENTIAL_MONTHLY_PRICE_ID`                            | new A$49 Price                                                    |
| `STRIPE_ESSENTIAL_YEARLY_PRICE_ID`                             | new A$490 Price                                                   |
| `STRIPE_PRACTICE_MONTHLY_PRICE_ID`                             | new A$119 Price                                                   |
| `STRIPE_PRACTICE_YEARLY_PRICE_ID`                              | new A$1,190 Price                                                 |
| `STRIPE_ESSENTIAL_MONTHLY_LEGACY_PRICE_IDS`                    | previous A$59 Price, plus any older A$79 Price still in use       |
| `STRIPE_ESSENTIAL_YEARLY_LEGACY_PRICE_IDS`                     | previous A$590 Price, plus any older A$790 Price still in use     |
| `STRIPE_PRACTICE_MONTHLY_LEGACY_PRICE_IDS`                     | previous A$129 Price, plus any older A$149 Price still in use     |
| `STRIPE_PRACTICE_YEARLY_LEGACY_PRICE_IDS`                      | previous A$1,290 Price, plus any older A$1,490 Price still in use |
| `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID`         | unchanged A$59 per-unit Price                                     |
| `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID`          | unchanged A$590 per-unit Price                                    |
| `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_LEGACY_PRICE_IDS` | previous graduated monthly Price, if any subscription uses it     |
| `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_LEGACY_PRICE_IDS`  | previous graduated yearly Price, if any subscription uses it      |
| `STRIPE_GROUP_MONTHLY_PRICE_ID`                                | unchanged A$399 Price                                             |
| `STRIPE_GROUP_YEARLY_PRICE_ID`                                 | unchanged A$3,990 Price                                           |
| `STRIPE_GROUP_MONTHLY_LEGACY_PRICE_IDS`                        | previous A$449 Price, if any subscription uses it                 |
| `STRIPE_GROUP_YEARLY_LEGACY_PRICE_IDS`                         | previous A$4,490 Price, if any subscription uses it               |

Several retired ids for one slot are comma-separated. Do not put a new Price id in a legacy variable. The names above use `YEARLY`, matching the existing `STRIPE_*_YEARLY_PRICE_ID` variables.

### Deployment sequence

1. Create the four new Essential and Practice base Prices. Do not create Group Prices. Leave the existing Group base Prices, Additional Location Prices, and Group Additional Site Prices in place. Do not change env vars yet. Existing Checkout still uses the previous Essential and Practice base Prices. Marketing still shows the previous Essential and Practice amounts until this code is deployed. Public Group stays Custom. Creating a Price does not change an existing subscription.
2. In Vercel, save the new current Essential and Practice base ids, and append each replaced id to the matching legacy list, in the same environment update. Keep older legacy ids that a subscription still uses. Do not change `STRIPE_GROUP_MONTHLY_PRICE_ID`, `STRIPE_GROUP_YEARLY_PRICE_ID`, the Group legacy lists, the Additional Location variables, or the Group Additional Site variables. Saving variables does not change the deployment that is already running. Do not redeploy the previous build after this save. That build would read the new Essential and Practice Price ids, refuse Checkout because those unit amounts do not match its catalogue, and would fail existing-subscription webhooks if the replaced ids were not still recognised.
3. Deploy this code only as the deployment that first reads those variables. Checkout retrieves each charged Price and refuses the session unless currency is AUD, the interval matches, the unit amount matches the catalogue, `billing_scheme` is per unit when Stripe reports it, and `tax_behavior` is not `inclusive`. Catalogue cents are Essential 4900 / 49000, Practice 11900 / 119000, Group base 39900 / 399000, Group Additional Site 5000 / 50000, and Additional Location 5900 / 59000. A mismatch returns “Secure payment isn't available right now.” It does not charge the previous amount. Practice add-on purchase is not implemented, so Checkout does not send the Additional Location Price.
4. Run `pnpm stripe:config:check` with `VERCEL_ENV` and the variables for that environment. Expect the current rows `configured`, the legacy rows `configured` when subscribers exist, and `Catalogue unique: yes`. The command still does not call Stripe and does not print Price ids. Retrieve each new base Price and confirm `unit_amount`, currency, interval, `billing_scheme` `per_unit`, and `tax_behavior` not `inclusive`. The Additional Location check in [Verify `billing_scheme`](#verify-billing_scheme-before-use) is unchanged: those current ids stay the existing per-unit A$59 / A$590 Prices. A one-tier Volume Price fails that check. Graduated Additional Location Prices belong in the legacy lists only when a subscription still uses them.

Do not deploy this code while the current Essential or Practice base variables still point at the previous amounts. Checkout for that Price would stay closed, but a renewal reminder for a subscription on that Price id can name the new catalogue amount. Group stays on the current A$399 / A$3,990 Prices. The previous A$449 / A$4,490 ids belong in `STRIPE_GROUP_MONTHLY_LEGACY_PRICE_IDS` and `STRIPE_GROUP_YEARLY_LEGACY_PRICE_IDS` when a subscription still uses them. Do not move the current Group ids into those lists. The current Additional Location variables stay on the existing per-unit Prices. A later charge that retrieves a graduated Price as the current Additional Location Price refuses `billing_scheme`, because that Price is not per unit.

### Existing customers

Subscriptions, invoices, discounts, negotiated Prices, and entitlements stay on the Stripe Price already on the subscription. This change does not migrate them. A renewal of a previous base Price keeps that Price's amount. Webhooks accept the legacy base id and keep the plan. Renewal copy omits a catalogue amount when the stored base Price id is not the current base Price id, so a grandfathered clinic is not told they will be charged A$49 or A$119.

A Practice subscription that already has the graduated Additional Location item keeps that item and its tiered charge. This change does not rewrite the item. Webhooks accept that Price only when its id is in `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_LEGACY_PRICE_IDS` or `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_LEGACY_PRICE_IDS`. The app does not store the add-on Price id. Renewal copy therefore omits the combined Practice total whenever purchased additional locations are above zero, including when the live item is already the current per-unit Price. A base-only Practice subscription can still quote the current base amount when its base Price id is the current id. Buying additional locations in the app is still not implemented.

A Group subscription on the previous A$449 or A$4,490 Price keeps that Price and its charge. Webhooks accept it only when the id is in `STRIPE_GROUP_MONTHLY_LEGACY_PRICE_IDS` or `STRIPE_GROUP_YEARLY_LEGACY_PRICE_IDS`. This change does not replace `STRIPE_GROUP_MONTHLY_PRICE_ID` or `STRIPE_GROUP_YEARLY_PRICE_ID`. Group Additional Site items stay on the existing A$50 / A$500 Prices. Those env vars are not replaced, so they do not need legacy lists. A new Group Checkout uses the current A$399 / A$3,990 base Price plus the existing Additional Site Price.

Self-serve Practice → Essential and operator Essential → Practice refuse a subscription whose Price id is a legacy id (`price_mismatch`). They do not replace a grandfathered Price. A new schedule or upgrade uses only the current Price ids, and only after the amount check. Moving an existing subscriber onto the new amount is a separate, explicit migration and is not part of this change.

New Checkout, a new operator offer, and a plan change for a clinic already on a current Price id use the new amounts.

### Rollback

1. Point the Essential and Practice current base variables back at the previous base Prices (Essential A$59 / A$590, Practice A$129 / A$1,290). Leave the Group variables on the current A$399 / A$3,990 Prices.
2. Remove those ids from the matching legacy variables. Leave a new Price id in a legacy list only if a subscription was created on it and must keep renewing. Do not list an id in both a current variable and a legacy variable. Leave the Additional Location and Group Additional Site variables unchanged.
3. Keep `STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID` and `STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID` on the current per-unit A$59 / A$590 Prices. Do not point them at a graduated Price with this build.
4. Redeploy the previous application build if the marketing copy must show the previous base amounts again. Env rollback alone keeps the new public copy and closes Checkout, because this code rejects the previous base unit amounts.

Do not delete or archive a Price until Dashboard shows no subscription, schedule, or open invoice on it.

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
