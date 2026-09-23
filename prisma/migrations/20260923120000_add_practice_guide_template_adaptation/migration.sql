-- Practice may adapt a River template into a clinic-owned custom guide.
-- Additive only. Existing rows stay unclassified: adaptedAt and
-- sourceGuideTemplateId are null, and a template pin (guideTemplateId)
-- continues to mean "as supplied" for allowance counting.
-- No backfill. Do not infer adaptation from titles, slugs, or section text.

ALTER TABLE "PracticeGuide" ADD COLUMN "adaptedAt" TIMESTAMP(3),
ADD COLUMN "sourceGuideTemplateId" TEXT;

CREATE INDEX "PracticeGuide_sourceGuideTemplateId_idx" ON "PracticeGuide"("sourceGuideTemplateId");

ALTER TABLE "PracticeGuide" ADD CONSTRAINT "PracticeGuide_sourceGuideTemplateId_fkey" FOREIGN KEY ("sourceGuideTemplateId") REFERENCES "GuideTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
