-- Multi-location foundation (Clinic -> ClinicSite -> ClinicLocation).
-- Additive against current main. This file replaces the unmerged draft that
-- attached ClinicLocation directly to Clinic. That draft was never applied
-- outside disposable local databases.
--
-- Creates ClinicSite, ClinicLocation, PracticeGuidePlacement, and
-- DowngradeLocationSelection.
-- Adds PracticeGuide.copiedFromPracticeGuideId.
-- Adds ClinicEntitlement.siteAllowance and locationAllowance (total capacity,
-- default 1). Does not add Stripe prices or enforce the caps.
-- Backfills one primary ClinicSite per existing Clinic (slug copied from
-- Clinic.slug, branding copied from ClinicProfile) and one root
-- ClinicLocation per site. Contact and emergency fields are copied onto that
-- location. One PracticeGuidePlacement is created at that root location.
--
-- Clinic.slug, ClinicProfile, guide publication, and patient URLs are unchanged.
--
-- Root location rule (site-scoped):
-- servesSiteRoot = true  => slug IS NULL
-- servesSiteRoot = false => slug IS NOT NULL
--
-- isPrimary and servesSiteRoot are independent.
-- At most one primary ClinicSite per Clinic.
-- At most one primary ClinicLocation and one site-root location per ClinicSite.
-- No DowngradeSiteSelection table: a later additive child of
-- ClinicDowngradePreparation can record which site remains.

-- AlterTable
ALTER TABLE "ClinicEntitlement" ADD COLUMN "locationAllowance" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "siteAllowance" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_siteAllowance_check" CHECK ("siteAllowance" >= 1);

ALTER TABLE "ClinicEntitlement" ADD CONSTRAINT "ClinicEntitlement_locationAllowance_check" CHECK ("locationAllowance" >= 1);

-- AlterTable
ALTER TABLE "PracticeGuide" ADD COLUMN "copiedFromPracticeGuideId" TEXT;

-- CreateTable
CREATE TABLE "ClinicSite" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "darkLogoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "darkPrimaryColor" TEXT,
    "darkAccentColor" TEXT,
    "useCustomDarkBranding" BOOLEAN NOT NULL DEFAULT false,
    "neutralColor" TEXT,
    "radiusPreset" "ClinicRadiusPreset" NOT NULL DEFAULT 'MEDIUM',
    "typeface" "ClinicTypeface",
    "instructionTerminology" "ClinicInstructionTerminology" NOT NULL DEFAULT 'AFTERCARE',
    "themeMode" "ClinicThemeMode" NOT NULL DEFAULT 'SYSTEM',
    "allowPatientThemeToggle" BOOLEAN NOT NULL DEFAULT false,
    "showCareGuideAttribution" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicLocation" (
    "id" TEXT NOT NULL,
    "clinicSiteId" TEXT NOT NULL,
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
    "servesSiteRoot" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeGuidePlacement" (
    "id" TEXT NOT NULL,
    "practiceGuideId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "publishedPracticeGuideRevisionId" TEXT,
    "publicSlug" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeGuidePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowngradeLocationSelection" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowngradeLocationSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicSite_slug_key" ON "ClinicSite"("slug");

-- CreateIndex
CREATE INDEX "ClinicSite_clinicId_idx" ON "ClinicSite"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicSite_id_clinicId_key" ON "ClinicSite"("id", "clinicId");

-- Active and deactivated rows both count.
CREATE UNIQUE INDEX "ClinicSite_one_primary_per_clinic_key"
ON "ClinicSite" ("clinicId")
WHERE "isPrimary" = true;

-- CreateIndex
CREATE INDEX "ClinicLocation_clinicSiteId_idx" ON "ClinicLocation"("clinicSiteId");

-- CreateIndex
CREATE INDEX "ClinicLocation_clinicId_idx" ON "ClinicLocation"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicLocation_clinicSiteId_slug_key" ON "ClinicLocation"("clinicSiteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicLocation_id_clinicId_key" ON "ClinicLocation"("id", "clinicId");

-- Active and deactivated rows both count. isPrimary is not tied to servesSiteRoot.
CREATE UNIQUE INDEX "ClinicLocation_one_primary_per_site_key"
ON "ClinicLocation" ("clinicSiteId")
WHERE "isPrimary" = true;

CREATE UNIQUE INDEX "ClinicLocation_one_site_root_per_site_key"
ON "ClinicLocation" ("clinicSiteId")
WHERE "servesSiteRoot" = true;

-- CreateIndex
CREATE INDEX "PracticeGuidePlacement_practiceGuideId_idx" ON "PracticeGuidePlacement"("practiceGuideId");

-- CreateIndex
CREATE INDEX "PracticeGuidePlacement_clinicId_idx" ON "PracticeGuidePlacement"("clinicId");

