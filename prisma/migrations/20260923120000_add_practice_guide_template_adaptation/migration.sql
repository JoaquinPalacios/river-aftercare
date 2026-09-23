-- Clinic-owned template adaptations and persistent operator allowance extras.
-- Additive only. Existing PracticeGuide rows stay unclassified: adaptedAt and
-- sourceGuideTemplateId are null, and a template pin (guideTemplateId)
-- continues to mean "as supplied" for allowance counting.
-- A read-only production audit found one pinned guide, zero overrides, and
-- zero additions, so no adaptation backfill is required.
-- Extra allowances default to 0 and do not change commercialPlan or Stripe.

ALTER TABLE "PracticeGuide" ADD COLUMN "adaptedAt" TIMESTAMP(3),
ADD COLUMN "sourceGuideTemplateId" TEXT;

CREATE INDEX "PracticeGuide_sourceGuideTemplateId_idx" ON "PracticeGuide"("sourceGuideTemplateId");

ALTER TABLE "PracticeGuide" ADD CONSTRAINT "PracticeGuide_sourceGuideTemplateId_fkey" FOREIGN KEY ("sourceGuideTemplateId") REFERENCES "GuideTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicEntitlement" ADD COLUMN "extraTeamMemberAllowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extraCustomGuideAllowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extraTemplateAdaptationAllowance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_extraTeamMemberAllowance_check" CHECK ("extraTeamMemberAllowance" >= 0);
ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_extraCustomGuideAllowance_check" CHECK ("extraCustomGuideAllowance" >= 0);
ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_extraTemplateAdaptationAllowance_check" CHECK ("extraTemplateAdaptationAllowance" >= 0);
