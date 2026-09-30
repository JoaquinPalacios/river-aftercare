import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import { abandonCanonicalTemplateDraftInTransaction } from "@/lib/canonical-templates/abandon-canonical-template-draft";
import {
  canonicalTemplateTransactionOptions,
  countPublishedCanonicalRevisions,
  loadCanonicalTemplate,
  requireCanonicalActor,
} from "@/lib/canonical-templates/context";
import {
  BulkCanonicalTemplateError,
  CanonicalTemplateError,
  isCanonicalTemplateError,
} from "@/lib/canonical-templates/errors";
import { lockCanonicalTemplate } from "@/lib/canonical-templates/locks";
import {
  assertCanonicalTemplateRevisionPublishable,
  publishCanonicalTemplateRevisionInTransaction,
  type CanonicalPublicationInput,
} from "@/lib/canonical-templates/publish-canonical-template-revision";
import {
  deactivateCanonicalTemplateInTransaction,
  reactivateCanonicalTemplateInTransaction,
} from "@/lib/canonical-templates/set-canonical-template-activation";
import { getPrisma } from "@/lib/prisma";

export const CANONICAL_TEMPLATE_BULK_LIMIT = 40;

type Tx = Prisma.TransactionClient;

interface Failure {
  title: string;
  message: string;
}

function safeMessage(error: unknown): string {
  if (isCanonicalTemplateError(error)) {
    return error.message;
  }
  return "That template change could not be saved.";
}

function nothingChanged(failures: readonly Failure[]): string {
  const details = failures
    .map((failure) => `${failure.title}: ${failure.message}`)
    .join(" ");
  return `Nothing was changed. ${details}`;
}

function assertBatchSize(count: number): void {
  if (count === 0) {
    throw new CanonicalTemplateError(
      "Select at least one template.",
      "invalid"
    );
  }
  if (count > CANONICAL_TEMPLATE_BULK_LIMIT) {
    throw new CanonicalTemplateError(
      `Select at most ${CANONICAL_TEMPLATE_BULK_LIMIT} templates at a time.`,
      "invalid"
    );
  }
}

function assertUnique(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new CanonicalTemplateError("Select each template once.", "invalid");
  }
}

async function templateTitle(tx: Tx, templateId: string): Promise<string> {
  const template = await tx.guideTemplate.findUnique({
    where: { id: templateId },
    select: { title: true },
  });
  const title = template?.title.trim() ?? "";
  return title || "A selected template";
}

/**
 * Locks every selected template in id order, then runs the callback.
 * A thrown error rolls the whole batch back.
 */
async function runBulkTransaction<T>(
  templateIds: readonly string[],
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  const ids = [...templateIds].sort();
  return getPrisma().$transaction(async (tx) => {
    for (const templateId of ids) {
      await lockCanonicalTemplate(tx, templateId);
    }
    return fn(tx);
  }, canonicalTemplateTransactionOptions);
}

async function preflight(
  tx: Tx,
  templateIds: readonly string[],
  check: (templateId: string) => Promise<void>
): Promise<void> {
  const failures: Failure[] = [];
  for (const templateId of templateIds) {
    try {
      await check(templateId);
    } catch (error) {
      failures.push({
        title: await templateTitle(tx, templateId),
        message: safeMessage(error),
      });
    }
  }
  if (failures.length > 0) {
    throw new BulkCanonicalTemplateError(nothingChanged(failures), failures);
  }
}

async function applyOne(
  tx: Tx,
  templateId: string,
  write: () => Promise<void>
): Promise<void> {
  try {
    await write();
  } catch (error) {
    const failure = {
      title: await templateTitle(tx, templateId),
      message: safeMessage(error),
    };
    throw new BulkCanonicalTemplateError(nothingChanged([failure]), [failure]);
  }
}

export async function publishCanonicalTemplates(input: {
  actorUserId: string;
  templates: readonly Omit<CanonicalPublicationInput, "actorUserId">[];
}): Promise<{ count: number }> {
  const templates: CanonicalPublicationInput[] = input.templates.map(
    (template) => ({
      ...template,
      actorUserId: input.actorUserId,
    })
  );
  assertBatchSize(templates.length);
  assertUnique(templates.map((template) => template.templateId));

  return runBulkTransaction(
    templates.map((template) => template.templateId),
    async (tx) => {
      await requireCanonicalActor(tx, input.actorUserId);
      await preflight(
        tx,
        templates.map((template) => template.templateId),
        async (templateId) => {
          const template = templates.find(
            (item) => item.templateId === templateId
          );
          if (!template) {
            throw new CanonicalTemplateError(
              "That canonical template was not found.",
              "not_found"
            );
          }
          await assertCanonicalTemplateRevisionPublishable(tx, template);
        }
      );
      for (const template of templates) {
        await applyOne(tx, template.templateId, async () => {
          await publishCanonicalTemplateRevisionInTransaction(tx, template);
        });
      }
      return { count: templates.length };
    }
  );
}

