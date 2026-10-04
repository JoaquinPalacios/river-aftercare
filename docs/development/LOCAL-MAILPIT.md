# Local Mailpit inbox

Mailpit is an optional local inbox for invitation, password-reset, and email-change messages. Ordinary `pnpm dev`, Vitest, Playwright, and Cursor Cloud keep the in-memory auth transport and do not start Mailpit.

Production stays on Resend. Do not set `AUTH_EMAIL_TRANSPORT` in Vercel.

## Start Mailpit

Install the standalone binary and leave it running:

```bash
brew install mailpit
mailpit
```

On a machine without Homebrew, use the current release binary from [github.com/axllent/mailpit/releases](https://github.com/axllent/mailpit/releases) and run `mailpit`.

An optional container, separate from `compose.yaml`:

```bash
docker run --rm -p 127.0.0.1:8025:8025 axllent/mailpit
```

Mailpit’s web UI and HTTP API use port **8025**. River Aftercare does not use Mailpit’s SMTP port.

## Enable the local transport

In the gitignored `.env` used by `pnpm dev`:

```bash
AUTH_EMAIL_TRANSPORT=mailpit
```

Restart `pnpm dev` after changing it. The application sends with `POST http://127.0.0.1:8025/api/v1/send`. That address is fixed. A different host or port is not read from the environment.

Mailpit is used only when all of these are true:

- `AUTH_EMAIL_TRANSPORT=mailpit`
- `NODE_ENV=development` (`pnpm dev`)
- `VERCEL` is unset and `VERCEL_ENV` is unset

`VERCEL_ENV=production` still selects Resend and ignores this setting. Preview, `vercel dev`, `pnpm test`, and `pnpm start` keep the existing transport. Unset `AUTH_EMAIL_TRANSPORT` to go back to the in-memory inbox.

`AUTH_EMAIL_FROM` is still required before a message can be sent. `.env.example` already has a local example. Marketing Contact stays on `CONTACT_MAILER` and does not arrive in Mailpit.

Open the inbox at [http://localhost:8025](http://localhost:8025).

If Mailpit is selected and is not running, delivery returns `delivery_failed`. The invitation is kept, and Invite user stays on the form with “Invitation created, but the email could not be sent. Try resending it.” Nothing is recorded as sent.

## Invite an administrator

1. Sign in at [http://app.localhost:3000/login](http://app.localhost:3000/login) as the local operator (`LOCAL_OPERATOR_EMAIL` / `LOCAL_OPERATOR_PASSWORD`).
2. Open **All Clinics** → **Create clinic**. Choose a practice name and a tenant slug other than `demodental`.
3. Open that clinic’s **Team** → **Invite user**. Enter a name and an email address you can recognise in Mailpit, and choose **Administrator**.
4. In [http://localhost:8025](http://localhost:8025), open the new message. The setup link is `http://app.localhost:3000/accept-invitation#token=…`. Use the link in the message. The token is only in that fragment. Copy the plain-text URL when the HTML link drops it.
5. Complete the password form on `app.localhost`. Sign in with that new email and password.

While the invitation is still pending, **Resend invitation** on Team sends a new message and retires the previous link. Accept the message that arrived last.

## Password reset

Sign out, open [http://app.localhost:3000/forgot-password](http://app.localhost:3000/forgot-password), and submit the new administrator’s email. The page always shows the same confirmation. The reset message in Mailpit links to `http://app.localhost:3000/reset-password#token=…`. Open it on `app.localhost` and choose a new password.

A Mailpit outage does not show a delivery error on that public form. The reset token is revoked, so a missing message means the request did not produce a usable link. Start Mailpit and submit the form again.
