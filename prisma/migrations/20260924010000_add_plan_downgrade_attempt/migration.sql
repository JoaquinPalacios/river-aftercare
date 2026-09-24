-- One opaque River id for a Practice → Essential scheduling lifecycle.
-- Stable across retries of that attempt. Null when no attempt is open.
-- Not a Stripe object id. PostgreSQL allows many nulls under the unique index.
-- Additive only. Do not apply this migration to production from this change.

ALTER TABLE "ClinicBillingProfile" ADD COLUMN "stripePlanDowngradeAttemptId" TEXT;

CREATE UNIQUE INDEX "ClinicBillingProfile_stripePlanDowngradeAttemptId_key" ON "ClinicBillingProfile"("stripePlanDowngradeAttemptId");
