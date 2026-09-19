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

| Field    | Login rule                   | Notes                                                                                              |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Email    | trim, lowercase, max **254** | Rejected before account lookup when over the limit.                                                |
| Password | non-empty, max **256**       | Existing short production passwords remain valid. No composition rules.                            |
| Minimum  | non-empty only               | The future **12–256** set / change / reset policy is **not** login policy and is not in this path. |

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

## Explicitly not in this login path

- invitations, forgot / reset / change password UI or routes
- consuming or emailing `AccountToken` values
- account status / `disabledAt`
- sending auth email
- Turnstile on login
- clinic Team UI / multi-clinic login picker
- email-address changes

Login input bounds, dummy verification, generic 401, and WAF-only rate limiting are unchanged.

## AccountToken foundation (not user-facing yet)

`AccountToken` is the account-lifecycle token model. Auth.js `VerificationToken` remains unused and is **not** reused: it has no purpose, `consumedAt`, `clinicId`, `role`, or revocation semantics.

| Field                                   | Rule                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `tokenHash`                             | Unique SHA-256 of the raw token. Raw tokens are never stored.                                                        |
| `type`                                  | `PASSWORD_RESET` or `INVITATION`                                                                                     |
| `userId`                                | Required. Cascade delete with the subject user.                                                                      |
| `email`                                 | Invitation/reset identity snapshot. Service normalizes trim + lowercase, max 254. Does **not** rewrite `User.email`. |
| `clinicId` / `role` / `invitedByUserId` | Invitation only. Password reset stores nulls.                                                                        |
| `expiresAt`                             | Required. Password reset 30 minutes. Invitation 7 days.                                                              |
| `consumedAt` / `revokedAt`              | Nullable. Outstanding means both null.                                                                               |

Raw token: `crypto.randomBytes(32)` encoded as base64url (256-bit, URL-safe). Hash: SHA-256 hex. Helpers live in `lib/auth/account-token.ts` (server-only).

Service primitives in `lib/auth/account-token-service.ts` (server-only):

- create password-reset token (revoke prior outstanding reset for that user, then insert, 30 minutes)
- create invitation token (revoke prior outstanding invite for that user+clinic, then insert, 7 days)
- lookup by raw token + expected type (missing / wrong type / expired / consumed / revoked)
- consume / revoke outstanding helpers for later transactional flows

Creation runs in a PostgreSQL transaction: advisory lock, revoke outstanding rows, insert. Partial unique indexes in the additive migration are the concurrency safety net. Expiry is **not** in those indexes (`NOW()` is volatile). Expired outstanding rows are revoked when a replacement is created.

No public route, Server Action, or login code consumes these primitives yet. Forgot-password, reset-password, invitation acceptance, resend/revoke UI, and change-password are later PRs.

## Auth transactional email (not sent yet)

Shared transport: `lib/email/transactional-mailer.ts`. Marketing Contact and future auth mail both send through it. They do **not** share From/To/Reply-To.

| Variable              | Purpose                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`      | Existing send-only, domain-scoped Resend key. Shared. Never client-bundled.                                                                                                        |
| `AUTH_EMAIL_FROM`     | Future account-lifecycle From. Production intended: `River Aftercare <accounts@mail.riveraftercare.com.au>`. Not a runtime default. Required only when auth mail is actually sent. |
| `AUTH_EMAIL_REPLY_TO` | Optional. Production intended: `contact@riveraftercare.com.au`.                                                                                                                    |

Config is lazy (`getAuthEmailDeliveryConfig`). Missing `AUTH_EMAIL_FROM` does not fail `next build`. Vercel production never uses the memory transport for auth mail. Local/tests use memory. No invitation or password-reset templates are sent in this foundation.

See [TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md).
