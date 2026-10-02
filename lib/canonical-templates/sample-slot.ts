import "server-only";

import type { Prisma, ServiceCategory } from "@prisma/client";

import { serviceCategoryLabel } from "@/lib/aftercare/service-category";
import { activeSampleConflictMessage } from "@/lib/canonical-templates/classification";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { getPrisma } from "@/lib/prisma";

/**
 * Transaction-scoped lock for the active sample slot of one service category.
 * Distinct from the per-template canonical lock. Callers that take both locks
 * take the template lock first, then this one.
 */
export function canonicalSampleCategoryLockKey(
  serviceCategory: string
): string {
  return `canonical-sample-category:${serviceCategory}`;
}

export async function lockCanonicalSampleCategory(
  tx: Prisma.TransactionClient,
  serviceCategory: string
): Promise<void> {
  const key = canonicalSampleCategoryLockKey(serviceCategory);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export interface ActiveCanonicalSample {
  id: string;
  title: string;
  serviceCategory: ServiceCategory;
}

export async function listActiveCanonicalSamples(): Promise<
  ActiveCanonicalSample[]
> {
  return getPrisma().guideTemplate.findMany({
    where: { isSample: true, isActive: true },
    orderBy: [{ serviceCategory: "asc" }, { title: "asc" }],
    select: { id: true, title: true, serviceCategory: true },
  });
}

/**
 * Rejects a second active sample in one service category.
 * The caller is inside a transaction. The partial unique index
 * GuideTemplate_one_active_sample_per_category_key is the backstop.
 */
export async function assertActiveSampleAvailable(
  tx: Prisma.TransactionClient,
  input: { serviceCategory: string; exceptTemplateId?: string }
): Promise<void> {
  await lockCanonicalSampleCategory(tx, input.serviceCategory);
  const occupant = await tx.guideTemplate.findFirst({
    where: {
      serviceCategory: input.serviceCategory as ServiceCategory,
      isSample: true,
      isActive: true,
      ...(input.exceptTemplateId
        ? { id: { not: input.exceptTemplateId } }
        : {}),
    },
    select: { title: true },
  });
  if (!occupant) {
    return;
  }
  const label =
    serviceCategoryLabel(input.serviceCategory as ServiceCategory) ??
    input.serviceCategory;
  throw new CanonicalTemplateError(
    activeSampleConflictMessage(label, occupant.title),
    "conflict"
  );
}
