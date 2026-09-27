import "server-only";

import {
  assertCanonicalDraft,
  assertProductionCanonicalTemplate,
  loadCanonicalRevision,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import {
  canonicalSectionCreateData,
  parseCanonicalDraftSections,
} from "@/lib/canonical-templates/sections";

const CLEARED_CANONICAL_REVIEW = {
  reviewerName: null,
  reviewerCredential: null,
  reviewNote: null,
  reviewedAt: null,
  reviewRecordedByUserId: null,
} as const;

/**
 * Replaces the draft's sections and home-care instructions.
 * A content change after review evidence was recorded clears that evidence.
 * Template title, slug, and service category are not content and are not
 * written here.
 */
export async function saveCanonicalTemplateDraft(input: {
  templateId: string;
  revisionId: string;
  actorUserId: string;
  sections: unknown;
}): Promise<{ revisionId: string; reviewCleared: boolean }> {
  const sections = parseCanonicalDraftSections(input.sections);

  return runLockedCanonicalTemplateTransaction(input.templateId, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    const template = await loadCanonicalTemplate(tx, input.templateId);
    assertProductionCanonicalTemplate(template);
    const revision = await loadCanonicalRevision(tx, {
      templateId: template.id,
      revisionId: input.revisionId,
    });
    assertCanonicalDraft(revision);

    const existing = await tx.guideTemplateSection.findMany({
      where: { revisionId: revision.id },
      orderBy: { sortOrder: "asc" },
      include: {
        homeCareInstructions: { orderBy: { sortOrder: "asc" } },
      },
    });
    const previousSignature = canonicalContentSignature(existing);
    const nextSignature = canonicalContentSignature(sections);
    const contentChanged = previousSignature !== nextSignature;
    const reviewCleared = contentChanged && revision.reviewedAt != null;

    if (!contentChanged) {
      return { revisionId: revision.id, reviewCleared: false };
    }

    if (reviewCleared) {
      await tx.guideTemplateRevision.update({
        where: { id: revision.id },
        data: CLEARED_CANONICAL_REVIEW,
      });
    }

    await tx.guideTemplateSection.deleteMany({
      where: { revisionId: revision.id },
    });
    for (const section of sections) {
      await tx.guideTemplateSection.create({
        data: {
          revisionId: revision.id,
          ...canonicalSectionCreateData(section),
        },
      });
    }

    return { revisionId: revision.id, reviewCleared };
  });
}
