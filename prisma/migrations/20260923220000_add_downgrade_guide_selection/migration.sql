-- Practice → Essential guide selection and 60-day downgrade retention.
-- Additive only. Does not change 20260923200000_add_scheduled_plan_downgrade.
-- Retention timestamps stay null until the Essential price actually applies.
-- Null downgradeRetainedAt means the guide is still an active clinic guide.

CREATE TYPE "DowngradePreparationStatus" AS ENUM ('AWAITING_SELECTION', 'SELECTION_CONFIRMED');

ALTER TABLE "PracticeGuide" ADD COLUMN "downgradeRetainedAt" TIMESTAMP(3),
ADD COLUMN "downgradeRetentionUntil" TIMESTAMP(3);

CREATE INDEX "PracticeGuide_clinicId_downgradeRetainedAt_idx" ON "PracticeGuide"("clinicId", "downgradeRetainedAt");

CREATE TABLE "ClinicDowngradePreparation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "targetPlan" "CommercialPlan" NOT NULL,
    "status" "DowngradePreparationStatus" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicDowngradePreparation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DowngradeGuideSelection" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "practiceGuideId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowngradeGuideSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicDowngradePreparation_clinicId_key" ON "ClinicDowngradePreparation"("clinicId");

CREATE INDEX "ClinicDowngradePreparation_confirmedByUserId_idx" ON "ClinicDowngradePreparation"("confirmedByUserId");

CREATE UNIQUE INDEX "DowngradeGuideSelection_preparationId_practiceGuideId_key" ON "DowngradeGuideSelection"("preparationId", "practiceGuideId");

CREATE INDEX "DowngradeGuideSelection_practiceGuideId_idx" ON "DowngradeGuideSelection"("practiceGuideId");

ALTER TABLE "ClinicDowngradePreparation" ADD CONSTRAINT "ClinicDowngradePreparation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicDowngradePreparation" ADD CONSTRAINT "ClinicDowngradePreparation_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DowngradeGuideSelection" ADD CONSTRAINT "DowngradeGuideSelection_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicDowngradePreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DowngradeGuideSelection" ADD CONSTRAINT "DowngradeGuideSelection_practiceGuideId_fkey" FOREIGN KEY ("practiceGuideId") REFERENCES "PracticeGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
