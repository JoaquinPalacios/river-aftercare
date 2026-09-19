# Staff authentication — current production login

River Aftercare staff and operator authentication is a custom `POST /api/auth/login` Route Handler plus Auth.js-compatible **database sessions**. It is not a Server Action. Chairside `ProcedureSession` is unrelated.

Production login host: `https://app.riveraftercare.com.au/login`.

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

- invitations, forgot / reset / change password, `AccountToken`
- account status / `disabledAt`
- auth email (`AUTH_EMAIL_FROM`, Resend auth mail)
- Turnstile on login
- clinic Team UI / multi-clinic login picker
- email-address changes
- Prisma schema changes for auth
