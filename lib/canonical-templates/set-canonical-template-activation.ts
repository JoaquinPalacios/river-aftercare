import "server-only";

import {
  assertProductionCanonicalTemplate,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
} from "@/lib/canonical-templates/context";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";

/**
 * Stops new discovery and enablement. Does not delete revisions or change
 * clinic pins and published patient guides.
 */
export async function deactivateCanonicalTemplate(input: {
  templateId: string;
  actorUserId: string;
}): Promise<{ templateId: string; deactivatedAt: Date }> {
  const deactivatedAt = new Date();
  return runLockedCanonicalTemplateTransaction(input.templateId, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    const template = await loadCanonicalTemplate(tx, input.templateId);
    assertProductionCanonicalTemplate(template);
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
  });
}

/**
 * Clears the current deactivation record and makes an otherwise eligible
 * latest published revision discoverable again.
 */
export async function reactivateCanonicalTemplate(input: {
  templateId: string;
  actorUserId: string;
}): Promise<{ templateId: string }> {
  return runLockedCanonicalTemplateTransaction(input.templateId, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    const template = await loadCanonicalTemplate(tx, input.templateId);
    assertProductionCanonicalTemplate(template);
    if (template.isActive) {
      throw new CanonicalTemplateError(
        "This template is already active.",
        "conflict"
      );
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
  });
}
