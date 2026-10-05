-- Distinguishes clinics created through assisted operator onboarding.
-- Existing rows stay false and keep the legacy path when they have no entitlement.
-- Additive. No entitlement, invitation, Stripe Price, or email is written.
-- Do not apply this migration to production from this change.

ALTER TABLE "Clinic" ADD COLUMN "assistedOnboarding" BOOLEAN NOT NULL DEFAULT false;
