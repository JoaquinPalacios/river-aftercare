import "server-only";

import { GuideRevisionStatus } from "@prisma/client";

import {
  canonicalTemplateTransactionOptions,
  requireCanonicalActor,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import {
  createCanonicalTemplateSchema,
  parseCanonicalInput,
} from "@/lib/canonical-templates/schemas";
import { getPrisma } from "@/lib/prisma";

/**
 * Creates a production canonical template and its first draft revision.
 * Sample templates cannot be created here. The demo bootstrap remains the
 * exceptional writer for the extraction sample.
 */
export async function createCanonicalTemplate(input: {
  actorUserId: string;
  title: string;
  slug: string;
  serviceCategory: string;
}): Promise<{ templateId: string; revisionId: string; version: number }> {
  const values = parseCanonicalInput(createCanonicalTemplateSchema, input);

  try {
    return await getPrisma().$transaction(async (tx) => {
      await requireCanonicalActor(tx, values.actorUserId);
      const template = await tx.guideTemplate.create({
        data: {
          title: values.title,
          slug: values.slug,
          serviceCategory: values.serviceCategory,
          isActive: true,
          isSample: false,
          revisions: {
            create: {
              version: 1,
              status: GuideRevisionStatus.DRAFT,
              createdByUserId: values.actorUserId,
            },
          },
        },
        select: {
          id: true,
          revisions: { select: { id: true, version: true } },
        },
      });
      const revision = template.revisions[0];
      if (!revision) {
        throw new Error("Canonical template draft v1 was not created.");
      }
      return {
        templateId: template.id,
        revisionId: revision.id,
        version: revision.version,
      };
    }, canonicalTemplateTransactionOptions);
  } catch (error) {
    throwCanonicalUniqueConflict(error);
  }
}
