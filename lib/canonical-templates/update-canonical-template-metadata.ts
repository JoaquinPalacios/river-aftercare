import "server-only";

import { isSampleClassification } from "@/lib/canonical-templates/classification";
import {
  countPublishedCanonicalRevisions,
  loadCanonicalTemplate,
  requireCanonicalActor,
  runLockedCanonicalTemplateTransaction,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import {
  parseCanonicalInput,
  updateCanonicalTemplateMetadataSchema,
} from "@/lib/canonical-templates/schemas";
import { assertActiveSampleAvailable } from "@/lib/canonical-templates/sample-slot";

/**
 * Title stays editable after publication. Slug, service category, and
 * Production/Sample classification can change only before the first published
 * revision. An active sample still has to be the only active sample in its
 * service category.
 */
export async function updateCanonicalTemplateMetadata(input: {
  actorUserId: string;
  templateId: string;
  title?: string;
  slug?: string;
  serviceCategory?: string;
  classification?: "PRODUCTION" | "SAMPLE";
}): Promise<{ templateId: string }> {
  const values = parseCanonicalInput(
    updateCanonicalTemplateMetadataSchema,
    input
  );

  try {
    return await runLockedCanonicalTemplateTransaction(
      values.templateId,
      async (tx) => {
        await requireCanonicalActor(tx, values.actorUserId);
        const template = await loadCanonicalTemplate(tx, values.templateId);
        const nextIsSample =
          values.classification === undefined
            ? template.isSample
            : isSampleClassification(values.classification);
        const nextCategory = values.serviceCategory ?? template.serviceCategory;

        const published = await countPublishedCanonicalRevisions(
          tx,
          template.id
        );
        if (published > 0) {
          if (values.slug !== undefined && values.slug !== template.slug) {
            throw new CanonicalTemplateError(
              "The slug cannot change after the first published revision.",
              "immutable"
            );
          }
          if (
            values.serviceCategory !== undefined &&
            values.serviceCategory !== template.serviceCategory
          ) {
            throw new CanonicalTemplateError(
              "The service category cannot change after the first published revision.",
              "immutable"
            );
          }
          if (nextIsSample !== template.isSample) {
            throw new CanonicalTemplateError(
              "The classification cannot change after the first published revision.",
              "immutable"
            );
          }
        }

        const entersSampleSlot =
          nextIsSample &&
          template.isActive &&
          (!template.isSample || nextCategory !== template.serviceCategory);
        if (entersSampleSlot) {
          await assertActiveSampleAvailable(tx, {
            serviceCategory: nextCategory,
            exceptTemplateId: template.id,
          });
        }

        await tx.guideTemplate.update({
          where: { id: template.id },
          data: {
            title: values.title,
            slug: values.slug,
            serviceCategory: values.serviceCategory,
            ...(values.classification === undefined
              ? {}
              : { isSample: nextIsSample }),
          },
        });

        return { templateId: template.id };
      }
    );
  } catch (error) {
    if (error instanceof CanonicalTemplateError) {
      throw error;
    }
    throwCanonicalUniqueConflict(error);
  }
}
