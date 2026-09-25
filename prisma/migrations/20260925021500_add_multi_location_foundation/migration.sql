-- Additive multi-location foundation.
-- Creates ClinicLocation, PracticeGuidePlacement, and DowngradeLocationSelection.
-- Adds PracticeGuide.copiedFromPracticeGuideId and ClinicEntitlement.extraLocationAllowance.
-- Backfills one account-root ClinicLocation per existing Clinic and one
-- PracticeGuidePlacement per existing PracticeGuide.
-- Does not drop or rewrite Clinic, ClinicProfile, PracticeGuide, billing, or URL data.
-- Patient reads do not use these tables yet.
--
-- Root locations store slug NULL: they have no location path segment.
-- servesAccountRoot = true  => slug IS NULL
-- servesAccountRoot = false => slug IS NOT NULL
-- At most one primary and at most one account-root location per clinic.
-- isPrimary and servesAccountRoot are independent.
-- Exactly one of each is not required here, so a clinic can be inserted
-- before its location. Non-null slugs are unique within the clinic.
-- Prisma cannot express the partial unique indexes or the root/slug check.

-- CreateTable
CREATE TABLE "ClinicLocation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "contactUrl" TEXT,
    "contactEmail" TEXT,
    "bookingUrl" TEXT,
    "emergencyInstructions" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "servesAccountRoot" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicLocation_clinicId_idx" ON "ClinicLocation"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicLocation_clinicId_slug_key" ON "ClinicLocation"("clinicId", "slug");

-- At most one primary location per clinic. Zero is allowed.
-- Active and deactivated rows both count. isPrimary is not tied to servesAccountRoot.
CREATE UNIQUE INDEX "ClinicLocation_one_primary_per_clinic_key"
ON "ClinicLocation" ("clinicId")
WHERE "isPrimary" = true;

-- At most one location may serve the existing unprefixed patient URLs.
CREATE UNIQUE INDEX "ClinicLocation_one_account_root_per_clinic_key"
ON "ClinicLocation" ("clinicId")
WHERE "servesAccountRoot" = true;

-- Account-root locations have no path slug. Every other location must have one.
ALTER TABLE "ClinicLocation"
ADD CONSTRAINT "ClinicLocation_root_slug_check"
CHECK (
    ("servesAccountRoot" = true AND "slug" IS NULL)
    OR
    ("servesAccountRoot" = false AND "slug" IS NOT NULL)
);

