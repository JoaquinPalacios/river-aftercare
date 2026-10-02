import "server-only";

import type { Prisma } from "@prisma/client";

import {
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { assertActiveSampleAvailable } from "@/lib/canonical-templates/sample-slot";

export interface CanonicalActivationInput {
  templateId: string;
  actorUserId: string;
}

/**
 * Stops new discovery and enablement inside the caller's transaction.
 * Does not delete revisions or change clinic pins and published patient guides.
 */
export async function deactivateCanonicalTemplateInTransaction(
  tx: Prisma.TransactionClient,
  input: CanonicalActivationInput & { deactivatedAt?: Date }
): Promise<{ templateId: string; deactivatedAt: Date }> {
  const deactivatedAt = input.deactivatedAt ?? new Date();
  await requireCanonicalActor(tx, input.actorUserId);
  const template = await loadCanonicalTemplate(tx, input.templateId);
  if (!template.isActive) {
    throw new CanonicalTemplateError(
      "This template is already inactive.",
      "conflict"
    );
  }

  await tx.guideTemplate.update({
    where: { id: template.id },
    data: {
      isActive: false,
      deactivatedAt,
      deactivatedByUserId: input.actorUserId,
    },
  });

  return { templateId: template.id, deactivatedAt };
}

/**
 * Stops new discovery and enablement. Does not delete revisions or change
 * clinic pins and published patient guides.
 */
export async function deactivateCanonicalTemplate(
  input: CanonicalActivationInput
): Promise<{ templateId: string; deactivatedAt: Date }> {
  const deactivatedAt = new Date();
  return runLockedCanonicalTemplateTransaction(input.templateId, (tx) =>
    deactivateCanonicalTemplateInTransaction(tx, { ...input, deactivatedAt })
  );
}

/**
 * Clears the current deactivation record inside the caller's transaction.
 */
export async function reactivateCanonicalTemplateInTransaction(
  tx: Prisma.TransactionClient,
  input: CanonicalActivationInput
): Promise<{ templateId: string }> {
  await requireCanonicalActor(tx, input.actorUserId);
  const template = await loadCanonicalTemplate(tx, input.templateId);
  if (template.isActive) {
    throw new CanonicalTemplateError(
      "This template is already active.",
      "conflict"
    );
  }
  if (template.isSample) {
    await assertActiveSampleAvailable(tx, {
      serviceCategory: template.serviceCategory,
      exceptTemplateId: template.id,
    });
  }

  await tx.guideTemplate.update({
    where: { id: template.id },
    data: {
      isActive: true,
      deactivatedAt: null,
      deactivatedByUserId: null,
    },
  });

  return { templateId: template.id };
}

/**
 * Clears the current deactivation record and makes an otherwise eligible
 * latest published revision discoverable again.
 */
export async function reactivateCanonicalTemplate(
  input: CanonicalActivationInput
): Promise<{ templateId: string }> {
  return runLockedCanonicalTemplateTransaction(input.templateId, (tx) =>
    reactivateCanonicalTemplateInTransaction(tx, input)
  );
}