export async function deactivateCanonicalTemplates(input: {
  actorUserId: string;
  templateIds: readonly string[];
}): Promise<{ count: number }> {
  const templateIds = [...input.templateIds];
  assertBatchSize(templateIds.length);
  assertUnique(templateIds);
  const deactivatedAt = new Date();

  return runBulkTransaction(templateIds, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    await preflight(tx, templateIds, async (templateId) => {
      const template = await loadCanonicalTemplate(tx, templateId);
      if (template.isSample) {
        throw new CanonicalTemplateError(
          "Sample templates are outside the production template lifecycle.",
          "sample"
        );
      }
      if (!template.isActive) {
        throw new CanonicalTemplateError(
          "This template is already inactive.",
          "conflict"
        );
      }
    });
    for (const templateId of templateIds) {
      await applyOne(tx, templateId, async () => {
        await deactivateCanonicalTemplateInTransaction(tx, {
          templateId,
          actorUserId: input.actorUserId,
          deactivatedAt,
        });
      });
    }
    return { count: templateIds.length };
  });
}

export async function reactivateCanonicalTemplates(input: {
  actorUserId: string;
  templateIds: readonly string[];
}): Promise<{ count: number }> {
  const templateIds = [...input.templateIds];
  assertBatchSize(templateIds.length);
  assertUnique(templateIds);

  return runBulkTransaction(templateIds, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    await preflight(tx, templateIds, async (templateId) => {
      const template = await loadCanonicalTemplate(tx, templateId);
      if (template.isSample) {
        throw new CanonicalTemplateError(
          "Sample templates are outside the production template lifecycle.",
          "sample"
        );
      }
      if (template.isActive) {
        throw new CanonicalTemplateError(
          "This template is already active.",
          "conflict"
        );
      }
    });
    for (const templateId of templateIds) {
      await applyOne(tx, templateId, async () => {
        await reactivateCanonicalTemplateInTransaction(tx, {
          templateId,
          actorUserId: input.actorUserId,
        });
      });
    }
    return { count: templateIds.length };
  });
}

/**
 * Deletes never-published production templates through the abandon service.
 * A template that has ever been published is rejected before any write.
 */
export async function deleteNeverPublishedCanonicalTemplates(input: {
  actorUserId: string;
  templateIds: readonly string[];
}): Promise<{ count: number }> {
  const templateIds = [...input.templateIds];
  assertBatchSize(templateIds.length);
  assertUnique(templateIds);

  return runBulkTransaction(templateIds, async (tx) => {
    await requireCanonicalActor(tx, input.actorUserId);
    const drafts = new Map<string, string>();
    await preflight(tx, templateIds, async (templateId) => {
      const revisionId = await assertNeverPublishedDeletable(tx, templateId);
      drafts.set(templateId, revisionId);
    });
    for (const templateId of templateIds) {
      const revisionId = drafts.get(templateId);
      if (!revisionId) {
        throw new CanonicalTemplateError(
          "Only a never-published template with its current draft can be deleted.",
          "conflict"
        );
      }
      await applyOne(tx, templateId, async () => {
        const result = await abandonCanonicalTemplateDraftInTransaction(tx, {
          templateId,
          revisionId,
          actorUserId: input.actorUserId,
        });
        if (!result.deletedTemplate) {
          throw new CanonicalTemplateError(
            "This template has a published revision. Deactivate it instead of deleting it.",
            "immutable"
          );
        }
      });
    }
    return { count: templateIds.length };
  });
}

async function assertNeverPublishedDeletable(
  tx: Tx,
  templateId: string
): Promise<string> {
  const template = await loadCanonicalTemplate(tx, templateId);
  if (template.isSample) {
    throw new CanonicalTemplateError(
      "Sample templates are outside the production template lifecycle.",
      "sample"
    );
  }
  const published = await countPublishedCanonicalRevisions(tx, template.id);
  if (published > 0) {
    throw new CanonicalTemplateError(
      "This template has a published revision. Deactivate it instead of deleting it.",
      "immutable"
    );
  }
  const revisions = await tx.guideTemplateRevision.findMany({
    where: { guideTemplateId: template.id },
    select: { id: true, status: true },
  });
  const draft = revisions[0];
  if (
    revisions.length !== 1 ||
    !draft ||
    draft.status !== GuideRevisionStatus.DRAFT
  ) {
    throw new CanonicalTemplateError(
      "Only a never-published template with its current draft can be deleted.",
      "conflict"
    );
  }
  const pinned = await tx.practiceGuide.count({
    where: { pinnedRevisionId: draft.id },
  });
  if (pinned > 0) {
    throw new CanonicalTemplateError(
      "A clinic guide still pins this draft.",
      "pinned"
    );
  }
  const attached = await tx.practiceGuide.count({
    where: { guideTemplateId: template.id },
  });
  if (attached > 0) {
    throw new CanonicalTemplateError(
      "A clinic guide still references this template.",
      "pinned"
    );
  }
  return draft.id;
}
