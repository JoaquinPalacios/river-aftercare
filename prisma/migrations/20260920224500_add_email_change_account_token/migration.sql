-- Additive EMAIL_CHANGE token type for verify-first email changes.
-- Does not rewrite User.email, memberships, sessions, or existing tokens.
-- The new enum value is committed here so later statements can use it.

ALTER TYPE "AccountTokenType" ADD VALUE 'EMAIL_CHANGE';
