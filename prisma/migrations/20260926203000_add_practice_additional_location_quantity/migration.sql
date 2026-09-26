-- Practice Additional Location capacity foundation.
-- Additive. Null purchasedAdditionalLocationQuantity keeps the stored
-- Practice locationAllowance in force. It is not paid quantity zero.
-- Does not backfill, and does not create or deactivate ClinicLocation rows.

ALTER TABLE "ClinicEntitlement" ADD COLUMN "purchasedAdditionalLocationQuantity" INTEGER;

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_purchasedAdditionalLocationQuantity_check" CHECK (
    "purchasedAdditionalLocationQuantity" IS NULL
    OR "purchasedAdditionalLocationQuantity" >= 0
);
