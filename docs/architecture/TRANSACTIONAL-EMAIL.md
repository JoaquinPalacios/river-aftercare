# Transactional email — shared transport

River Aftercare sends application-generated email through one Resend account. Marketing Contact and account-lifecycle mail share **transport only**. They keep separate identities, configuration, and call sites.

There is no generic send-email HTTP route.

## Flows

```text
Marketing Contact
  → Contact form (Turnstile, honeypot, host check)
  → deliverMarketingContactEnquiry
  → sendTransactionalEmail
  → From CONTACT_EMAIL_FROM (website@mail.riveraftercare.com.au in production)
  → To CONTACT_EMAIL_TO (contact@riveraftercare.com.au)
  → Reply-To visitor email

Account lifecycle (password reset, operator invitations, email change)
  → sendAuthTransactionalEmail
  → sendTransactionalEmail
  → From AUTH_EMAIL_FROM (accounts@mail.riveraftercare.com.au in production)
  → To the user (current User.email for reset/invite; pending new address for email change)
  → optional Reply-To AUTH_EMAIL_REPLY_TO (contact@riveraftercare.com.au)

Billing notices (annual renewal, and a future price increase when a schedule exists)
  → GET /api/cron/billing-notices
  → deliverPlannedBillingEmails
  → sendTransactionalEmail
  → From AUTH_EMAIL_FROM
  → To ClinicBillingProfile.billingEmail only
  → Reply-To AUTH_EMAIL_REPLY_TO (required for this flow)

Failed payment, invoice, and dunning mail
  → Stripe
  → River does not send a second email for the same event
```

The verified Resend sending domain is `mail.riveraftercare.com.au`. Do not send from `riveraftercare.com.au` itself.

## What is shared

- `RESEND_API_KEY` (existing Production key; send-only and domain-scoped)
- Mailbox parsing (`lib/email/mailbox.ts`)
- Bounded Resend send with an 8s timeout (`lib/email/transactional-mailer.ts`)
- Memory inbox for tests and the local default
- Optional development Mailpit HTTP send at a fixed loopback URL (`docs/development/LOCAL-MAILPIT.md`)
- Header / empty-recipient / CRLF rejection

## What stays separate

| Concern              | Marketing Contact                                                | Auth email                                                                  | Billing notices                     |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| From                 | `CONTACT_EMAIL_FROM`                                             | `AUTH_EMAIL_FROM`                                                           | `AUTH_EMAIL_FROM`                   |
| Recipient            | `CONTACT_EMAIL_TO` (inbox)                                       | the eligible User.email                                                     | `ClinicBillingProfile.billingEmail` |
| Reply-To             | sanitised visitor email                                          | optional `AUTH_EMAIL_REPLY_TO`                                              | `AUTH_EMAIL_REPLY_TO` (required)    |
| Transport selector   | `CONTACT_MAILER` (`memory` refused when `VERCEL_ENV=production`) | memory by default; optional local Mailpit; Resend only on Vercel production | same auth transport                 |
| Turnstile / honeypot | yes                                                              | no                                                                          | no                                  |
| Templates            | clinic enquiry composition                                       | password-reset, invitation, and email-change                                | `lib/email/billing-notice-mail.ts`  |

Do not reuse Contact From/To for invitations or password reset. Do not reuse auth From for Contact.

Failed-payment and invoice email stay with Stripe. The dashboard past-due notice is read from the local billing projection. It is not a Resend message, and the billing-notice cron does not send one. Do not add a River failed-payment template unless Stripe’s customer email is confirmed absent.

## Environment

Server-only. Never prefix with `NEXT_PUBLIC_`. Never commit real keys.

