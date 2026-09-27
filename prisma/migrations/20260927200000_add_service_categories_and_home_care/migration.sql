-- river-aftercare:destructive-reviewed
-- The Specialty column and enum are dropped only after every GuideTemplate
-- row is copied into serviceCategory. Practice guide classification is a new
-- nullable column. No guide, revision, or extraction sample row is deleted.
-- Service categories belong to a ClinicSite. Canonical templates keep one
-- primary category. Practice guides may stay unclassified when no canonical
-- source can classify them. Recurring home-care instructions are structured
-- revision content, not patient tracking.

CREATE TYPE "ServiceCategory" AS ENUM ('DENTAL', 'PHYSIOTHERAPY', 'CHIROPRACTIC', 'COSMETIC_AESTHETIC');

ALTER TABLE "GuideTemplate" ADD COLUMN "serviceCategory" "ServiceCategory";

UPDATE "GuideTemplate"
SET "serviceCategory" = "specialty"::text::"ServiceCategory";

ALTER TABLE "GuideTemplate" ALTER COLUMN "serviceCategory" SET NOT NULL;

DROP INDEX "GuideTemplate_specialty_isActive_idx";

ALTER TABLE "GuideTemplate" DROP COLUMN "specialty";

CREATE INDEX "GuideTemplate_serviceCategory_isActive_idx" ON "GuideTemplate"("serviceCategory", "isActive");

DROP TYPE "Specialty";

ALTER TABLE "PracticeGuide" ADD COLUMN "serviceCategory" "ServiceCategory";

-- Deterministic classification only. Do not infer from titles or body text.
UPDATE "PracticeGuide" AS guide
SET "serviceCategory" = template."serviceCategory"
FROM "GuideTemplate" AS template
WHERE guide."guideTemplateId" = template."id"
  AND guide."serviceCategory" IS NULL;

UPDATE "PracticeGuide" AS guide
SET "serviceCategory" = template."serviceCategory"
FROM "GuideTemplate" AS template
WHERE guide."sourceGuideTemplateId" = template."id"
  AND guide."serviceCategory" IS NULL;

DO $$
BEGIN
  LOOP
    UPDATE "PracticeGuide" AS child
    SET "serviceCategory" = parent."serviceCategory"
    FROM "PracticeGuide" AS parent
    WHERE child."copiedFromPracticeGuideId" = parent."id"
      AND child."serviceCategory" IS NULL
      AND parent."serviceCategory" IS NOT NULL;
    EXIT WHEN NOT FOUND;
  END LOOP;
END $$;

CREATE INDEX "PracticeGuide_clinicId_serviceCategory_idx" ON "PracticeGuide"("clinicId", "serviceCategory");

