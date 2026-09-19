# Marketing clinic enquiry delivery

Platform `/contact` submits a clinic enquiry through a server action. There is no client-side fake success: the confirmation state is returned only after Turnstile verification and `deliverMarketingContactEnquiry` both succeed.

This is business contact information, not patient health information. The form must not be used for patient support, clinical advice, emergencies, or medical communication.

## Production flow

```text
Visitor
  → Contact form
  → Cloudflare Turnstile (Managed widget)
  → submitMarketingContactAction (apex /contact only)
  → server-side Siteverify
  → Zod validation + honeypot (`website`)
  → Resend
  → CONTACT_EMAIL_TO (contact@riveraftercare.com.au in production)
  → Hostinger mailbox
  → Gmail forwarding (operator workflow, not application infrastructure)
```

- **Hostinger** owns the inbound mailbox for `riveraftercare.com.au`.
- **Resend** sends application-generated outbound contact notifications from the verified domain `mail.riveraftercare.com.au`.
- **Gmail forwarding** is how operators read and reply as `contact@riveraftercare.com.au`. The app never talks to Gmail or Hostinger SMTP.
- **Turnstile** is mandatory server-side verification. The widget alone is not protection.
- The current Vercel WAF `contact-post-observe` rule logs `POST /contact` on the apex host. It is observation, not an application rate limiter.
- Do not submit patient or medical data through this form.

## Fields

Required:

- Full name
- Email (user-facing label; the internal field name remains `workEmail`)
- Practice / clinic name
- Turnstile token (`cf-turnstile-response`)

Optional:

- Phone
- Anything you'd like us to know?

Honeypot (not shown to ordinary users):

- `website`

The form does **not** ask for number of locations, patient information, or clinical details.

## Environment

Server-only except the Turnstile site key, which is intentionally public. Never commit real credentials.

| Variable                         | Purpose                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `CONTACT_EMAIL_TO`               | Destination inbox only. Never accepted from the request.                                         |
| `CONTACT_EMAIL_FROM`             | Envelope From only. Supports `Name <email@domain>`. Never accepted from the request.             |
| `RESEND_API_KEY`                 | Server-only Resend API key. Send-only and domain-scoped in production.                           |
| `CONTACT_MAILER`                 | `resend` (default) or `memory` (local/E2E sink). Memory is refused when `VERCEL_ENV=production`. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. Browser-visible by design.                                        |
| `TURNSTILE_SECRET_KEY`           | Cloudflare Turnstile secret. Server-only. Production fails closed if this is missing.            |

Deprecated local fallbacks (do not set in Vercel): `MARKETING_CONTACT_TO_EMAIL`, `MARKETING_CONTACT_FROM_EMAIL`, `MARKETING_CONTACT_EMAIL`, `MARKETING_CONTACT_MAILER`.

Obsolete SMTP variables — no longer read by the app. Joaquín can delete them from Vercel if they exist:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_SECURE`

Local / documentation examples only:

```bash
CONTACT_EMAIL_TO=hello@example.test
CONTACT_EMAIL_FROM="River Aftercare <website@example.test>"
CONTACT_MAILER=memory
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

The Turnstile values above are Cloudflare’s [documented dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/). They are for local development and CI. Production must use the real widget keys from the Cloudflare dashboard.

`CONTACT_MAILER=memory` is for local development and Playwright. Do not use it in production. Vercel production always uses Resend and fails closed without `RESEND_API_KEY`, `CONTACT_EMAIL_TO`, and `CONTACT_EMAIL_FROM`.

## Abuse controls

- Cloudflare Turnstile Managed widget on the marketing Contact form only
- Mandatory server-side Siteverify with an explicit timeout
- Production fail-closed if `TURNSTILE_SECRET_KEY` is missing
- Server Zod validation and maximum lengths
- Honeypot field (`website`): populated submissions are not delivered and receive the same generic failure as other delivery problems
- HTML is escaped in the HTML email part; fields are treated as plain text
- Reply-To is the sanitised visitor email; recipient and From come only from env
- Host check: the mutation runs only on the marketing apex host
- Vercel WAF currently **observes** `POST /contact` (log). It is not treated as durable application rate limiting

The previous in-process `Map` throttle was removed. It was not a reliable distributed limiter on Vercel and must not be described as production protection.

Do **not** add Turnstile to tenant patient pages, clinic portal, or operator login from this Contact work.

## Client boundary

`app/(marketing)/components/contact-form.tsx` is the Contact client island. Turnstile rendering lives in `contact-turnstile.tsx`. Inline validation uses `lib/marketing/contact-fields.ts` (no Zod). Server validation still uses Zod in `contact-enquiry.ts` before the mailer runs.

`RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` must never appear in Client Components or the browser bundle. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is the only Turnstile value allowed in the browser.

## Architecture

```text
ContactForm
  → Cloudflare Turnstile widget
  → submitMarketingContactAction (marketing host only)
  → Siteverify
  → ContactEnquiry (Zod, server-only) + honeypot
  → MarketingContactMailer
  → sendTransactionalEmail (Resend or memory)
```

Transport is shared with future account-lifecycle mail. Identities are not: Contact keeps `CONTACT_EMAIL_FROM` / `CONTACT_EMAIL_TO` / visitor Reply-To. Auth mail will use `AUTH_EMAIL_FROM` / optional `AUTH_EMAIL_REPLY_TO`. See [TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md) and [AUTH.md](AUTH.md). `AUTH_EMAIL_*` must not be used for Contact.
