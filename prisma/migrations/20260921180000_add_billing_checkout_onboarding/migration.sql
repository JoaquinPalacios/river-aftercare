-- Stripe Billing Phase 2 customer payment flow.
-- Additive only. Existing clinics are not backfilled and are not placed into
-- billing onboarding. Absence of ClinicEntitlement remains legacy access.
-- OFFER_PREPARED distinguishes an operator-prepared offer from PAYMENT_PENDING
-- after Checkout has been submitted. LegalAcceptance rows are append-only.

-- AlterEnum
ALTER TYPE "BillingStatus" ADD VALUE 'OFFER_PREPARED' BEFORE 'PAYMENT_PENDING';

-- CreateEnum
CREATE TYPE "LegalAcceptanceSource" AS ENUM ('BILLING_CHECKOUT');

-- AlterTable
ALTER TABLE "ClinicBillingProfile" ADD COLUMN "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClinicBillingProfile_stripeCheckoutSessionId_key" ON "ClinicBillingProfile"("stripeCheckoutSessionId");

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersionAcknowledged" TEXT NOT NULL,
    "source" "LegalAcceptanceSource" NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_clinicId_acceptedAt_idx" ON "LegalAcceptance"("clinicId", "acceptedAt");

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_idx" ON "LegalAcceptance"("userId");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
