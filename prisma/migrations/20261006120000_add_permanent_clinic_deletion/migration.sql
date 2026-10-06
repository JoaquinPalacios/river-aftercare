-- Permanent clinic tombstone and retired tenant hostnames.
-- Existing rows stay active: both new Clinic columns are null.
-- Additive. No clinic, site, guide, membership, or billing row is rewritten.
-- Do not apply this migration to production from this change.

ALTER TABLE "Clinic" ADD COLUMN "permanentlyDeletedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "permanentlyDeletedByUserId" TEXT;

-- User removal must not delete the clinic. The actor id is cleared; permanentlyDeletedAt stays.
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_permanentlyDeletedByUserId_fkey" FOREIGN KEY ("permanentlyDeletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Clinic_permanentlyDeletedByUserId_idx" ON "Clinic"("permanentlyDeletedByUserId");

-- One row per hostname that a permanently deleted clinic used.
-- The clinic tombstone stays. Deleting the clinic is refused.
CREATE TABLE "RetiredTenantSlug" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "formerClinicId" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredTenantSlug_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetiredTenantSlug_slug_key" ON "RetiredTenantSlug"("slug");
CREATE INDEX "RetiredTenantSlug_formerClinicId_idx" ON "RetiredTenantSlug"("formerClinicId");

ALTER TABLE "RetiredTenantSlug" ADD CONSTRAINT "RetiredTenantSlug_formerClinicId_fkey" FOREIGN KEY ("formerClinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
