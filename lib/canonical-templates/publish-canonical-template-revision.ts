import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import {
  assertCanonicalDraft,
  assertKnownServiceCategory,
  loadCanonicalRevision,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { assertPublishableCanonicalSections } from "@/lib/canonical-templates/sections";

export interface CanonicalPublicationInput {
  templateId: string;
  revisionId: string;
  actorUserId: string;
  expectedVersion: number;
}

/**
 * Read-only publication gate used by single and bulk publish.
 * Section validation stays here so callers do not restate it.
 */
export async function assertCanonicalTemplateRevisionPublishable(
  tx: Prisma.TransactionClient,
  input: CanonicalPublicationInput
): Promise<void> {
  await requireCanonicalActor(tx, input.actorUserId);
  const template = await loadCanonicalTemplate(tx, input.templateId);
  if (!template.isActive) {
    throw new CanonicalTemplateError(
      "Activate this template before publishing.",
      "inactive"
    );
  }
  assertKnownServiceCategory(template.serviceCategory);

  const revision = await loadCanonicalRevision(tx, {
    templateId: template.id,
    revisionId: input.revisionId,
  });
  assertCanonicalDraft(revision);
  if (revision.version !== input.expectedVersion) {
    throw new CanonicalTemplateError(
      "That draft version is no longer current.",
      "conflict"
    );
  }

  const stored = await tx.guideTemplateSection.findMany({
    where: { revisionId: revision.id },
    orderBy: { sortOrder: "asc" },
    include: {
      homeCareInstructions: { orderBy: { sortOrder: "asc" } },
    },
  });
  assertPublishableCanonicalSections(stored);
}

/**
 * Publishes one production draft inside the caller's transaction.
 * The caller holds the template advisory lock.
 */
export async function publishCanonicalTemplateRevisionInTransaction(
  tx: Prisma.TransactionClient,
  input: CanonicalPublicationInput
): Promise<{ revisionId: string; version: number; publishedAt: Date }> {
  await assertCanonicalTemplateRevisionPublishable(tx, input);
  const publishedAt = new Date();
  await tx.guideTemplateRevision.update({
    where: { id: input.revisionId },
    data: {
      status: GuideRevisionStatus.PUBLISHED,
      publishedAt,
      publishedByUserId: input.actorUserId,
    },
  });

  return {
    revisionId: input.revisionId,
    version: input.expectedVersion,
    publishedAt,
  };
}

/**
 * Publishes one draft. Section and home-care rows are validated and left in
 * place. Publication records the publisher and time. Review metadata is not
 * required. Sample and production drafts use the same publication rules.
 * A published revision is not rewritten.
 */
export async function publishCanonicalTemplateRevision(
  input: CanonicalPublicationInput
): Promise<{ revisionId: string; version: number; publishedAt: Date }> {
  return runLockedCanonicalTemplateTransaction(input.templateId, (tx) =>
    publishCanonicalTemplateRevisionInTransaction(tx, input)
  );
}