CREATE TABLE "ClinicSiteServiceCategory" (
    "id" TEXT NOT NULL,
    "clinicSiteId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "serviceCategory" "ServiceCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSiteServiceCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicSiteServiceCategory_clinicSiteId_serviceCategory_key" ON "ClinicSiteServiceCategory"("clinicSiteId", "serviceCategory");

CREATE INDEX "ClinicSiteServiceCategory_clinicId_idx" ON "ClinicSiteServiceCategory"("clinicId");

CREATE INDEX "ClinicSiteServiceCategory_clinicSiteId_idx" ON "ClinicSiteServiceCategory"("clinicSiteId");

ALTER TABLE "ClinicSiteServiceCategory" ADD CONSTRAINT "ClinicSiteServiceCategory_clinicSiteId_clinicId_fkey" FOREIGN KEY ("clinicSiteId", "clinicId") REFERENCES "ClinicSite"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Known demo site only. Other existing sites stay unclassified.
INSERT INTO "ClinicSiteServiceCategory" ("id", "clinicSiteId", "clinicId", "serviceCategory", "createdAt", "updatedAt")
SELECT
    'cssc_' || site."id" || '_dental',
    site."id",
    site."clinicId",
    'DENTAL'::"ServiceCategory",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ClinicSite" AS site
WHERE site."slug" = 'demodental'
ON CONFLICT ("clinicSiteId", "serviceCategory") DO NOTHING;

ALTER TYPE "GuideSectionKind" ADD VALUE 'HOME_CARE_PLAN';

CREATE TYPE "HomeCareFrequencyPeriod" AS ENUM ('DAY', 'WEEK');

CREATE TYPE "HomeCareDurationUnit" AS ENUM ('DAYS', 'WEEKS');

CREATE TABLE "GuideTemplateHomeCareInstruction" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "frequencyCount" INTEGER,
    "frequencyPeriod" "HomeCareFrequencyPeriod",
    "timingLabel" TEXT,
    "durationValue" INTEGER,
    "durationUnit" "HomeCareDurationUnit",
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideTemplateHomeCareInstruction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeGuideHomeCareInstruction" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "frequencyCount" INTEGER,
    "frequencyPeriod" "HomeCareFrequencyPeriod",
    "timingLabel" TEXT,
    "durationValue" INTEGER,
    "durationUnit" "HomeCareDurationUnit",
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeGuideHomeCareInstruction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuideTemplateHomeCareInstruction_sectionId_key_key" ON "GuideTemplateHomeCareInstruction"("sectionId", "key");

CREATE UNIQUE INDEX "GuideTemplateHomeCareInstruction_sectionId_sortOrder_key" ON "GuideTemplateHomeCareInstruction"("sectionId", "sortOrder");

CREATE INDEX "GuideTemplateHomeCareInstruction_sectionId_idx" ON "GuideTemplateHomeCareInstruction"("sectionId");

CREATE UNIQUE INDEX "PracticeGuideHomeCareInstruction_sectionId_key_key" ON "PracticeGuideHomeCareInstruction"("sectionId", "key");

CREATE UNIQUE INDEX "PracticeGuideHomeCareInstruction_sectionId_sortOrder_key" ON "PracticeGuideHomeCareInstruction"("sectionId", "sortOrder");

CREATE INDEX "PracticeGuideHomeCareInstruction_sectionId_idx" ON "PracticeGuideHomeCareInstruction"("sectionId");

ALTER TABLE "GuideTemplateHomeCareInstruction" ADD CONSTRAINT "GuideTemplateHomeCareInstruction_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "GuideTemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeGuideHomeCareInstruction" ADD CONSTRAINT "PracticeGuideHomeCareInstruction_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PracticeGuideRevisionSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuideTemplateHomeCareInstruction" ADD CONSTRAINT "GuideTemplateHomeCareInstruction_frequency_check" CHECK (
    ("frequencyCount" IS NULL AND "frequencyPeriod" IS NULL)
    OR ("frequencyCount" > 0 AND "frequencyPeriod" IS NOT NULL)
);

ALTER TABLE "GuideTemplateHomeCareInstruction" ADD CONSTRAINT "GuideTemplateHomeCareInstruction_duration_check" CHECK (
    ("durationValue" IS NULL AND "durationUnit" IS NULL)
    OR ("durationValue" > 0 AND "durationUnit" IS NOT NULL)
);

ALTER TABLE "GuideTemplateHomeCareInstruction" ADD CONSTRAINT "GuideTemplateHomeCareInstruction_title_check" CHECK (char_length(btrim("title")) > 0);

ALTER TABLE "PracticeGuideHomeCareInstruction" ADD CONSTRAINT "PracticeGuideHomeCareInstruction_frequency_check" CHECK (
    ("frequencyCount" IS NULL AND "frequencyPeriod" IS NULL)
    OR ("frequencyCount" > 0 AND "frequencyPeriod" IS NOT NULL)
);

ALTER TABLE "PracticeGuideHomeCareInstruction" ADD CONSTRAINT "PracticeGuideHomeCareInstruction_duration_check" CHECK (
    ("durationValue" IS NULL AND "durationUnit" IS NULL)
    OR ("durationValue" > 0 AND "durationUnit" IS NOT NULL)
);

ALTER TABLE "PracticeGuideHomeCareInstruction" ADD CONSTRAINT "PracticeGuideHomeCareInstruction_title_check" CHECK (char_length(btrim("title")) > 0);
