import "server-only";

import type { Prisma } from "@prisma/client";

import {
  assertCanonicalDraft,
  countPublishedCanonicalRevisions,
  loadCanonicalRevision,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";

export interface CanonicalDraftAbandonInput {
  templateId: string;
  revisionId: string;
  actorUserId: string;
}

/**
 * Deletes an open draft inside the caller's transaction.
 * The caller holds the template advisory lock.
 * A published revision is never deleted.
 */
export async function abandonCanonicalTemplateDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: CanonicalDraftAbandonInput
): Promise<{ deletedTemplate: boolean }> {
  await requireCanonicalActor(tx, input.actorUserId);
  const template = await loadCanonicalTemplate(tx, input.templateId);
  const revision = await loadCanonicalRevision(tx, {
    templateId: template.id,
    revisionId: input.revisionId,
  });
  assertCanonicalDraft(revision);

  const pinned = await tx.practiceGuide.count({
    where: { pinnedRevisionId: revision.id },
  });
  if (pinned > 0) {
    throw new CanonicalTemplateError(
      "A clinic guide still pins this draft.",
      "pinned"
    );
  }

  const published = await countPublishedCanonicalRevisions(tx, template.id);
  if (published === 0) {
    const attached = await tx.practiceGuide.count({
      where: { guideTemplateId: template.id },
    });
    if (attached > 0) {
      throw new CanonicalTemplateError(
        "A clinic guide still references this template.",
        "pinned"
      );
    }
    await tx.guideTemplate.delete({ where: { id: template.id } });
    return { deletedTemplate: true };
  }

  await tx.guideTemplateRevision.delete({ where: { id: revision.id } });
  return { deletedTemplate: false };
}

/**
 * Deletes an open draft. A published revision is never deleted.
 * If the template has never been published, the template row is deleted
 * with the only draft so the slug is not left reserved by an empty shell.
 */
export async function abandonCanonicalTemplateDraft(
  input: CanonicalDraftAbandonInput
): Promise<{ deletedTemplate: boolean }> {
  return runLockedCanonicalTemplateTransaction(input.templateId, (tx) =>
    abandonCanonicalTemplateDraftInTransaction(tx, input)
  );
}
