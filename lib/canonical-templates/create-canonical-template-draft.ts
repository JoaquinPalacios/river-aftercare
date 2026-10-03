import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import {
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import { loadLatestPublishedCanonicalContent } from "@/lib/canonical-templates/published-canonical-content";
import { canonicalSectionCreateData } from "@/lib/canonical-templates/sections";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";

/**
 * Opens the next draft from the latest published revision.
 * The caller holds the transaction and the template advisory lock.
 * Version 1 is created with the template. This does not open a second
 * initial draft when nothing has been published.
 */
export async function createCanonicalTemplateDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: { templateId: string; actorUserId: string }
): Promise<{ revisionId: string; version: number }> {
  await requireCanonicalActor(tx, input.actorUserId);
  const template = await loadCanonicalTemplate(tx, input.templateId);

  const openDraft = await tx.guideTemplateRevision.findFirst({
    where: {
      guideTemplateId: template.id,
      status: GuideRevisionStatus.DRAFT,
    },
    select: { id: true },
  });
  if (openDraft) {
    throw new CanonicalTemplateError(
      "This template already has an open draft.",
      "conflict"
    );
  }

  const latest = await loadLatestPublishedCanonicalContent(tx, template.id);
  if (!latest) {
    throw new CanonicalTemplateError(
      "Publish the current draft before opening another one.",
      "conflict"
    );
  }

  const created = await tx.guideTemplateRevision.create({
    data: {
      guideTemplateId: template.id,
      version: latest.version + 1,
      status: GuideRevisionStatus.DRAFT,
      createdByUserId: input.actorUserId,
      sections: {
        create: latest.sections.map((section) =>
          canonicalSectionCreateData(section)
        ),
      },
    },
    select: { id: true, version: true },
  });

  return { revisionId: created.id, version: created.version };
}

/**
 * Opens the next draft from the latest published revision.
 * Version 1 is created with the template. This does not open a second
 * initial draft when nothing has been published.
 */
export async function createCanonicalTemplateDraft(input: {
  templateId: string;
  actorUserId: string;
}): Promise<{ revisionId: string; version: number }> {
  try {
    return await runLockedCanonicalTemplateTransaction(input.templateId, (tx) =>
      createCanonicalTemplateDraftInTransaction(tx, input)
    );
  } catch (error) {
    if (error instanceof CanonicalTemplateError) {
      throw error;
    }
    throwCanonicalUniqueConflict(error);
  }
}
