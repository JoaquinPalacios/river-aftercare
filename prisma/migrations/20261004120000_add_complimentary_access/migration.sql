-- Complimentary Essential and Practice access.
-- Additive. Existing ClinicEntitlement rows become commercialArrangement PAID.
-- No Stripe subscription is created. Do not apply this migration to production
-- from this change.

-- CreateEnum
CREATE TYPE "CommercialArrangement" AS ENUM ('PAID', 'COMPLIMENTARY');

-- CreateEnum
CREATE TYPE "ComplimentaryAccessEventKind" AS ENUM ('GRANT', 'EXTENSION');

-- AlterEnum
ALTER TYPE "BillingStatus" ADD VALUE 'NOT_BILLED';

-- AlterTable
ALTER TABLE "ClinicEntitlement" ADD COLUMN "commercialArrangement" "CommercialArrangement" NOT NULL DEFAULT 'PAID';
ALTER TABLE "ClinicEntitlement" ADD COLUMN "complimentaryExpiresAt" TIMESTAMP(3);
ALTER TABLE "ClinicEntitlement" ADD COLUMN "commercialReviewAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClinicComplimentaryAccessEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" "ComplimentaryAccessEventKind" NOT NULL,
    "commercialPlan" "CommercialPlan" NOT NULL,
    "previousExpiresAt" TIMESTAMP(3),
    "previousIndefinite" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "indefinite" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(1000) NOT NULL,
    "commercialReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicComplimentaryAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicComplimentaryAccessEvent_clinicId_createdAt_idx" ON "ClinicComplimentaryAccessEvent"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicComplimentaryAccessEvent_actorUserId_idx" ON "ClinicComplimentaryAccessEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "ClinicComplimentaryAccessEvent" ADD CONSTRAINT "ClinicComplimentaryAccessEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicComplimentaryAccessEvent" ADD CONSTRAINT "ClinicComplimentaryAccessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
