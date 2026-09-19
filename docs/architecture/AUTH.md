# Staff authentication — current production login

River Aftercare staff and operator authentication is a custom `POST /api/auth/login` Route Handler plus Auth.js-compatible **database sessions**. It is not a Server Action. Chairside `ProcedureSession` is unrelated.

Production login host: `https://app.riveraftercare.com.au/login`. Anonymous requests to `https://app.riveraftercare.com.au/` redirect server-side to `/login`. Authenticated requests reuse `signedInHomePath()` (`/dashboard` or `/operator/clinics`). Clinic and operator users share this one form; role is derived after authentication.

## Current path

1. Client `loginSchema` validates the form (`app/(staff)/login/login-schema.ts`).
2. `POST /api/auth/login` independently bounds and authenticates the JSON body.
3. Successful logins create a row in `auth_sessions` and set a host-only HttpOnly cookie.
4. `auth()` reads that database session. Logout deletes the row and clears the cookie.

Password hashing lives in `lib/auth/password.ts`:

- format `scrypt:<saltHex>:<hashHex>`
- `randomBytes(16)` salt
- `scryptSync(password, salt, 64)`
- `timingSafeEqual`

Do not change that format or those cost parameters from a login-hardening change. `User.passwordHash` stays nullable so invitation / set-password work can land later.

## Input bounds

Shared constants: `lib/auth/login-input.ts`.

| Field    | Login rule                   | Notes                                                                                                                 |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Email    | trim, lowercase, max **254** | Rejected before account lookup when over the limit.                                                                   |
| Password | non-empty, max **256**       | Existing short production passwords remain valid. No composition rules.                                               |
| Minimum  | non-empty only               | The **12–256** set / change / reset policy is **not** login policy. Existing short production passwords remain valid. |

The 256-character password maximum is a **resource-safety** bound so attacker-controlled strings never reach scrypt. It is not a complexity policy. `hashPassword` / `verifyPassword` enforce the same maximum as defense in depth. The login route still validates before calling them.

Client validation is UX only. Server-side field bounds are mandatory.

## Timing-oracle mitigation

Wrong-password attempts already paid for one scrypt. Unknown emails and users with `passwordHash = null` previously skipped scrypt, which made account existence easier to observe.

Login now always performs one `verifyPassword` call for in-bound passwords:

- known user with a stored hash → verify the submitted password against that hash once
- unknown email → one dummy verification against a fixed public dummy scrypt hash
- `passwordHash = null` → the same dummy verification

The dummy hash is **not a secret**, is not stored in env, and never grants a session even if it happens to match. This removes the obvious skip-scrypt distinction. It does not claim perfect constant-time network behaviour.

Oversized passwords (257+) are rejected with **zero** scrypt operations.

## External errors

Generic credential failure remains:

- HTTP 401
- `{ error: "Invalid credentials." }`
- UI copy: “Invalid email or password.”

Unknown email, wrong password, and null `passwordHash` share that external failure. Do not expose “user does not exist”, “password not set”, hash format errors, or dummy-verification details.

After a **correct** password, existing access rules still apply:

- no membership and not `OPERATOR` → 403
- more than one membership → 409
- operator with zero memberships → `/operator/clinics`
- exactly one membership → `/dashboard`

## Host restriction

`proxy.ts` is the host gate:

- staff/operator login and `/api/auth/*` are available on `app.<root>`
- marketing apex returns 404 for those paths
- tenant hosts return 404 for those paths

The login Route Handler does not duplicate that classification. Preview routing is unchanged.

## Rate limiting

There is **no application rate limiter** (no in-memory map, Redis/KV, or database counter).

Durable attempt-rate protection is the existing Vercel WAF rule:

- Host: `app.riveraftercare.com.au`
- Path: `/api/auth/login`
- Method: `POST`
- Limit: **15 requests / 10 minutes / IP**

This application hardens the work beneath that rule: bounded inputs, one password-verification cost, generic errors.

Login does **not** use Cloudflare Turnstile. Marketing `/contact` Turnstile is unrelated.

## Explicitly not in the login path

- invitations / Team management
- email-address changes
- account status / `disabledAt`
- Turnstile on login or forgot-password
- clinic multi-clinic login picker

