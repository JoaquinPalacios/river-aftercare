-- Additive first-clinic governance fields.
-- Does not drop tables or columns, and does not rewrite published snapshot bodies.
-- Does not populate GuideTemplateRevision.reviewedAt / reviewedBy.
-- Does not backfill PracticeGuideRevision attestation on historical rows.

-- AlterTable
ALTER TABLE "GuideTemplate" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

-- Deterministic sample designation for the Tooth Extraction demo library row.
-- GuideTemplate.slug is unique; seed/bootstrap use slug = 'extraction'.
UPDATE "GuideTemplate"
SET "isSample" = true
WHERE "slug" = 'extraction';

-- AlterTable
ALTER TABLE "PracticeGuideRevision" ADD COLUMN "reviewAttestedAt" TIMESTAMP(3),
ADD COLUMN "reviewAttestedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "PracticeGuideRevision_reviewAttestedByUserId_idx" ON "PracticeGuideRevision"("reviewAttestedByUserId");

-- AddForeignKey
-- User deletion must not delete published snapshots or fabricate a reviewer.
ALTER TABLE "PracticeGuideRevision" ADD CONSTRAINT "PracticeGuideRevision_reviewAttestedByUserId_fkey" FOREIGN KEY ("reviewAttestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
