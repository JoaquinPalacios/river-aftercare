-- Negotiated Essential and Practice prices for complimentary clinics.
-- Additive. No Stripe Price, Checkout Session, or subscription is created.
-- Do not apply this migration to production from this change.

-- CreateEnum
CREATE TYPE "NegotiatedOfferStatus" AS ENUM ('PREPARED', 'CHECKOUT_OPEN', 'CONVERTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "NegotiatedStartMode" AS ENUM ('CUSTOMER_INITIATED', 'AGREED_DATE');

-- CreateEnum
CREATE TYPE "NegotiatedTaxTreatment" AS ENUM ('NO_GST');

-- CreateTable
CREATE TABLE "ClinicNegotiatedOffer" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "preparedByUserId" TEXT NOT NULL,
    "commercialPlan" "CommercialPlan" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'aud',
    "taxTreatment" "NegotiatedTaxTreatment" NOT NULL DEFAULT 'NO_GST',
    "startMode" "NegotiatedStartMode" NOT NULL,
    "billingStartsAt" TIMESTAMP(3),
    "commercialTerms" VARCHAR(2000) NOT NULL,
    "status" "NegotiatedOfferStatus" NOT NULL,
    "stripePriceId" TEXT,
    "stripeProductId" TEXT,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicNegotiatedOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicNegotiatedOffer_clinicId_status_idx" ON "ClinicNegotiatedOffer"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ClinicNegotiatedOffer_stripePriceId_idx" ON "ClinicNegotiatedOffer"("stripePriceId");

-- CreateIndex
CREATE INDEX "ClinicNegotiatedOffer_preparedByUserId_idx" ON "ClinicNegotiatedOffer"("preparedByUserId");

-- One open offer per clinic. Converted and withdrawn rows stay as history.
CREATE UNIQUE INDEX "ClinicNegotiatedOffer_one_open_per_clinic_key"
ON "ClinicNegotiatedOffer"("clinicId")
WHERE "status" IN ('PREPARED', 'CHECKOUT_OPEN');

-- AddForeignKey
ALTER TABLE "ClinicNegotiatedOffer" ADD CONSTRAINT "ClinicNegotiatedOffer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicNegotiatedOffer" ADD CONSTRAINT "ClinicNegotiatedOffer_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicNegotiatedOffer" ADD CONSTRAINT "ClinicNegotiatedOffer_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
