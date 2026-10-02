import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import {
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import { canonicalSectionCreateData } from "@/lib/canonical-templates/sections";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import type { CanonicalDraftSection } from "@/lib/canonical-templates/sections";

const clonedRevisionInclude = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
    },
  },
};

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

  const latest = await tx.guideTemplateRevision.findFirst({
    where: {
      guideTemplateId: template.id,
      status: GuideRevisionStatus.PUBLISHED,
    },
    orderBy: { version: "desc" },
    include: clonedRevisionInclude,
  });
  if (!latest) {
    throw new CanonicalTemplateError(
      "Publish the current draft before opening another one.",
      "conflict"
    );
  }

  const sections: CanonicalDraftSection[] = latest.sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    homeCareInstructions: section.homeCareInstructions.map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body,
      frequencyCount: item.frequencyCount,
      frequencyPeriod: item.frequencyPeriod,
      timingLabel: item.timingLabel,
      durationValue: item.durationValue,
      durationUnit: item.durationUnit,
      sortOrder: item.sortOrder,
    })),
  }));

  const created = await tx.guideTemplateRevision.create({
    data: {
      guideTemplateId: template.id,
      version: latest.version + 1,
      status: GuideRevisionStatus.DRAFT,
      createdByUserId: input.actorUserId,
      sections: {
        create: sections.map((section) => canonicalSectionCreateData(section)),
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
