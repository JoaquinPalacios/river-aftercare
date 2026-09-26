-- Group billing foundation.
-- Additive capacity facts on ClinicEntitlement.
-- Does not backfill or rewrite siteAllowance / locationAllowance.
-- Does not create, delete, activate, or deactivate ClinicSite or ClinicLocation rows.
-- Null purchasedAdditionalSiteQuantity keeps the stored totals in force.
-- It is not paid quantity zero.

ALTER TABLE "ClinicEntitlement" ADD COLUMN "purchasedAdditionalSiteQuantity" INTEGER,
ADD COLUMN "extraSiteAllowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extraLocationAllowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "offeredAdditionalSiteQuantity" INTEGER,
ADD COLUMN "scheduledAdditionalSiteQuantity" INTEGER,
ADD COLUMN "scheduledCapacityEffectiveAt" TIMESTAMP(3);

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_purchasedAdditionalSiteQuantity_check" CHECK (
    "purchasedAdditionalSiteQuantity" IS NULL
    OR "purchasedAdditionalSiteQuantity" >= 0
);

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_extraSiteAllowance_check" CHECK ("extraSiteAllowance" >= 0);

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_extraLocationAllowance_check" CHECK ("extraLocationAllowance" >= 0);

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_offeredAdditionalSiteQuantity_check" CHECK (
    "offeredAdditionalSiteQuantity" IS NULL
    OR "offeredAdditionalSiteQuantity" >= 0
);

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_scheduledAdditionalSiteQuantity_check" CHECK (
    "scheduledAdditionalSiteQuantity" IS NULL
    OR "scheduledAdditionalSiteQuantity" >= 0
);
