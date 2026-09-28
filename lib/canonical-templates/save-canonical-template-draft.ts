import "server-only";

import type { Prisma } from "@prisma/client";

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
  type CanonicalDraftSection,
} from "@/lib/canonical-templates/sections";

const CLEARED_CANONICAL_REVIEW = {
  reviewerName: null,
  reviewerCredential: null,
  reviewNote: null,
  reviewedAt: null,
  reviewRecordedByUserId: null,
} as const;

export const canonicalDraftSectionWriter = {
  async replace(
    tx: Prisma.TransactionClient,
    revisionId: string,
    sections: readonly CanonicalDraftSection[]
  ): Promise<void> {
    await tx.guideTemplateSection.deleteMany({
      where: { revisionId },
    });
    for (const section of sections) {
      await tx.guideTemplateSection.create({
        data: {
          revisionId,
          ...canonicalSectionCreateData(section),
        },
      });
    }
  },
};

/**
 * Replaces one draft inside a transaction the caller already opened.
 * Existing-template callers must hold the template advisory lock.
 * A content change after review evidence was recorded clears that evidence.
 */
export async function saveCanonicalTemplateDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    templateId: string;
    revisionId: string;
    actorUserId: string;
    sections: readonly CanonicalDraftSection[];
  }
): Promise<{ revisionId: string; reviewCleared: boolean }> {
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
  const contentChanged =
    canonicalContentSignature(existing) !==
    canonicalContentSignature(input.sections);
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

  await canonicalDraftSectionWriter.replace(tx, revision.id, input.sections);
  return { revisionId: revision.id, reviewCleared };
}

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

  return runLockedCanonicalTemplateTransaction(input.templateId, (tx) =>
    saveCanonicalTemplateDraftInTransaction(tx, {
      templateId: input.templateId,
      revisionId: input.revisionId,
      actorUserId: input.actorUserId,
      sections,
    })
  );
}
