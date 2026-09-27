import "server-only";

import {
  assertProductionCanonicalTemplate,
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

/**
 * Title stays editable after publication. Slug and service category can be
 * corrected only before the first published revision. isSample is not an
 * input and is never written here.
 */
export async function updateCanonicalTemplateMetadata(input: {
  actorUserId: string;
  templateId: string;
  title?: string;
  slug?: string;
  serviceCategory?: string;
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
        assertProductionCanonicalTemplate(template);

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
        }

        await tx.guideTemplate.update({
          where: { id: template.id },
          data: {
            title: values.title,
            slug: values.slug,
            serviceCategory: values.serviceCategory,
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
