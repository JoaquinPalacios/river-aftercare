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

Do not change that format or those cost parameters from a login-hardening change. `User.passwordHash` stays nullable so invitation acceptance can create credentials later.

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

After a **correct** password, existing access rules still apply. Login counts **active** `ClinicMembership` rows only (`active = true`). Inactive memberships do not grant clinic access and do not count toward the one-clinic login rule:

- no **active** membership and not `OPERATOR` → 403
- more than one **active** membership → 409
- operator with zero active memberships → `/operator/clinics`
- exactly one active membership → `/dashboard`

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
- email-address changes (self-service lives on `/account`, not on login)
- global account status / `disabledAt`
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
| Applies to            | Change password, reset password, invitation acceptance. Use the same constants.                   |
| Does **not** apply to | Login, or verifying the user's existing current password.                                         |

257+ new passwords are rejected before `hashPassword` / scrypt.

## Account

Shared authenticated route: `/account`. `/account/security` redirects to `/account#security`.

Any signed-in `User` can manage their own identity: platform `OPERATOR` (no clinic membership required), clinic `ADMIN`, and clinic `STAFF`. These fields belong to `User`, not to a clinic membership. The page is **not** inside the clinic-membership-only portal layout; the account layout reuses operator chrome, clinic portal chrome, or a minimal authenticated shell based on the signed-in principal.

### Profile (name and email)

`updateProfileAction` → `updateOwnProfile`:

1. Staff-host check + `requireAuthenticatedUser`. The target is always the signed-in user id.
2. Name: trim / collapse whitespace, reject empty, reject `<>`, max **80**.
3. Email: trim, lowercase, max **254**, same format check as account-token emails (`parseEmailAddress`).
4. Name-only changes do not require the current password.
5. Email changes require the current password (`verifyPassword`). There is **no** email-change verification mail. `User.emailVerified` is cleared. Outstanding `PASSWORD_RESET` tokens for that user are revoked. The current database session stays (sessions store user id; `auth()` re-reads name/email from `User`). Other sessions are not deleted on email change.
6. Global uniqueness: advisory lock on the normalized email, then reject if another user already has it (`P2002` maps to the same friendly error).

Wrong current password returns “Current password is incorrect.” Duplicate email returns “That email is already in use.” Success copy: “Profile updated.” or “Email updated.”

Operators cannot edit another user's global name or email from clinic Team / Practice.

### Change password

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

`proxy.ts` remains the host gate. Staff-path prefixes include `/login`, `/forgot-password`, `/reset-password`, `/accept-invitation`, `/account`, `/operator`, and `/api/auth`. Marketing apex and tenant hosts 404 those paths.

Forgot/reset/accept-invitation/invitation-status Route Handlers also require a staff `Host` (and a staff `Origin` when present). Change-password and operator Team mutations are Server Actions with an explicit staff-host check. Login still relies on the proxy boundary alone.

## Security logging

Structured events only: `password_changed`, `password_reset_requested`, `password_reset_email_failed`, `password_reset_completed`, `profile_name_changed`, `email_changed`, `invitation_created`, `invitation_email_failed`, `invitation_resent`, `invitation_cancelled`, `invitation_accepted`, `clinic_access_removed`, `clinic_access_restored`, `clinic_role_updated`, `clinic_membership_deactivated`, `clinic_membership_reactivated`, `operator_clinic_settings_updated`. Prefer user id (and clinic id for invitations / membership / operator clinic edits). Never log passwords, raw tokens, token hashes, reset/invite URLs, session tokens, API keys, or mail bodies. Unknown emails are not logged.

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

Password-reset creation for forgot-password uses `createPasswordResetTokenIfAllowed` (10-minute cooldown inside the existing advisory lock, then supersede + insert). Invitation creation uses `createInvitationToken` (7-day TTL, one outstanding invite per user+clinic). `completeInvitation` consumes an invitation, sets the password, and creates the clinic membership in one transaction.

## Auth transactional email

Shared transport: `lib/email/transactional-mailer.ts`. Marketing Contact and auth mail share transport only.

| Variable              | Purpose                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`      | Existing send-only, domain-scoped Resend key. Shared. Never client-bundled.                                                              |
| `AUTH_EMAIL_FROM`     | Password-reset and invitation From. Production intended: `River Aftercare <accounts@mail.riveraftercare.com.au>`. Not a runtime default. |
| `AUTH_EMAIL_REPLY_TO` | Optional. Production intended: `contact@riveraftercare.com.au`.                                                                          |

Config is lazy (`getAuthEmailDeliveryConfig`). Missing `AUTH_EMAIL_FROM` does not fail `next build`. Vercel production never uses the memory transport for auth mail. Local/tests use memory.

See [TRANSACTIONAL-EMAIL.md](TRANSACTIONAL-EMAIL.md).

## Operator clinic invitations

Operator-managed clinic provisioning. Clinic ADMIN/STAFF cannot invite. There is no clinic-admin Team self-service in this change.

```text
Operator creates clinic
  → Team
  → Invite user (name, email, role)
  → pending User (passwordHash null, platformRole NONE, no ClinicMembership)
  → invitation email with fragment setup link
  → recipient chooses a 12–256 password
  → membership created from the persisted token
  → /login?invite=success
  → normal login → /dashboard
