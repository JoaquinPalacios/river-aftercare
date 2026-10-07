-- Reversible clinic archive.
-- Existing rows stay unarchived because both new columns are null.
-- Legacy permanentlyDeletedAt tombstones are not rewritten and are not Archive.
-- A retired hostname may outlive the clinic row. Existing tombstones keep formerClinicId.
-- Additive. Do not apply this migration to production from this change.
-- river-aftercare:destructive-reviewed
-- DROP CONSTRAINT only replaces RetiredTenantSlug_formerClinicId_fkey so the
-- column can be null and ON DELETE SET NULL. No table, column, or row is removed.

ALTER TABLE "Clinic" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "archivedByUserId" TEXT;

-- User removal must not delete the clinic. The actor id is cleared; archivedAt stays.
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Clinic_archivedByUserId_idx" ON "Clinic"("archivedByUserId");

-- Archive always implies inactive. Unarchive clears archivedAt and leaves deactivatedAt.
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_archive_implies_inactive" CHECK ("archivedAt" IS NULL OR "deactivatedAt" IS NOT NULL);

ALTER TABLE "RetiredTenantSlug" DROP CONSTRAINT "RetiredTenantSlug_formerClinicId_fkey";
ALTER TABLE "RetiredTenantSlug" ALTER COLUMN "formerClinicId" DROP NOT NULL;
ALTER TABLE "RetiredTenantSlug" ADD CONSTRAINT "RetiredTenantSlug_formerClinicId_fkey" FOREIGN KEY ("formerClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
