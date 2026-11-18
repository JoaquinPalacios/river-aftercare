-- Operator-authorised introductory discounts for new Essential and Practice clinics.
-- Additive. No Stripe coupon, Price, Checkout Session, or subscription is created.
-- Do not apply this migration to production from this change.

-- CreateEnum
CREATE TYPE "PromotionalOfferTerm" AS ENUM ('SIX_MONTHS', 'TWELVE_MONTHS');

-- CreateEnum
CREATE TYPE "PromotionalOfferStatus" AS ENUM ('AUTHORISED', 'CHECKOUT_OPEN', 'REDEEMED', 'WITHDRAWN', 'EXPIRED');

-- CreateTable
CREATE TABLE "ClinicPromotionalOffer" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "preparedByUserId" TEXT NOT NULL,
    "term" "PromotionalOfferTerm" NOT NULL,
    "status" "PromotionalOfferStatus" NOT NULL,
    "authorisationExpiresAt" TIMESTAMP(3),
    "stripeCouponId" TEXT,
    "stripeSubscriptionId" TEXT,
    "discountDeferred" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicPromotionalOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicPromotionalOffer_clinicId_status_idx" ON "ClinicPromotionalOffer"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ClinicPromotionalOffer_stripeSubscriptionId_idx" ON "ClinicPromotionalOffer"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "ClinicPromotionalOffer_preparedByUserId_idx" ON "ClinicPromotionalOffer"("preparedByUserId");

-- One open introductory offer per clinic. Redeemed, withdrawn, and expired rows stay.
CREATE UNIQUE INDEX "ClinicPromotionalOffer_one_open_per_clinic_key"
ON "ClinicPromotionalOffer"("clinicId")
WHERE "status" IN ('AUTHORISED', 'CHECKOUT_OPEN');

-- AddForeignKey
ALTER TABLE "ClinicPromotionalOffer" ADD CONSTRAINT "ClinicPromotionalOffer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPromotionalOffer" ADD CONSTRAINT "ClinicPromotionalOffer_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
