-- Additive account-split preparation. New tables, enums, indexes, and checks only.
-- Does not change ClinicSite, ClinicLocation, PracticeGuidePlacement, or Stripe tables.
-- No backfill.

-- CreateEnum
CREATE TYPE "ClinicAccountSplitStatus" AS ENUM ('DRAFT', 'DESTINATION_READY', 'AWAITING_PAYMENT', 'BILLING_READY', 'READY_TO_EXECUTE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClinicAccountSplitSiteDecisionKind" AS ENUM ('SPLIT', 'DEACTIVATE');

-- CreateTable
CREATE TABLE "ClinicAccountSplitPreparation" (
    "id" TEXT NOT NULL,
    "sourceClinicId" TEXT NOT NULL,
    "destinationClinicId" TEXT,
    "keptClinicSiteId" TEXT NOT NULL,
    "status" "ClinicAccountSplitStatus" NOT NULL DEFAULT 'DRAFT',
    "destinationPlan" "CommercialPlan" NOT NULL,
    "destinationBillingInterval" "BillingInterval" NOT NULL,
    "targetSourcePlan" "CommercialPlan" NOT NULL DEFAULT 'PRACTICE',
    "preparedByUserId" TEXT NOT NULL,
    "executingOperatorUserId" TEXT,
    "executedAt" TIMESTAMP(3),
    "expectedConfirmation" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicAccountSplitPreparation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAccountSplitSiteDecision" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "clinicSiteId" TEXT NOT NULL,
    "decision" "ClinicAccountSplitSiteDecisionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicAccountSplitSiteDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAccountSplitStaffSelection" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keepOnSource" BOOLEAN NOT NULL,
    "grantOnDestination" BOOLEAN NOT NULL,
    "destinationRole" "ClinicMembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicAccountSplitStaffSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAccountSplitGuideMap" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "sourcePracticeGuideId" TEXT NOT NULL,
    "destinationPracticeGuideId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAccountSplitGuideMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAccountSplitRevisionMap" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "guideMapId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "destinationRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAccountSplitRevisionMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_sourceClinicId_idx" ON "ClinicAccountSplitPreparation"("sourceClinicId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_destinationClinicId_idx" ON "ClinicAccountSplitPreparation"("destinationClinicId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_keptClinicSiteId_idx" ON "ClinicAccountSplitPreparation"("keptClinicSiteId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_preparedByUserId_idx" ON "ClinicAccountSplitPreparation"("preparedByUserId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_executingOperatorUserId_idx" ON "ClinicAccountSplitPreparation"("executingOperatorUserId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_status_idx" ON "ClinicAccountSplitPreparation"("status");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitSiteDecision_clinicSiteId_idx" ON "ClinicAccountSplitSiteDecision"("clinicSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAccountSplitSiteDecision_preparationId_clinicSiteId_key" ON "ClinicAccountSplitSiteDecision"("preparationId", "clinicSiteId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitStaffSelection_userId_idx" ON "ClinicAccountSplitStaffSelection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAccountSplitStaffSelection_preparationId_userId_key" ON "ClinicAccountSplitStaffSelection"("preparationId", "userId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitGuideMap_sourcePracticeGuideId_idx" ON "ClinicAccountSplitGuideMap"("sourcePracticeGuideId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitGuideMap_destinationPracticeGuideId_idx" ON "ClinicAccountSplitGuideMap"("destinationPracticeGuideId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAccountSplitGuideMap_preparationId_sourcePracticeGuid_key" ON "ClinicAccountSplitGuideMap"("preparationId", "sourcePracticeGuideId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitRevisionMap_guideMapId_idx" ON "ClinicAccountSplitRevisionMap"("guideMapId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitRevisionMap_sourceRevisionId_idx" ON "ClinicAccountSplitRevisionMap"("sourceRevisionId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitRevisionMap_destinationRevisionId_idx" ON "ClinicAccountSplitRevisionMap"("destinationRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAccountSplitRevisionMap_preparationId_sourceRevisionI_key" ON "ClinicAccountSplitRevisionMap"("preparationId", "sourceRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAccountSplitRevisionMap_guideMapId_sourceRevisionId_key" ON "ClinicAccountSplitRevisionMap"("guideMapId", "sourceRevisionId");

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitPreparation" ADD CONSTRAINT "ClinicAccountSplitPreparation_sourceClinicId_fkey" FOREIGN KEY ("sourceClinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitPreparation" ADD CONSTRAINT "ClinicAccountSplitPreparation_destinationClinicId_fkey" FOREIGN KEY ("destinationClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitPreparation" ADD CONSTRAINT "ClinicAccountSplitPreparation_keptClinicSiteId_fkey" FOREIGN KEY ("keptClinicSiteId") REFERENCES "ClinicSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitPreparation" ADD CONSTRAINT "ClinicAccountSplitPreparation_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitPreparation" ADD CONSTRAINT "ClinicAccountSplitPreparation_executingOperatorUserId_fkey" FOREIGN KEY ("executingOperatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitSiteDecision" ADD CONSTRAINT "ClinicAccountSplitSiteDecision_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitSiteDecision" ADD CONSTRAINT "ClinicAccountSplitSiteDecision_clinicSiteId_fkey" FOREIGN KEY ("clinicSiteId") REFERENCES "ClinicSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitStaffSelection" ADD CONSTRAINT "ClinicAccountSplitStaffSelection_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitStaffSelection" ADD CONSTRAINT "ClinicAccountSplitStaffSelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitGuideMap" ADD CONSTRAINT "ClinicAccountSplitGuideMap_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitGuideMap" ADD CONSTRAINT "ClinicAccountSplitGuideMap_sourcePracticeGuideId_fkey" FOREIGN KEY ("sourcePracticeGuideId") REFERENCES "PracticeGuide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitGuideMap" ADD CONSTRAINT "ClinicAccountSplitGuideMap_destinationPracticeGuideId_fkey" FOREIGN KEY ("destinationPracticeGuideId") REFERENCES "PracticeGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitRevisionMap" ADD CONSTRAINT "ClinicAccountSplitRevisionMap_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitRevisionMap" ADD CONSTRAINT "ClinicAccountSplitRevisionMap_guideMapId_fkey" FOREIGN KEY ("guideMapId") REFERENCES "ClinicAccountSplitGuideMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitRevisionMap" ADD CONSTRAINT "ClinicAccountSplitRevisionMap_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "PracticeGuideRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitRevisionMap" ADD CONSTRAINT "ClinicAccountSplitRevisionMap_destinationRevisionId_fkey" FOREIGN KEY ("destinationRevisionId") REFERENCES "PracticeGuideRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Destination commercial target is Essential or Practice. Group is not offered.
-- Source preview target stays Practice. This row does not change source billing.
ALTER TABLE "ClinicAccountSplitPreparation"
ADD CONSTRAINT "ClinicAccountSplitPreparation_destination_plan_check"
CHECK ("destinationPlan" IN ('ESSENTIAL', 'PRACTICE'));

ALTER TABLE "ClinicAccountSplitPreparation"
ADD CONSTRAINT "ClinicAccountSplitPreparation_target_source_plan_check"
CHECK ("targetSourcePlan" = 'PRACTICE');

-- At most one non-terminal preparation per source Account.
-- COMPLETED and CANCELLED do not block a later preparation.
CREATE UNIQUE INDEX "ClinicAccountSplitPreparation_one_open_source_key"
ON "ClinicAccountSplitPreparation" ("sourceClinicId")
WHERE "status" NOT IN ('COMPLETED', 'CANCELLED');

-- A shell Account belongs to one preparation. Nulls stay allowed.
CREATE UNIQUE INDEX "ClinicAccountSplitPreparation_destinationClinicId_key"
ON "ClinicAccountSplitPreparation" ("destinationClinicId")
WHERE "destinationClinicId" IS NOT NULL;

-- One preparation splits exactly one Site.
CREATE UNIQUE INDEX "ClinicAccountSplitSiteDecision_one_split_key"
ON "ClinicAccountSplitSiteDecision" ("preparationId")
WHERE "decision" = 'SPLIT';

