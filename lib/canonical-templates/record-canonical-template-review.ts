import "server-only";

import {
  assertCanonicalDraft,
  assertProductionCanonicalTemplate,
  loadCanonicalRevision,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import {
  parseCanonicalInput,
  recordCanonicalTemplateReviewSchema,
} from "@/lib/canonical-templates/schemas";

/**
 * Records or replaces review evidence on a production draft.
 * Does not publish the revision. The reviewer name is display identity and
 * may be an external clinician. The actor is the Operator who entered it.
 */
export async function recordCanonicalTemplateReview(input: {
  templateId: string;
  revisionId: string;
  actorUserId: string;
  reviewerName: string;
  reviewerCredential?: string | null;
  reviewNote?: string | null;
}): Promise<{ revisionId: string; reviewedAt: Date }> {
  const values = parseCanonicalInput(
    recordCanonicalTemplateReviewSchema,
    input
  );
  const reviewedAt = new Date();

  return runLockedCanonicalTemplateTransaction(
    values.templateId,
    async (tx) => {
      await requireCanonicalActor(tx, values.actorUserId);
      const template = await loadCanonicalTemplate(tx, values.templateId);
      assertProductionCanonicalTemplate(template);
      const revision = await loadCanonicalRevision(tx, {
        templateId: template.id,
        revisionId: values.revisionId,
      });
      assertCanonicalDraft(revision);

      await tx.guideTemplateRevision.update({
        where: { id: revision.id },
        data: {
          reviewerName: values.reviewerName,
          reviewerCredential: values.reviewerCredential,
          reviewNote: values.reviewNote,
          reviewedAt,
          reviewRecordedByUserId: values.actorUserId,
        },
      });

      return { revisionId: revision.id, reviewedAt };
    }
  );
}
