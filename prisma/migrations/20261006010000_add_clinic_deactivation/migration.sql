-- Reversible clinic-account deactivation.
-- Existing rows stay active because both columns are null.
-- Additive. No site, location, guide, membership, invitation, or billing row is written.
-- Do not apply this migration to production from this change.

ALTER TABLE "Clinic" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "deactivatedByUserId" TEXT;

-- User removal must not delete the clinic. The actor id is cleared; deactivatedAt stays.
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Clinic_deactivatedByUserId_idx" ON "Clinic"("deactivatedByUserId");