Login input bounds, dummy verification, generic 401, and WAF-only login rate limiting are unchanged.

Forgot / reset / change password are implemented on dedicated staff-host routes. They are not part of `POST /api/auth/login`.

## New-password policy

Constants: `lib/auth/password-policy.ts`.

| Rule                  | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| New password minimum  | **12**                                                                                            |
| New password maximum  | **256** (same resource-safety maximum as login)                                                   |
| Composition           | None. Passphrases, spaces, paste, and password managers are allowed. Passwords are never trimmed. |
| Applies to            | Change password, reset password. Future invitation acceptance will use the same constants.        |
| Does **not** apply to | Login, or verifying the user's existing current password.                                         |

257+ new passwords are rejected before `hashPassword` / scrypt.

## Account security

Shared authenticated route: `/account/security`.

Any signed-in `User` can change their own password: platform `OPERATOR` (no clinic membership required), clinic `ADMIN`, and clinic `STAFF`. The page is **not** inside the clinic-membership-only portal layout; the account layout reuses operator chrome or clinic portal chrome based on the signed-in principal.

Change-password Server Action (`changePasswordAction`):

1. Staff-host check + `requireAuthenticatedUser`
2. Validate current password (non-empty, ≤256) and new password (12–256, confirmation match)
3. Verify current password with `verifyPassword`
4. Hash the new password
5. One Prisma transaction: update `passwordHash`, delete all `Session` rows for that user, create a replacement session via `createDatabaseSession(userId, tx)`
6. Set the replacement session cookie after commit

Wrong current password returns “Current password is incorrect.” Success keeps the current browser signed in and shows “Password updated.” Other browsers are signed out. Other users' sessions are untouched.

If cookie-setting fails after the transaction commits, the stale cookie is cleared and the user is sent to `/login`. The password change is not rolled back.

## Forgot password

`/forgot-password` and `POST /api/auth/forgot-password` (staff host only). Marketing apex and tenant hosts 404.

The visitor always receives:

> If an account exists for that email, we've sent password reset instructions.

A reset email is sent only when:

- a User exists for the normalized email
- `passwordHash` is not null

Null-hash users are treated as pending/unestablished credentials: generic response, no token, no email. Unknown emails: no token, no email, no eligible-request log.

Durable cooldown: 10 minutes per user, using outstanding `PASSWORD_RESET` `AccountToken` rows (`createPasswordResetTokenIfAllowed`). Concurrent requests share the existing advisory lock so they cannot both send. After the cooldown, a new request supersedes any leftover outstanding reset.

Application abuse controls: generic response, email max 254, user-level cooldown, no reset for unknown/pending accounts, no raw IP storage, no in-memory limiter, no Turnstile. Login WAF is unchanged.

Timing: unknown users skip Resend. Residual timing differences exist and are not hidden with dummy emails or sleeps.

## Password reset email

`sendAuthTransactionalEmail` + `composePasswordResetEmail`. Recipient is `User.email` from the database record, never an arbitrary submitted mailbox after lookup. From/Reply-To come from `AUTH_EMAIL_FROM` / optional `AUTH_EMAIL_REPLY_TO`.

Subject: `Reset your River Aftercare password`. Body includes a one-time link that expires in 30 minutes, ignore-if-unsolicited copy, and optional reply guidance. Plain text + escaped HTML. No password, hash, session, token hash, or clinic/patient data.

Reset URL origin is `staffAppOrigin()` from `CARE_GUIDE_ROOT_DOMAIN` (`https://app.<root>` in production). Host / `x-forwarded-host` are not used to build the link.

The raw token travels in a **URL fragment**:

`https://app.riveraftercare.com.au/reset-password#token=<RAW_TOKEN>`

Fragments are not sent in the HTTP request, so the raw token is absent from ordinary path/query logs. `/reset-password` reads `window.location.hash` in the client, keeps the token in memory, and submits it only in the reset POST body. It is not written to localStorage, sessionStorage, or cookies. Analytics `beforeSend` strips reset-password hashes.

If auth-email config is missing/malformed when an eligible send is attempted: fail closed, generic visitor response, `password_reset_email_failed` / `not_configured` log with user id. Vercel production never falls back to memory, Contact From, or SMTP.

