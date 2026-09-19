# ADR 0024 — Account lifecycle tokens and shared transactional email

- **Status:** Accepted
- **Date:** 2026-09-19
- **PRD:** [../product/PRD.md](../product/PRD.md)
- **Related:** [AUTH.md](../architecture/AUTH.md), [TRANSACTIONAL-EMAIL.md](../architecture/TRANSACTIONAL-EMAIL.md), [MARKETING-CONTACT.md](../architecture/MARKETING-CONTACT.md)

## Context

River Aftercare production login is email + password with database sessions. There is still no production-safe way to invite a clinic user, let them set a password, or reset a forgotten password.

Auth.js `VerificationToken` cannot carry purpose, consumption, clinic, role, or revocation. Marketing Contact already sends through Resend from `website@mail.riveraftercare.com.au` using `RESEND_API_KEY`. Account-lifecycle mail needs a different From identity on the same verified domain (`accounts@mail.riveraftercare.com.au`) without a second vendor or a second API key.

Public invitation / reset / change-password surfaces must not appear before the primitives exist.

## Decision

- Add an additive `AccountToken` model (`INVITATION` | `PASSWORD_RESET`). Store only SHA-256(`tokenHash`) of a 256-bit base64url raw token.
- Enforce one outstanding password-reset per user and one outstanding invitation per user+clinic with a create-time transaction (revoke then insert) plus PostgreSQL partial unique indexes. Do not put `NOW()` in those indexes.
- Password-reset rows have null `clinicId` / `role` / `invitedByUserId` and expire in 30 minutes. Invitation rows require clinic + role, record `invitedByUserId` when created by an operator, and expire in 7 days.
- Delete behaviour: subject user and clinic cascade; inviter deletion sets `invitedByUserId` to null so invite history is not deleted.
- Extract a generic `sendTransactionalEmail` transport. Marketing Contact keeps its enquiry behaviour. Auth mail uses `AUTH_EMAIL_FROM` / optional `AUTH_EMAIL_REPLY_TO`, lazily, and does not send in this change.
- Reuse `RESEND_API_KEY`. Do not add SMTP, Nodemailer, or a second Resend key.
- Do not add forgot-password, reset-password, invitation UI/routes, membership mutations, or auth email sends in the same change as these primitives.

## Consequences

- Later invitation and password-reset PRs can create, look up, consume, and revoke tokens without redesigning storage.
- Contact production behaviour stays equivalent: same From/To/Reply-To, Turnstile, and generic failure copy.
- Production auth mail still requires Joaquín to set `AUTH_EMAIL_FROM` (and optional Reply-To) in Vercel when those flows land. The key already exists.
- No user-facing account-lifecycle capability is reachable from this foundation alone.

## Notes for later implementation

- Do not email raw tokens, log them, or persist them.
- Do not treat `AccountToken.email` as a migration of `User.email` normalisation.
- Do not send invitation or reset mail until those routes exist and copy is reviewed.
- Do not put Turnstile on login solely because Contact has it.
