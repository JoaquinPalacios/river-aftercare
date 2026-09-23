-- Scheduled Practice → Essential downgrade projection.
-- Additive only. commercialPlan is unchanged until Stripe applies the new Price.
-- The schedule id is the River-managed Subscription Schedule, not a second
-- subscription. Null means nothing is scheduled. PostgreSQL allows many nulls
-- under the unique index.

ALTER TABLE "ClinicBillingProfile" ADD COLUMN "stripeSubscriptionScheduleId" TEXT;

CREATE UNIQUE INDEX "ClinicBillingProfile_stripeSubscriptionScheduleId_key" ON "ClinicBillingProfile"("stripeSubscriptionScheduleId");

ALTER TABLE "ClinicEntitlement" ADD COLUMN "scheduledCommercialPlan" "CommercialPlan",
ADD COLUMN "scheduledPlanEffectiveAt" TIMESTAMP(3);
