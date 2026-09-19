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

Account lifecycle (password reset; invitations later)
  → sendAuthTransactionalEmail
  → sendTransactionalEmail
  → From AUTH_EMAIL_FROM (accounts@mail.riveraftercare.com.au in production)
  → To the user
  → optional Reply-To AUTH_EMAIL_REPLY_TO (contact@riveraftercare.com.au)
  Invitation mail is still later.
```

The verified Resend sending domain is `mail.riveraftercare.com.au`. Do not send from `riveraftercare.com.au` itself.

## What is shared

- `RESEND_API_KEY` (existing Production key; send-only and domain-scoped)
- Mailbox parsing (`lib/email/mailbox.ts`)
- Bounded Resend send with an 8s timeout (`lib/email/transactional-mailer.ts`)
- Memory inbox for tests / local sinks
- Header / empty-recipient / CRLF rejection

## What stays separate

| Concern              | Marketing Contact                                                | Auth email                                       |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| From                 | `CONTACT_EMAIL_FROM`                                             | `AUTH_EMAIL_FROM`                                |
| Recipient            | `CONTACT_EMAIL_TO` (inbox)                                       | the eligible User.email                          |
| Reply-To             | sanitised visitor email                                          | optional `AUTH_EMAIL_REPLY_TO`                   |
| Transport selector   | `CONTACT_MAILER` (`memory` refused when `VERCEL_ENV=production`) | memory locally; Resend only on Vercel production |
| Turnstile / honeypot | yes                                                              | no                                               |
| Templates            | clinic enquiry composition                                       | password-reset (invitations later)               |

Do not reuse Contact From/To for invitations or password reset. Do not reuse auth From for Contact.

## Environment

Server-only. Never prefix with `NEXT_PUBLIC_`. Never commit real keys.

| Variable              | Used by               | Notes                                                                            |
| --------------------- | --------------------- | -------------------------------------------------------------------------------- |
| `RESEND_API_KEY`      | Contact + future auth | Existing Vercel Production secret. Do not rotate from application PRs.           |
| `CONTACT_EMAIL_FROM`  | Contact               | Envelope From.                                                                   |
| `CONTACT_EMAIL_TO`    | Contact               | Destination inbox.                                                               |
| `CONTACT_MAILER`      | Contact               | `resend` (default) or `memory`. Memory refused in Vercel production.             |
| `AUTH_EMAIL_FROM`     | Password-reset auth   | Required only when auth delivery is invoked. Lazy; not a build-time requirement. |
| `AUTH_EMAIL_REPLY_TO` | Password-reset auth   | Optional.                                                                        |

Intended Production auth values (configure in Vercel; not hardcoded defaults):

```bash
AUTH_EMAIL_FROM="River Aftercare <accounts@mail.riveraftercare.com.au>"
AUTH_EMAIL_REPLY_TO=contact@riveraftercare.com.au
```

Local / documentation examples:

```bash
AUTH_EMAIL_FROM="River Aftercare <accounts@example.test>"
AUTH_EMAIL_REPLY_TO=hello@example.test
```

Missing `AUTH_EMAIL_FROM` must not break `pnpm build`. Auth delivery then returns a controlled `not_configured` failure only if a later flow actually tries to send.

## Safety

- No client-bundled API key, From config, or token helpers
- No logging of raw tokens, reset/invite URLs, API keys, or message bodies
- Provider error details stay behind `{ ok: false, code: "delivery_failed" | "not_configured" | "invalid_message" }`
- Contact continues to map those to the generic user-facing Contact copy

Invitation HTML templates remain absent until that PR. Password-reset templates are sent from `lib/email/password-reset-mail.ts`.

Reset links use a URL fragment (`#token=`) on the trusted staff origin `https://app.<CARE_GUIDE_ROOT_DOMAIN>`. Do not build reset URLs from `Host` / `x-forwarded-host`. If send fails after a token was created, the token is revoked best-effort so cooldown does not block retry; a timed-out provider call may still have accepted the message.
