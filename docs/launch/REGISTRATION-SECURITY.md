# Registration security

Public registration stays off until `REGISTRATION_ENABLED` is exactly `true`. These controls reduce bot signups, mail floods, slug squatting, and trial abuse. They do not prove that every registrant is a genuine clinic.

Nothing in this document changes live Vercel Firewall rules or live Stripe settings. Apply those manually after review.

## What the application already enforces

- Staff host and Origin checks. Marketing and tenant hosts receive 404.
- Cloudflare Turnstile Siteverify on registration, resend, verification, and slug recovery. The staff hostname and a fixed action are required once Siteverify runs. A missing token, a failed or reused token, a hostname or action mismatch, and an unavailable Siteverify call are refused.
- Production (`VERCEL_ENV=production`) fails closed when `TURNSTILE_SECRET_KEY` is missing or is one of Cloudflare's published dummy secrets. Local development and tests still accept those dummy secrets.
- The client IP sent to Siteverify is the first `x-forwarded-for` hop, and only when `VERCEL=1`. The application does not store that address.
- One live registration per email. A second submission for that email within 60 seconds does not hash a password, write a new row, or send mail. A replacement link still waits 10 minutes.
- A short list of temporary inbox domains is refused before hashing. Gmail, Outlook, and other ordinary providers are allowed. VPNs and shared office networks are not blocked.
- The public result for an existing customer, invitation, or operator address is the same generic accepted message.
- The verification token is a 32-byte value stored as SHA-256. Expired, revoked, and replaced tokens cannot create a clinic. A consumed token does not create a session. The owner signs in with the password they chose. `/login` continues an existing session to billing setup.
- The tenant slug is not reserved until the clinic row is created. An unverified registration does not create a public hostname.
- Clinic creation, the owner, the single ADMIN membership, the Essential or Practice offer, and token consumption commit together. Stripe is not called in that transaction.
- Group, complimentary, negotiated, and promotional offers are not created on this path.
- Checkout still requires a payment method. A trialing subscription with no default payment method stays pending. `checkout.session.completed` alone does not open the workspace. A prior Stripe subscription withholds another catalogue trial. If that history cannot be read, Checkout fails closed instead of granting the trial.
- The cleanup schedule is the private Vercel Schedule `registration-intents-cleanup` (`api/registration-intents-cleanup`, `30 21 * * *` UTC). Its only trigger is `schedule/v1beta`, so the function has no public URL. Git tracks that function entry. `pnpm build` writes the traced bundle beside it. `GET /api/cron/registration-intents` remains and still requires the bearer secret and the staff or marketing host. Billing notices are not scheduled. One run redacts at most 2,000 expired unused password hashes, in batches of 500, and does not delete rows. A saturated run logs `registration_intent_expiry_backlog`.

## Recommended Vercel Firewall rules

Do not create these until Joaquín approves them. They belong on the existing Vercel Firewall for `app.riveraftercare.com.au`. No Redis, Upstash, or other rate-limit service is required. Additional rules on the current Firewall do not add a new vendor.

Use Deny, not Log, once registration is enabled. Count by IP. A shared clinic office can submit several registrations; the limits below leave that room and still stop a script.

| Path                        | Method | Limit                    |
| --------------------------- | ------ | ------------------------ |
| `/api/auth/register`        | POST   | 10 requests / 10 minutes |
| `/api/auth/register/resend` | POST   | 5 requests / 10 minutes  |
| `/api/auth/register/verify` | POST   | 20 requests / 10 minutes |
| `/api/auth/register/slug`   | POST   | 20 requests / 10 minutes |

The per-email cooldowns above still apply when many IPs target one address. The Firewall is the per-IP control because this app does not store client addresses.

Keep the existing `login-post-rate-limit` rule. Do not add Turnstile to login in this change.

## Emergency stop

Either control stops new registration and verification-driven provisioning. Clinics that already exist, including one whose entitlement is still pending, keep working. Invitations, login, and password reset are unchanged.

1. Fastest, no code deployment: in the Vercel Firewall, add a Deny rule for POST `/api/auth/register`, `/api/auth/register/resend`, `/api/auth/register/verify`, and `/api/auth/register/slug` on `app.riveraftercare.com.au`. Disable that rule to reopen the endpoints. This does not change Git.
2. Application switch: set `REGISTRATION_ENABLED` to anything other than `true`, then redeploy so the running functions pick it up. The pages and POST routes return 404. Vercel applies environment changes on the next deployment, so this is not instantaneous.

Leave the flag off until the launch checklist below is done.

## Stripe

Do not change live prices, the 14-day trial length, coupons, or Radar configuration from this repository.

Checkout already collects a card or AU BECS debit and does not grant workspace access when the subscription has no default payment method. A rejected card does not complete Checkout. AU BECS can still open a trial once Stripe has accepted the mandate and attached it as the default payment method. A later bank rejection is handled by the existing `invoice.payment_failed` and subscription-status path. It is not a reason to block every bank debit.

Stripe Radar's basic rules are included with Stripe billing. Radar for Fraud Teams is a separate paid product. Do not enable it for launch. After registration is approved, a reasonable basic rule is to block payments whose Radar risk level is `highest`. Do not add a rule that blocks VPNs, anonymous IPs, or non-AU cards by themselves: legitimate clinics use those networks. Review elevated-risk trial payments in the Stripe Dashboard. A suspicious registration that cannot be classified automatically stays visible to operators as a normal clinic with `assistedOnboarding` and an `OFFER_PREPARED` entitlement. There is no separate review queue.

## Launch checklist

1. Apply migration `20261119180000_add_registration_legal_acceptance` with `pnpm prod:db:migrate --apply` on a trusted machine, then verify and redeploy that SHA.
2. Confirm production `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are the real Cloudflare keys, not the dummy keys.
3. Confirm production `CRON_SECRET` is set. The registration cleanup schedule sends it as `Authorization: Bearer <CRON_SECRET>`. A missing secret makes the route return 401 and redact nothing.
4. Add the Firewall rules above if Joaquín approves them.
5. Confirm a sandbox Checkout for a self-registered Essential clinic and a Practice clinic still requests the 14-day trial only when Stripe subscription history is empty, and that a declined card leaves the entitlement pending.
6. Only then set `REGISTRATION_ENABLED=true` and add marketing links.

No new recurring vendor cost is required for these controls.
