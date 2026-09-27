-- Canonical template lifecycle provenance.
--
-- Copies any existing GuideTemplateRevision.reviewedBy display string into
-- reviewerName, including historical non-null values. Null reviewedBy stays
-- null. No reviewer, recording Operator, or publishing Operator is inferred.
-- The Tooth Extraction sample stays unreviewed because its reviewedBy is null.
--
-- river-aftercare:destructive-reviewed
-- DROP COLUMN removes reviewedBy after that copy. The marker records review
-- of this destructive step. It is not approval to run the migration in
-- production from this change.

ALTER TABLE "GuideTemplate" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "GuideTemplate" ADD COLUMN "deactivatedByUserId" TEXT;

ALTER TABLE "GuideTemplateRevision" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "GuideTemplateRevision" ADD COLUMN "reviewerName" TEXT;
ALTER TABLE "GuideTemplateRevision" ADD COLUMN "reviewerCredential" TEXT;
ALTER TABLE "GuideTemplateRevision" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "GuideTemplateRevision" ADD COLUMN "reviewRecordedByUserId" TEXT;
ALTER TABLE "GuideTemplateRevision" ADD COLUMN "publishedByUserId" TEXT;

UPDATE "GuideTemplateRevision"
SET "reviewerName" = "reviewedBy"
WHERE "reviewedBy" IS NOT NULL;

ALTER TABLE "GuideTemplateRevision" DROP COLUMN "reviewedBy";

-- User removal must not delete canonical template or revision history.
ALTER TABLE "GuideTemplate" ADD CONSTRAINT "GuideTemplate_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuideTemplateRevision" ADD CONSTRAINT "GuideTemplateRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuideTemplateRevision" ADD CONSTRAINT "GuideTemplateRevision_reviewRecordedByUserId_fkey" FOREIGN KEY ("reviewRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuideTemplateRevision" ADD CONSTRAINT "GuideTemplateRevision_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GuideTemplate_deactivatedByUserId_idx" ON "GuideTemplate"("deactivatedByUserId");
CREATE INDEX "GuideTemplateRevision_createdByUserId_idx" ON "GuideTemplateRevision"("createdByUserId");
CREATE INDEX "GuideTemplateRevision_reviewRecordedByUserId_idx" ON "GuideTemplateRevision"("reviewRecordedByUserId");
CREATE INDEX "GuideTemplateRevision_publishedByUserId_idx" ON "GuideTemplateRevision"("publishedByUserId");

-- At most one open draft per canonical template. Prisma cannot express this
-- predicate. Lifecycle services also take the canonical-template advisory lock.
-- Existing rows must already satisfy it; this migration does not delete drafts.
CREATE UNIQUE INDEX "GuideTemplateRevision_one_open_draft_key"
ON "GuideTemplateRevision" ("guideTemplateId")
WHERE "status" = 'DRAFT';