-- Future non-root path segments use the same public slug shape as clinic hostnames.
-- NULL (the account-root location) is allowed and does not collide with guide slugs.
ALTER TABLE "ClinicLocation"
ADD CONSTRAINT "ClinicLocation_slug_format_check"
CHECK (
    "slug" IS NULL
    OR (
        char_length("slug") BETWEEN 3 AND 32
        AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
);

-- AddForeignKey
ALTER TABLE "ClinicLocation" ADD CONSTRAINT "ClinicLocation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PracticeGuidePlacement" (
    "id" TEXT NOT NULL,
    "practiceGuideId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "publishedPracticeGuideRevisionId" TEXT,
    "publicSlug" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeGuidePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeGuidePlacement_practiceGuideId_idx" ON "PracticeGuidePlacement"("practiceGuideId");

-- CreateIndex
CREATE INDEX "PracticeGuidePlacement_publishedPracticeGuideRevisionId_idx" ON "PracticeGuidePlacement"("publishedPracticeGuideRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeGuidePlacement_locationId_practiceGuideId_key" ON "PracticeGuidePlacement"("locationId", "practiceGuideId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeGuidePlacement_locationId_publicSlug_key" ON "PracticeGuidePlacement"("locationId", "publicSlug");

-- AddForeignKey
ALTER TABLE "PracticeGuidePlacement" ADD CONSTRAINT "PracticeGuidePlacement_practiceGuideId_fkey" FOREIGN KEY ("practiceGuideId") REFERENCES "PracticeGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGuidePlacement" ADD CONSTRAINT "PracticeGuidePlacement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull avoids a cascade cycle when a guide delete removes both revisions and placements.
ALTER TABLE "PracticeGuidePlacement" ADD CONSTRAINT "PracticeGuidePlacement_publishedPracticeGuideRevisionId_fkey" FOREIGN KEY ("publishedPracticeGuideRevisionId") REFERENCES "PracticeGuideRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DowngradeLocationSelection" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowngradeLocationSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DowngradeLocationSelection_locationId_idx" ON "DowngradeLocationSelection"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "DowngradeLocationSelection_preparationId_locationId_key" ON "DowngradeLocationSelection"("preparationId", "locationId");

-- AddForeignKey
ALTER TABLE "DowngradeLocationSelection" ADD CONSTRAINT "DowngradeLocationSelection_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicDowngradePreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowngradeLocationSelection" ADD CONSTRAINT "DowngradeLocationSelection_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PracticeGuide" ADD COLUMN "copiedFromPracticeGuideId" TEXT;

-- CreateIndex
CREATE INDEX "PracticeGuide_copiedFromPracticeGuideId_idx" ON "PracticeGuide"("copiedFromPracticeGuideId");

-- AddForeignKey
ALTER TABLE "PracticeGuide" ADD CONSTRAINT "PracticeGuide_copiedFromPracticeGuideId_fkey" FOREIGN KEY ("copiedFromPracticeGuideId") REFERENCES "PracticeGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ClinicEntitlement" ADD COLUMN "extraLocationAllowance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_extraLocationAllowance_check" CHECK ("extraLocationAllowance" >= 0);

-- river-aftercare:multi-location-backfill-begin
INSERT INTO "ClinicLocation" (
    "id",
    "clinicId",
    "name",
    "slug",
    "displayName",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "postalCode",
    "country",
    "contactUrl",
    "contactEmail",
    "bookingUrl",
    "emergencyInstructions",
    "isPrimary",
    "servesAccountRoot",
    "active",
    "deactivatedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'mloc_' || clinic."id",
    clinic."id",
    CASE
        WHEN profile."clinicId" IS NOT NULL THEN profile."displayName"
        ELSE clinic."name"
    END,
    NULL,
    CASE
        WHEN profile."clinicId" IS NOT NULL THEN profile."displayName"
        ELSE clinic."name"
    END,
    profile."phone",
    profile."addressLine1",
    profile."addressLine2",
    profile."city",
    profile."region",
    profile."postalCode",
    profile."country",
    profile."contactUrl",
    profile."contactEmail",
    profile."bookingUrl",
    profile."emergencyInstructions",
    true,
    true,
    true,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Clinic" AS clinic
LEFT JOIN "ClinicProfile" AS profile
    ON profile."clinicId" = clinic."id"
WHERE NOT EXISTS (
    SELECT 1
    FROM "ClinicLocation" AS existing
    WHERE existing."clinicId" = clinic."id"
      AND existing."servesAccountRoot" = true
);

INSERT INTO "PracticeGuidePlacement" (
    "id",
    "practiceGuideId",
    "locationId",
    "publishedPracticeGuideRevisionId",
    "publicSlug",
    "isEnabled",
    "createdAt",
    "updatedAt"
)
SELECT
    'mpl_' || guide."id",
    guide."id",
    location."id",
    CASE
        WHEN guide."isEnabled" = true
         AND guide."status" = 'PUBLISHED'
         AND published_revision."id" IS NOT NULL
        THEN published_revision."id"
        ELSE NULL
    END,
    guide."publicSlug",
    CASE
        WHEN guide."isEnabled" = true
         AND guide."status" = 'PUBLISHED'
         AND (
            published_revision."id" IS NOT NULL
            OR (
                NOT EXISTS (
                    SELECT 1
                    FROM "PracticeGuideRevision" AS any_revision
                    WHERE any_revision."practiceGuideId" = guide."id"
                )
                AND template_revision."status" = 'PUBLISHED'
            )
         )
        THEN true
        ELSE false
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "PracticeGuide" AS guide
INNER JOIN "ClinicLocation" AS location
    ON location."clinicId" = guide."clinicId"
   AND location."servesAccountRoot" = true
LEFT JOIN LATERAL (
    SELECT revision."id"
    FROM "PracticeGuideRevision" AS revision
    WHERE revision."practiceGuideId" = guide."id"
      AND revision."status" = 'PUBLISHED'
      AND revision."version" > 0
    ORDER BY revision."version" DESC
    LIMIT 1
) AS published_revision ON true
LEFT JOIN "GuideTemplateRevision" AS template_revision
    ON template_revision."id" = guide."pinnedRevisionId"
WHERE NOT EXISTS (
    SELECT 1
    FROM "PracticeGuidePlacement" AS existing
    WHERE existing."practiceGuideId" = guide."id"
      AND existing."locationId" = location."id"
);
-- river-aftercare:multi-location-backfill-end
