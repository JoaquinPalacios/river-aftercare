-- Additive account-structure foundation.
-- Extends ClinicAccountSplitPreparation. Does not drop structural rows.
-- Does not enable LOCATION_TO_NEW_ACCOUNT, SITE_TO_EXISTING_GROUP, or SITE_TO_NEW_GROUP.

-- CreateEnum
CREATE TYPE "ClinicAccountSplitOperationKind" AS ENUM ('SITE_TO_NEW_ACCOUNT', 'LOCATION_TO_NEW_ACCOUNT', 'SITE_TO_EXISTING_GROUP', 'SITE_TO_NEW_GROUP');

-- CreateEnum
CREATE TYPE "ClinicAccountSplitEventKind" AS ENUM ('PREPARATION_CREATED', 'STATUS_TRANSITION', 'BRANDING_PREPARED', 'BRANDING_PREPARATION_FAILED', 'STALE_REVISION_REFUSED', 'CUTOVER_STARTED', 'CUTOVER_COMPLETED', 'COMPLETED_RETRY', 'CANCELLED', 'COMMERCIAL_CONFLICT');

-- Existing rows backfill to the only enabled operation.
ALTER TABLE "ClinicAccountSplitPreparation"
ADD COLUMN "operationKind" "ClinicAccountSplitOperationKind" NOT NULL DEFAULT 'SITE_TO_NEW_ACCOUNT';

ALTER TABLE "ClinicAccountSplitPreparation"
ADD COLUMN "preparationRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClinicAccountSplitPreparation"
ADD COLUMN "sourceLocationId" TEXT;

ALTER TABLE "ClinicAccountSplitPreparation"
ADD COLUMN "destinationSiteSlug" TEXT;

-- CreateTable
CREATE TABLE "ClinicAccountSplitBrandingAsset" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "sourceStorageKey" TEXT NOT NULL,
    "destinationStorageKey" TEXT NOT NULL,
    "copiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAccountSplitBrandingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAccountSplitEvent" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "kind" "ClinicAccountSplitEventKind" NOT NULL,
    "fromStatus" "ClinicAccountSplitStatus",
    "toStatus" "ClinicAccountSplitStatus",
    "actorUserId" TEXT,
    "sourceClinicId" TEXT NOT NULL,
    "destinationClinicId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicAccountSplitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_sourceLocationId_idx" ON "ClinicAccountSplitPreparation"("sourceLocationId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitPreparation_operationKind_idx" ON "ClinicAccountSplitPreparation"("operationKind");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitBrandingAsset_preparationId_idx" ON "ClinicAccountSplitBrandingAsset"("preparationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicAccountSplitBrandingAsset_preparationId_sourceStorage_key" ON "ClinicAccountSplitBrandingAsset"("preparationId", "sourceStorageKey");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitEvent_preparationId_createdAt_idx" ON "ClinicAccountSplitEvent"("preparationId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitEvent_actorUserId_idx" ON "ClinicAccountSplitEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "ClinicAccountSplitEvent_sourceClinicId_idx" ON "ClinicAccountSplitEvent"("sourceClinicId");

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitPreparation" ADD CONSTRAINT "ClinicAccountSplitPreparation_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "ClinicLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitBrandingAsset" ADD CONSTRAINT "ClinicAccountSplitBrandingAsset_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitEvent" ADD CONSTRAINT "ClinicAccountSplitEvent_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAccountSplitEvent" ADD CONSTRAINT "ClinicAccountSplitEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A destination Account can take part in a later completed move.
-- Open preparations still cannot share a destination.
DROP INDEX "ClinicAccountSplitPreparation_destinationClinicId_key";

CREATE UNIQUE INDEX "ClinicAccountSplitPreparation_destination_open_key"
ON "ClinicAccountSplitPreparation" ("destinationClinicId")
WHERE "destinationClinicId" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CANCELLED');

-- Reserved for LOCATION_TO_NEW_ACCOUNT. Existing rows keep a null location,
-- so this index does not conflict with current Site splits.
CREATE UNIQUE INDEX "ClinicAccountSplitPreparation_source_location_open_key"
ON "ClinicAccountSplitPreparation" ("sourceLocationId")
WHERE "sourceLocationId" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CANCELLED');
