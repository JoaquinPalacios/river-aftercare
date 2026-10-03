import "server-only";

import { GuideRevisionStatus, Prisma } from "@prisma/client";

import { isServiceCategory } from "@/lib/aftercare/service-category";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { lockCanonicalTemplate } from "@/lib/canonical-templates/locks";
import { isUniqueConstraintError } from "@/lib/clinics/prisma-errors";
import { getPrisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export const canonicalTemplateTransactionOptions = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

const templateSelect = {
  id: true,
  slug: true,
  title: true,
  serviceCategory: true,
  isActive: true,
  isSample: true,
  deactivatedAt: true,
  deactivatedByUserId: true,
} as const;

export type CanonicalTemplateRecord = Prisma.GuideTemplateGetPayload<{
  select: typeof templateSelect;
}>;

const revisionSelect = {
  id: true,
  guideTemplateId: true,
  version: true,
  status: true,
  createdByUserId: true,
  reviewerName: true,
  reviewerCredential: true,
  reviewNote: true,
  reviewedAt: true,
  reviewRecordedByUserId: true,
  publishedByUserId: true,
  publishedAt: true,
} as const;

export type CanonicalRevisionRecord = Prisma.GuideTemplateRevisionGetPayload<{
  select: typeof revisionSelect;
}>;

export async function runLockedCanonicalTemplateTransaction<T>(
  templateId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await lockCanonicalTemplate(tx, templateId);
    return fn(tx);
  }, canonicalTemplateTransactionOptions);
}

export async function requireCanonicalActor(
  tx: Tx,
  actorUserId: string
): Promise<void> {
  const actor = await tx.user.findUnique({
    where: { id: actorUserId },
    select: { id: true },
  });
  if (!actor) {
    throw new CanonicalTemplateError(
      "The acting user does not exist.",
      "not_found"
    );
  }
}

export async function loadCanonicalTemplate(
  tx: Tx,
  templateId: string
): Promise<CanonicalTemplateRecord> {
  const template = await tx.guideTemplate.findUnique({
    where: { id: templateId },
    select: templateSelect,
  });
  if (!template) {
    throw new CanonicalTemplateError(
      "That canonical template was not found.",
      "not_found"
    );
  }
  return template;
}

export function assertCanonicalDraft(revision: {
  status: GuideRevisionStatus;
}): void {
  if (revision.status !== GuideRevisionStatus.DRAFT) {
    throw new CanonicalTemplateError(
      "Published canonical revisions cannot be changed.",
      "immutable"
    );
  }
}

export async function loadCanonicalRevision(
  tx: Tx,
  input: { templateId: string; revisionId: string }
): Promise<CanonicalRevisionRecord> {
  const revision = await tx.guideTemplateRevision.findUnique({
    where: { id: input.revisionId },
    select: revisionSelect,
  });
  if (!revision || revision.guideTemplateId !== input.templateId) {
    throw new CanonicalTemplateError(
      "That canonical revision was not found.",
      "not_found"
    );
  }
  return revision;
}

export function assertKnownServiceCategory(value: string): void {
  if (!isServiceCategory(value)) {
    throw new CanonicalTemplateError("Choose a service category.", "invalid");
  }
}

export function throwCanonicalUniqueConflict(error: unknown): never {
  if (!isUniqueConstraintError(error)) {
    throw error;
  }
  const target = uniqueTarget(error);
  if (target.includes("one_open_draft")) {
    throw new CanonicalTemplateError(
      "This template already has an open draft.",
      "conflict"
    );
  }
  if (target.includes("slug")) {
    throw new CanonicalTemplateError("That slug is already used.", "conflict");
  }
  if (target.includes("one_active_sample")) {
    throw new CanonicalTemplateError(
      "That service category already has an active sample.",
      "conflict"
    );
  }
  if (target.includes("version")) {
    throw new CanonicalTemplateError(
      "That revision version already exists.",
      "conflict"
    );
  }
  throw new CanonicalTemplateError(
    "That canonical template change conflicts with an existing row.",
    "conflict"
  );
}

function uniqueTarget(error: unknown): string {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return "";
  }
  // PrismaPg reports the index name on driverAdapterError and in the
  // message. Older clients put the columns on meta.target. Both need to
  // map to the same operator-facing conflict.
  return `${JSON.stringify(error.meta ?? {})} ${error.message}`;
}

export async function countPublishedCanonicalRevisions(
  tx: Tx,
  templateId: string
): Promise<number> {
  return tx.guideTemplateRevision.count({
    where: {
      guideTemplateId: templateId,
      status: GuideRevisionStatus.PUBLISHED,
    },
  });
}
