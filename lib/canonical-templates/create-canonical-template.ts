import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import { isSampleClassification } from "@/lib/canonical-templates/classification";
import {
  canonicalTemplateTransactionOptions,
  requireCanonicalActor,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import {
  createCanonicalTemplateSchema,
  parseCanonicalInput,
} from "@/lib/canonical-templates/schemas";
import { assertActiveSampleAvailable } from "@/lib/canonical-templates/sample-slot";
import { getPrisma } from "@/lib/prisma";

export async function createCanonicalTemplateInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    title: string;
    slug: string;
    serviceCategory: Prisma.GuideTemplateCreateInput["serviceCategory"];
    classification?: "PRODUCTION" | "SAMPLE";
  }
): Promise<{ templateId: string; revisionId: string; version: number }> {
  await requireCanonicalActor(tx, input.actorUserId);
  const classification = input.classification ?? "PRODUCTION";
  const isSample = isSampleClassification(classification);
  if (isSample) {
    await assertActiveSampleAvailable(tx, {
      serviceCategory: input.serviceCategory,
    });
  }
  const template = await tx.guideTemplate.create({
    data: {
      title: input.title,
      slug: input.slug,
      serviceCategory: input.serviceCategory,
      isActive: true,
      isSample,
      revisions: {
        create: {
          version: 1,
          status: GuideRevisionStatus.DRAFT,
          createdByUserId: input.actorUserId,
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
}

/**
 * Creates a canonical template and its first draft revision.
 * Production is the default classification. A sample is created only when
 * that service category has no active sample.
 */
export async function createCanonicalTemplate(input: {
  actorUserId: string;
  title: string;
  slug: string;
  serviceCategory: string;
  classification?: "PRODUCTION" | "SAMPLE";
}): Promise<{ templateId: string; revisionId: string; version: number }> {
  const values = parseCanonicalInput(createCanonicalTemplateSchema, input);

  try {
    return await getPrisma().$transaction(
      (tx) => createCanonicalTemplateInTransaction(tx, values),
      canonicalTemplateTransactionOptions
    );
  } catch (error) {
    throwCanonicalUniqueConflict(error);
  }
}
