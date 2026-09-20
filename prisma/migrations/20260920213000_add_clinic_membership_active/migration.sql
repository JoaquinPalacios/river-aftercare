-- Per-clinic Active/Inactive membership status.
-- Additive and backward-compatible: existing memberships default to Active.
-- This does not disable User accounts or change passwords, emails, or roles.

-- AlterTable
ALTER TABLE "ClinicMembership" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "ClinicMembership_userId_active_idx" ON "ClinicMembership"("userId", "active");
