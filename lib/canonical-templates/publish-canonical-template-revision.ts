import "server-only";

import { GuideRevisionStatus } from "@prisma/client";

import {
  assertCanonicalDraft,
  assertKnownServiceCategory,
  assertProductionCanonicalTemplate,
  loadCanonicalRevision,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { assertPublishableCanonicalSections } from "@/lib/canonical-templates/sections";

/**
 * Publishes one production draft. Section and home-care rows are validated
 * and left in place. Publication records the publisher and time. Review
 * metadata is not required. Sample publication stays on the demo bootstrap.
 */
export async function publishCanonicalTemplateRevision(input: {
  templateId: string;
  revisionId: string;
  actorUserId: string;
  expectedVersion: number;
}): Promise<{ revisionId: string; version: number; publishedAt: Date }> {
  return runLockedCanonicalTemplateTransaction(input.templateId, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    const template = await loadCanonicalTemplate(tx, input.templateId);
    assertProductionCanonicalTemplate(template);
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

    const publishedAt = new Date();
    await tx.guideTemplateRevision.update({
      where: { id: revision.id },
      data: {
        status: GuideRevisionStatus.PUBLISHED,
        publishedAt,
        publishedByUserId: input.actorUserId,
      },
    });

    return {
      revisionId: revision.id,
      version: revision.version,
      publishedAt,
    };
  });
}
