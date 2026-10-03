import "server-only";

import type { Prisma } from "@prisma/client";

import {
  canonicalTemplateTransactionOptions,
  loadCanonicalTemplate,
  requireCanonicalActor,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import { createCanonicalTemplateInTransaction } from "@/lib/canonical-templates/create-canonical-template";
import {
  CANONICAL_DUPLICATE_CATEGORY_MESSAGE,
  CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE,
} from "@/lib/canonical-templates/duplicate-template-messages";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { lockCanonicalTemplate } from "@/lib/canonical-templates/locks";
import { loadLatestPublishedCanonicalContent } from "@/lib/canonical-templates/published-canonical-content";
import { saveCanonicalTemplateDraftInTransaction } from "@/lib/canonical-templates/save-canonical-template-draft";
import {
  duplicateCanonicalTemplateSchema,
  parseCanonicalInput,
} from "@/lib/canonical-templates/schemas";
import { getPrisma } from "@/lib/prisma";

export interface DuplicateCanonicalTemplateResult {
  templateId: string;
  revisionId: string;
  version: number;
}

/**
 * Creates an independent canonical template from the source's latest
 * published revision.
 *
 * Lock order is the source template, then the active-sample category lock
 * taken inside template creation when the copy is a sample, then the new
 * template. The source row is not written. Section and instruction keys are
 * content keys for the new template. Database ids, older revisions, clinic
 * placements, and adoption records are not copied.
 */
export async function duplicateCanonicalTemplateInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    sourceTemplateId: string;
    title: string;
    slug: string;
    serviceCategory: string;
    classification: "PRODUCTION" | "SAMPLE";
  }
): Promise<DuplicateCanonicalTemplateResult> {
  await lockCanonicalTemplate(tx, input.sourceTemplateId);
  await requireCanonicalActor(tx, input.actorUserId);
  const source = await loadCanonicalTemplate(tx, input.sourceTemplateId);
  if (input.serviceCategory !== source.serviceCategory) {
    throw new CanonicalTemplateError(
      CANONICAL_DUPLICATE_CATEGORY_MESSAGE,
      "invalid"
    );
  }

  const published = await loadLatestPublishedCanonicalContent(tx, source.id);
  if (!published) {
    throw new CanonicalTemplateError(
      CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE,
      "invalid"
    );
  }

  const slugOwner = await tx.guideTemplate.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (slugOwner) {
    throw new CanonicalTemplateError("That slug is already used.", "conflict");
  }

  const created = await createCanonicalTemplateInTransaction(tx, {
    actorUserId: input.actorUserId,
    title: input.title,
    slug: input.slug,
    serviceCategory: source.serviceCategory,
    classification: input.classification,
  });
  await lockCanonicalTemplate(tx, created.templateId);
  await saveCanonicalTemplateDraftInTransaction(tx, {
    templateId: created.templateId,
    revisionId: created.revisionId,
    actorUserId: input.actorUserId,
    sections: published.sections,
  });

  return {
    templateId: created.templateId,
    revisionId: created.revisionId,
    version: created.version,
  };
}

/**
 * Creates an independent draft template from the latest published revision.
 * The copy is not published and does not adopt a clinic guide.
 */
export async function duplicateCanonicalTemplate(input: {
  actorUserId: string;
  sourceTemplateId: string;
  title: string;
  slug: string;
  serviceCategory: string;
  classification: "PRODUCTION" | "SAMPLE";
}): Promise<DuplicateCanonicalTemplateResult> {
  const values = parseCanonicalInput(duplicateCanonicalTemplateSchema, input);

  try {
    return await getPrisma().$transaction(
      (tx) => duplicateCanonicalTemplateInTransaction(tx, values),
      canonicalTemplateTransactionOptions
    );
  } catch (error) {
    if (error instanceof CanonicalTemplateError) {
      throw error;
    }
    throwCanonicalUniqueConflict(error);
  }
}
