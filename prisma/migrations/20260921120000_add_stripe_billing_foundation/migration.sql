-- Stripe Billing Phase 1 foundation.
-- Additive only. Existing Clinic, ClinicProfile, User, and guide rows are
-- unchanged. No clinic is backfilled as paid. Stripe identifiers remain
-- nullable until a verified webhook links them.

-- CreateEnum
CREATE TYPE "CommercialPlan" AS ENUM ('ESSENTIAL', 'PRACTICE', 'GROUP');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('PAYMENT_PENDING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCEL_AT_PERIOD_END', 'ENDED');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('PENDING', 'ACTIVE', 'RESTRICTED', 'ENDED');

-- CreateEnum
CREATE TYPE "StripeEventProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "ClinicBillingProfile" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "legalEntityName" TEXT,
    "tradingName" TEXT,
    "billingContactName" TEXT,
    "billingEmail" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'AU',
    "abn" TEXT,
    "acn" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicEntitlement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "commercialPlan" "CommercialPlan",
    "billingInterval" "BillingInterval",
    "billingStatus" "BillingStatus" NOT NULL,
    "entitlementStatus" "EntitlementStatus" NOT NULL,
    "stripePriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "paidThrough" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionEndedAt" TIMESTAMP(3),
    "publicGuideRetentionUntil" TIMESTAMP(3),
    "lastStripeEventId" TEXT,
    "lastProjectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEventReceipt" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "stripeCreatedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingStatus" "StripeEventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "failureText" TEXT,
    "clinicId" TEXT,

    CONSTRAINT "StripeEventReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicBillingProfile_clinicId_key" ON "ClinicBillingProfile"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicBillingProfile_stripeCustomerId_key" ON "ClinicBillingProfile"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicBillingProfile_stripeSubscriptionId_key" ON "ClinicBillingProfile"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicEntitlement_clinicId_key" ON "ClinicEntitlement"("clinicId");

-- CreateIndex
CREATE INDEX "ClinicEntitlement_billingStatus_idx" ON "ClinicEntitlement"("billingStatus");

-- CreateIndex
CREATE INDEX "ClinicEntitlement_entitlementStatus_idx" ON "ClinicEntitlement"("entitlementStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StripeEventReceipt_stripeEventId_key" ON "StripeEventReceipt"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeEventReceipt_eventType_receivedAt_idx" ON "StripeEventReceipt"("eventType", "receivedAt");

-- CreateIndex
CREATE INDEX "StripeEventReceipt_processingStatus_idx" ON "StripeEventReceipt"("processingStatus");

-- CreateIndex
CREATE INDEX "StripeEventReceipt_clinicId_idx" ON "StripeEventReceipt"("clinicId");

-- AddForeignKey
ALTER TABLE "ClinicBillingProfile" ADD CONSTRAINT "ClinicBillingProfile_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