-- CreateIndex
CREATE INDEX "PracticeGuidePlacement_publishedPracticeGuideRevisionId_idx" ON "PracticeGuidePlacement"("publishedPracticeGuideRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeGuidePlacement_locationId_practiceGuideId_key" ON "PracticeGuidePlacement"("locationId", "practiceGuideId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeGuidePlacement_locationId_publicSlug_key" ON "PracticeGuidePlacement"("locationId", "publicSlug");

-- CreateIndex
CREATE INDEX "DowngradeLocationSelection_locationId_idx" ON "DowngradeLocationSelection"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "DowngradeLocationSelection_preparationId_locationId_key" ON "DowngradeLocationSelection"("preparationId", "locationId");

-- CreateIndex
CREATE INDEX "PracticeGuide_copiedFromPracticeGuideId_idx" ON "PracticeGuide"("copiedFromPracticeGuideId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeGuide_id_clinicId_key" ON "PracticeGuide"("id", "clinicId");

ALTER TABLE "ClinicSite"
ADD CONSTRAINT "ClinicSite_slug_format_check"
CHECK (
    char_length("slug") >= 3
    AND char_length("slug") <= 32
    AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);

ALTER TABLE "ClinicLocation"
ADD CONSTRAINT "ClinicLocation_root_slug_check"
CHECK (
    ("servesSiteRoot" = true AND "slug" IS NULL)
    OR
    ("servesSiteRoot" = false AND "slug" IS NOT NULL)
);

ALTER TABLE "ClinicLocation"
ADD CONSTRAINT "ClinicLocation_slug_format_check"
CHECK (
    "slug" IS NULL
    OR (
        char_length("slug") >= 3
        AND char_length("slug") <= 32
        AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
);

-- AddForeignKey
ALTER TABLE "ClinicSite" ADD CONSTRAINT "ClinicSite_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicLocation" ADD CONSTRAINT "ClinicLocation_clinicSiteId_clinicId_fkey" FOREIGN KEY ("clinicSiteId", "clinicId") REFERENCES "ClinicSite"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGuide" ADD CONSTRAINT "PracticeGuide_copiedFromPracticeGuideId_fkey" FOREIGN KEY ("copiedFromPracticeGuideId") REFERENCES "PracticeGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGuidePlacement" ADD CONSTRAINT "PracticeGuidePlacement_practiceGuideId_clinicId_fkey" FOREIGN KEY ("practiceGuideId", "clinicId") REFERENCES "PracticeGuide"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGuidePlacement" ADD CONSTRAINT "PracticeGuidePlacement_locationId_clinicId_fkey" FOREIGN KEY ("locationId", "clinicId") REFERENCES "ClinicLocation"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeGuidePlacement" ADD CONSTRAINT "PracticeGuidePlacement_publishedPracticeGuideRevisionId_fkey" FOREIGN KEY ("publishedPracticeGuideRevisionId") REFERENCES "PracticeGuideRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowngradeLocationSelection" ADD CONSTRAINT "DowngradeLocationSelection_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicDowngradePreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowngradeLocationSelection" ADD CONSTRAINT "DowngradeLocationSelection_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- river-aftercare:multi-location-backfill-begin
INSERT INTO "ClinicSite" (
    "id",
    "clinicId",
    "name",
    "slug",
    "displayName",
    "active",
    "isPrimary",
    "logoUrl",
    "darkLogoUrl",
    "faviconUrl",
    "primaryColor",
    "accentColor",
    "darkPrimaryColor",
    "darkAccentColor",
    "useCustomDarkBranding",
    "neutralColor",
    "radiusPreset",
    "typeface",
    "instructionTerminology",
    "themeMode",
    "allowPatientThemeToggle",
    "showCareGuideAttribution",
    "createdAt",
    "updatedAt"
)
SELECT
    'csite_' || clinic."id",
    clinic."id",
    clinic."name",
    clinic."slug",
    CASE
        WHEN profile."clinicId" IS NOT NULL THEN profile."displayName"
        ELSE clinic."name"
    END,
    true,
    true,
    profile."logoUrl",
    profile."darkLogoUrl",
    profile."faviconUrl",
    profile."primaryColor",
    profile."accentColor",
    profile."darkPrimaryColor",
    profile."darkAccentColor",
    COALESCE(profile."useCustomDarkBranding", false),
    profile."neutralColor",
    COALESCE(profile."radiusPreset", 'MEDIUM'::"ClinicRadiusPreset"),
    profile."typeface",
    COALESCE(profile."instructionTerminology", 'AFTERCARE'::"ClinicInstructionTerminology"),
    COALESCE(profile."themeMode", 'SYSTEM'::"ClinicThemeMode"),
    COALESCE(profile."allowPatientThemeToggle", false),
    COALESCE(profile."showCareGuideAttribution", true),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Clinic" AS clinic
LEFT JOIN "ClinicProfile" AS profile
    ON profile."clinicId" = clinic."id"
WHERE NOT EXISTS (
    SELECT 1
    FROM "ClinicSite" AS existing
    WHERE existing."clinicId" = clinic."id"
);

INSERT INTO "ClinicLocation" (
    "id",
    "clinicSiteId",
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
    "servesSiteRoot",
    "active",
    "deactivatedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'cloc_' || clinic."id",
    site."id",
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
INNER JOIN "ClinicSite" AS site
    ON site."clinicId" = clinic."id"
   AND site."isPrimary" = true
LEFT JOIN "ClinicProfile" AS profile
    ON profile."clinicId" = clinic."id"
WHERE NOT EXISTS (
    SELECT 1
    FROM "ClinicLocation" AS existing
    WHERE existing."clinicSiteId" = site."id"
      AND existing."servesSiteRoot" = true
);

INSERT INTO "PracticeGuidePlacement" (
    "id",
    "practiceGuideId",
    "locationId",
    "clinicId",
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
    guide."clinicId",
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
INNER JOIN "ClinicSite" AS site
    ON site."clinicId" = guide."clinicId"
   AND site."isPrimary" = true
INNER JOIN "ClinicLocation" AS location
    ON location."clinicSiteId" = site."id"
   AND location."servesSiteRoot" = true
   AND location."clinicId" = guide."clinicId"
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