If delivery definitively fails after a token was created, that token is revoked best-effort so the 10-minute cooldown does not block a retry. Provider timeouts are ambiguous (Resend may have accepted the mail); revocation on failure can leave a mailed link dead, but the visitor can request again. That is preferred over a cooldown with no usable email.

## Reset password

`/reset-password` and `POST /api/auth/reset-password` (staff host + Origin check).

Invalid, expired, consumed, revoked, wrong-type, or malformed tokens share:

> This password reset link is invalid or has expired.

with a link to `/forgot-password`. Identity is not revealed.

`completePasswordReset` runs in a transaction: look up the hashed token, take the existing per-user password-reset advisory lock (the lock key is the user id, not the token hash), conditionally consume, update the password, delete all sessions for that user, and revoke other outstanding resets. Only one concurrent submit can succeed. The new password is hashed after a cheap token-format check and before the transaction. Failed updates roll back consume. Successful reset does **not** create a session. The user signs in at `/login?reset=success` (fixed flag → fixed copy).

## Session lifetime

Unchanged: replacement and login sessions still expire `AUTH_SESSION_MAX_AGE_SECONDS` (**30 days**) from creation. This PR does not add Remember me and does not change Auth.js database-session `maxAge` / `updateAge`.

Inspection: login/`createDatabaseSession` writes a fixed `expires = now + 30 days`. Auth.js database strategy may refresh expiry on subsequent `auth()` reads according to its default `updateAge` (sliding with a throttle). Do not treat that as a product change in this PR.

## Host restriction

`proxy.ts` remains the host gate. Staff-path prefixes include `/login`, `/forgot-password`, `/reset-password`, `/account`, and `/api/auth`. Marketing apex and tenant hosts 404 those paths.

Forgot/reset Route Handlers also require a staff `Host` (and a staff `Origin` when present). Change-password is a Server Action with an explicit staff-host check. Login still relies on the proxy boundary alone.

## Security logging

Structured events only: `password_changed`, `password_reset_requested`, `password_reset_email_failed`, `password_reset_completed`. Prefer user id. Never log passwords, raw tokens, token hashes, reset URLs, session tokens, API keys, or mail bodies. Unknown emails are not logged.

## AccountToken

`AccountToken` remains the account-lifecycle token model. Auth.js `VerificationToken` is unused and is **not** reused.

| Field                                   | Rule                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `tokenHash`                             | Unique SHA-256 of the raw token. Raw tokens are never stored.                                                        |
| `type`                                  | `PASSWORD_RESET` or `INVITATION`                                                                                     |
| `userId`                                | Required. Cascade delete with the subject user.                                                                      |
| `email`                                 | Invitation/reset identity snapshot. Service normalizes trim + lowercase, max 254. Does **not** rewrite `User.email`. |
| `clinicId` / `role` / `invitedByUserId` | Invitation only. Password reset stores nulls.                                                                        |
| `expiresAt`                             | Required. Password reset 30 minutes. Invitation 7 days.                                                              |
| `consumedAt` / `revokedAt`              | Nullable. Outstanding means both null.                                                                               |

Password-reset creation for forgot-password uses `createPasswordResetTokenIfAllowed` (10-minute cooldown inside the existing advisory lock, then supersede + insert). Invitation token primitives exist but have **no** public UI or mail in this PR.

## Auth transactional email

Shared transport: `lib/email/transactional-mailer.ts`. Marketing Contact and auth mail share transport only.

| Variable              | Purpose                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`      | Existing send-only, domain-scoped Resend key. Shared. Never client-bundled.                                               |
| `AUTH_EMAIL_FROM`     | Password-reset From. Production intended: `River Aftercare <accounts@mail.riveraftercare.com.au>`. Not a runtime default. |
| `AUTH_EMAIL_REPLY_TO` | Optional. Production intended: `contact@riveraftercare.com.au`.                                                           |

Config is lazy (`getAuthEmailDeliveryConfig`). Missing `AUTH_EMAIL_FROM` does not fail `next build`. Vercel production never uses the memory transport for auth mail. Local/tests use memory.

See [TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md).

## Not yet implemented

- invitations, invitation acceptance, resend invitation
- clinic Team / user management
- membership creation/removal
- multi-clinic picker
- email-address changes
- global account disable
- login or forgot-password Turnstile