```

### Team UI

`/operator/clinics/[clinicId]/team` (staff host + `requirePlatformOperator`). Columns: Name, Email, Role, Status, Actions.

Team rows are memberships plus pending invitations.

| Status             | Source of truth                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Active             | `ClinicMembership` exists and `active = true`                                                         |
| Inactive           | `ClinicMembership` exists and `active = false` (STAFF only; reversible clinic access)                 |
| Pending            | `passwordHash` null, zero memberships, outstanding unexpired `INVITATION` for this clinic             |
| Invitation expired | `passwordHash` null, zero memberships, latest this-clinic invitation outstanding but past `expiresAt` |

Cancelled invitations (revoked, not consumed) are hidden. Re-invite the same email from **Invite user** when the person is a same-clinic pending/expired/cancelled `passwordHash`-null user.

Roles in this UI: Administrator / Staff. Initial role is chosen on invite. Active members expose **Change role** (overflow menu + dialog) so the platform operator can switch ADMIN ↔ STAFF. Pending/expired invitations keep Resend / Cancel only; their intended role comes from the invitation token.

Active members also expose **Remove access** (overflow menu + confirmation). After confirm, the destructive button shows a spinner and “Removing…”, Cancel is disabled, and the row menu cannot be used again until the mutation finishes. Removal deletes only that `ClinicMembership` and all database sessions for that User. The User row, email, passwordHash, and AccountToken history are kept so the same credentials can be restored later. There is **no last-admin guard** while Team provisioning remains operator-only; a clinic may have zero members, and changing the only ADMIN to STAFF is allowed.

Successful invite delivery redirects to Team with `?status=invitation-sent` → “Invitation sent.” The pending person is already in the list. Delivery failure stays on Invite user with the controlled operational error; resend remains available from Team. Successful role change redirects with `?status=role-updated` → “Role updated.”

### Invite rules

Mutations are Server Actions. Clinic comes from the operator-authorized route. Inviter is the authenticated OPERATOR. Browser cannot assign `platformRole`, `passwordHash`, token type, or From/To.

| Existing account                       | Result                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| New email                              | Create User (`passwordHash` null, `platformRole` NONE). No membership yet. Send invitation.                                 |
| Active member of this clinic           | “This user already has access to this clinic.”                                                                              |
| Active member of another clinic        | “This user already belongs to another clinic. Multi-clinic access is not supported yet.”                                    |
| Platform operator                      | “This account is a River Aftercare platform operator.”                                                                      |
| Pending same clinic (usable token)     | Direct operator to **Resend invitation**.                                                                                   |
| Pending/history tied to another clinic | Blocked. Same multi-clinic limitation.                                                                                      |
| Expired/cancelled same-clinic pending  | New invitation token for the same User. Name may be updated.                                                                |
| Active user, zero memberships          | Restore access: create one `ClinicMembership` with the operator-selected role. Keep password. No invitation token or email. |

Product invitations still refuse a second clinic (“already belongs to another clinic”). Login and `getCurrentClinicMembership` count **active** memberships only, so one active + one inactive membership can sign in to the active clinic. This change does not add a clinic switcher. Two active memberships still 409.

### Invitation email and URL

`composeInvitationEmail` + `sendAuthTransactionalEmail`. Recipient is persisted `User.email`. From/Reply-To from auth config. Subject: `Set up your River Aftercare account`. Clinic name and role are escaped. 7-day expiry. The recipient chooses their own password. No temporary password, token hash, or PHI.

URL origin is `staffAppOrigin()`. Fragment:

`https://app.riveraftercare.com.au/accept-invitation#token=<RAW_TOKEN>`

Client reads the hash, keeps the token in memory, POSTs it to `/api/auth/invitation-status` (non-consuming) before showing the password form, then POSTs it to `/api/auth/accept-invitation` on submit. Not stored in localStorage/sessionStorage/cookies. Analytics strips `/accept-invitation` hashes. Raw tokens are never persisted, listed, or logged. The status endpoint returns only `{ valid: true | false }` and never consumes the token.

If User/token creation succeeds but email delivery fails, the pending invitation is **retained** and the operator sees: “Invitation created, but the email could not be sent. Try resending it.” A provider timeout may still deliver later; keeping the token avoids guaranteeing that a late link is dead. Resend supersedes it. Restoration of a passworded zero-membership User does **not** send mail; the person already owns credentials.

### Acceptance

`/accept-invitation` (staff host only). Possession of the token is the credential; email is not re-entered. The page has explicit states: **CHECKING** (“Checking invitation…”), **VALID** (password setup form), **INVALID** (generic expired copy). A syntactically valid fragment is prevalidated with `POST /api/auth/invitation-status` before the form is shown. Consumed, expired, revoked, malformed, wrong-type, and stale-user tokens all render the same invalid copy. New password 12–256 with confirmation. Generic external failure:

> This invitation is invalid or has expired.

Guidance: contact the clinic administrator or River Aftercare. There is no anonymous resend-by-email endpoint.

