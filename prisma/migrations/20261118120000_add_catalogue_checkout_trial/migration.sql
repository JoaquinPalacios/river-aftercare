-- Catalogue Checkout trial state.
-- Additive. Existing ClinicEntitlement rows are unchanged.
-- Do not use the new enum value in this migration.
-- Do not apply this migration to production from this change.

-- AlterEnum
ALTER TYPE "BillingStatus" ADD VALUE 'TRIALING';

-- AlterTable
ALTER TABLE "ClinicEntitlement" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