| Variable               | Used by                                              | Notes                                                                                                                                   |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`       | Contact + future auth                                | Existing Vercel Production secret. Do not rotate from application PRs.                                                                  |
| `CONTACT_EMAIL_FROM`   | Contact                                              | Envelope From.                                                                                                                          |
| `CONTACT_EMAIL_TO`     | Contact                                              | Destination inbox.                                                                                                                      |
| `CONTACT_MAILER`       | Contact                                              | `resend` (default) or `memory`. Memory refused in Vercel production.                                                                    |
| `AUTH_EMAIL_FROM`      | Password-reset and invitation auth                   | Required only when auth delivery is invoked. Lazy; not a build-time requirement.                                                        |
| `AUTH_EMAIL_REPLY_TO`  | Password-reset, invitation auth, and billing notices | Optional for auth. Required before a billing notice is sent.                                                                            |
| `AUTH_EMAIL_TRANSPORT` | Auth mail, including billing notices                 | Optional. `mailpit` only when `NODE_ENV=development` and the process is not on Vercel. Unset uses memory. Ignored for Resend selection. |
| `CRON_SECRET`          | `GET /api/cron/billing-notices`                      | Bearer secret for Vercel Cron. Not required locally.                                                                                    |

Intended Production auth values (configure in Vercel; not hardcoded defaults):

```bash
AUTH_EMAIL_FROM="River Aftercare <accounts@mail.riveraftercare.com.au>"
AUTH_EMAIL_REPLY_TO=contact@riveraftercare.com.au
```

Local / documentation examples:

```bash
AUTH_EMAIL_FROM="River Aftercare <accounts@example.test>"
AUTH_EMAIL_REPLY_TO=hello@example.test
# AUTH_EMAIL_TRANSPORT=mailpit
```

Missing `AUTH_EMAIL_FROM` must not break `pnpm build`. Auth delivery then returns a controlled `not_configured` failure only if a later flow actually tries to send.

`AUTH_EMAIL_TRANSPORT=mailpit` is local development only. The sender is native `fetch` to `http://127.0.0.1:8025/api/v1/send`. It does not run at production startup, and it is not selected when `VERCEL` or `VERCEL_ENV` is set. Vercel production continues to require `RESEND_API_KEY` even if this variable is present. An unreachable Mailpit returns `delivery_failed` and does not fall back to the memory inbox. See [../development/LOCAL-MAILPIT.md](../development/LOCAL-MAILPIT.md).

## Safety

- No client-bundled API key, From config, or token helpers
- No logging of raw tokens, reset/invite URLs, API keys, or message bodies
- Provider error details stay behind `{ ok: false, code: "delivery_failed" | "not_configured" | "invalid_message" }`
- Contact continues to map those to the generic user-facing Contact copy
- Production Sentry error tracking records sanitized operational events (`contact_email_delivery_failed`, `auth_email_delivery_failed`, `auth_email_not_configured`, `billing_notice_delivery_failed`, `billing_notice_not_configured`) without recipient, subject, body, token, or provider detail. Validation, Turnstile, and honeypot failures are not reported.
- Billing-notice logs record the clinic id, notice kind, and failure code. They do not record the billing email or the message body. `BillingNoticeDelivery` stores the same non-sensitive receipt. A provider timeout is `FAILED`, not `SENT`.

Invitation HTML templates live in `lib/email/invitation-mail.ts`. Password-reset templates are sent from `lib/email/password-reset-mail.ts`.

Invitation and reset links use a URL fragment (`#token=`) on the trusted staff origin `https://app.<CARE_GUIDE_ROOT_DOMAIN>`. Local development appends port 3000, or the port on a local `CARE_GUIDE_METADATA_BASE`. Production and Vercel preview omit that port. Do not build those URLs from `Host` / `x-forwarded-host`.

Password-reset delivery failure revokes the new token best-effort so cooldown does not block retry. Invitation delivery failure **retains** the pending token so a late provider delivery is not guaranteed dead; the operator is told to resend. Resend supersedes the previous outstanding invitation. Restoring clinic access for a passworded zero-membership User does **not** send mail.