Prevalidation is UX only. `completeInvitation` still revalidates and conditionally consumes the token in one transaction. A token that becomes invalid between status check and submit is still rejected, and replay cannot change `passwordHash`, role, or membership count.

`completeInvitation` (one transaction, advisory locks): validate INVITATION token; require matching User email, `passwordHash` null, `platformRole` NONE, zero memberships, clinic exists; consume token; set `passwordHash`; set `emailVerified` to acceptance time; create `ClinicMembership` with **token** clinic and role; revoke other outstanding invitations for that user. Only one concurrent accept succeeds. No session is created.

`emailVerified` is **not** required for login. It records that the mailbox received a strong invitation token.

Success: `/login?invite=success` (fixed flag → “Your account is ready. Sign in with your new password.”). Then the existing one-membership login path.

### Change role

- **Change role** (operator only, active membership): update that `ClinicMembership.role` to ADMIN or STAFF. Do not change `User.platformRole`, passwordHash, sessions, AccountToken rows, or membership count. Same-role submissions are a safe no-op. Redirect to Team with `?status=role-updated` → “Role updated.”
- Clinic role and `ClinicMembership.active` are read from the database on each request (`getCurrentClinicMembership` filters `active: true`). Auth.js database sessions store user id, name, and email only. Deactivating STAFF therefore takes effect on the next authorization read without waiting for session expiry. Other-clinic active memberships are unchanged. The User row and password stay intact.
- Platform operators cannot be made clinic members and cannot be the target of a role change.
- No last-admin guard: changing the only ADMIN to STAFF remains allowed while operator provisioning can also remove the only ADMIN or leave a clinic with zero members. Revisit last-admin protection, self-demotion, and self-removal when clinic-admin Team self-service ships.

### Clinic staff Active / Inactive

Clinic ADMIN (and a platform operator assisting that clinic) can set **STAFF** memberships Active ↔ Inactive. This is membership state, not a global User disablement.

- Server function: `updateClinicMembershipStatus` behind `actorCanManageClinic`.
- Target must belong to the same clinic, must be `STAFF`, and must not be `platformRole = OPERATOR`.
- ADMIN-to-ADMIN activation is not offered.
- Reactivation updates the existing membership row (`active = true`). It does not create a duplicate membership or send an invitation.
- Clinic Practice → Members exposes Activate / Deactivate. Operator Team uses the same status mutation.
- Inactive members lose that clinic's portal, Practice, Guides, and server actions even if they know a URL. They can still sign in when they have another active membership, and they can still use `/account`.

### Remove access / restore access

- **Remove access** (operator only, active membership): delete that `ClinicMembership`; delete all database sessions for the User; keep User / passwordHash / email / AccountToken history. Redirect to Team with `?status=access-removed` → “Access removed.” No last-admin guard.
- **Restore access** (same Invite user form, operator only): passworded User, `platformRole` NONE, zero memberships → create one membership with the selected role. Do not change the password, create a token, or send mail. Redirect to Team with `?status=access-restored` → “Access restored.” Next login is the normal one-membership `/dashboard` path.
- One clinic per User remains enforced. Platform operators cannot be invited or restored as clinic members.

### Resend / cancel

- **Resend** (pending or expired, same clinic, still `passwordHash` null, no membership): new token, previous outstanding invite revoked.
- **Cancel**: revoke outstanding INVITATION tokens for that user+clinic. User row kept. Login still generic 401.

Security logging: `invitation_created`, `invitation_email_failed`, `invitation_resent`, `invitation_cancelled`, `invitation_accepted`, `clinic_access_removed`, `clinic_access_restored`, `clinic_role_updated`, `clinic_membership_deactivated`, `clinic_membership_reactivated`. User id + clinic id (plus actor user id for status changes). Never passwords, raw tokens, hashes, URLs, or provider errors.

## Operator clinic support

Platform `OPERATOR` is not a clinic member. Operators manage clinic-owned data through `lib/auth/clinic-authorization.ts` (`canAccessClinic`, `canManageClinic`, `canManageClinicBranding`, `canManageClinicMembers`, `canManageClinicGuides`). Those helpers treat `PlatformRole.OPERATOR` as able to manage an existing clinic without a membership row.

To work inside the clinic portal (Overview / Guides / Practice), an operator submits **Manage clinic workspace** on the clinic detail page. That sets an HttpOnly `river_operator_support_clinic` cookie. `getAuthContext` synthesizes an in-memory ADMIN-equivalent clinic context with `source: "operator_support"`. `requireClinicAdmin` accepts that source only when `platformRole` is `OPERATOR`. Clinic mutations still take `clinicId` from that authorized context, never from a hidden form clinic id on portal actions.

Operators must not set another user's password. Password recovery stays on forgot/reset or invitation resend.

## Not yet implemented

- clinic ADMIN / STAFF inviting users
- last-admin protection (revisit when clinic-admin Team self-service ships; operator retains platform control)
- multi-clinic picker
- email-change verification mail (current contract is current-password + immediate email update)
- global account disable
- login or forgot-password Turnstile
- operator editing of another user's global name/email/password
