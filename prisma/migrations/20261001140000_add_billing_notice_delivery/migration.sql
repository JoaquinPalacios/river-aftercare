-- Billing notice delivery receipts and dormant price-change schedules.
-- Additive only. Existing billing rows are unchanged. No backfill.
-- The application does not insert BillingPriceChange and does not change Stripe.
-- Do not apply this migration to production from this change.

-- CreateEnum
CREATE TYPE "BillingPriceChangeStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BillingNoticeKind" AS ENUM ('ANNUAL_RENEWAL_REMINDER', 'PRICE_INCREASE_INITIAL', 'PRICE_INCREASE_REMINDER');

-- CreateEnum
CREATE TYPE "BillingNoticeDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "BillingPriceChange" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeSubscriptionItemId" TEXT NOT NULL,
    "affectedLabel" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "currentAmountCents" INTEGER NOT NULL,
    "newAmountCents" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" "BillingPriceChangeStatus" NOT NULL,
    "individuallyAgreed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingNoticeDelivery" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "kind" "BillingNoticeKind" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" "BillingNoticeDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingNoticeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPriceChange_clinicId_status_idx" ON "BillingPriceChange"("clinicId", "status");

-- CreateIndex
CREATE INDEX "BillingPriceChange_status_effectiveAt_idx" ON "BillingPriceChange"("status", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingNoticeDelivery_event_key" ON "BillingNoticeDelivery"("clinicId", "stripeSubscriptionId", "kind", "eventKey");

-- CreateIndex
CREATE INDEX "BillingNoticeDelivery_status_lastAttemptAt_idx" ON "BillingNoticeDelivery"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "BillingNoticeDelivery_clinicId_idx" ON "BillingNoticeDelivery"("clinicId");

-- AddForeignKey
ALTER TABLE "BillingPriceChange" ADD CONSTRAINT "BillingPriceChange_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingNoticeDelivery" ADD CONSTRAINT "BillingNoticeDelivery_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
