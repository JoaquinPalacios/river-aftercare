import type { Prisma, PrismaClient } from "@prisma/client";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";
import { sharedDemoSiteSlugForHostname } from "@/lib/tenancy/shared-demo-hostname";

export const RETIRED_TENANT_SLUG_MESSAGE =
  "That address has been permanently retired and cannot be reused.";

type SlugDb = Prisma.TransactionClient | PrismaClient;

export function tenantSlugLockKey(slug: string): string {
  return `tenant-slug:${slug}`;
}

/**
 * Serializes issuance of one tenant hostname.
 * Callers that already hold clinic-account-structure locks take this after
 * those locks. A new clinic has no structure lock yet, so creation takes
 * only this lock.
 */
export async function lockTenantSlugs(
  tx: Prisma.TransactionClient,
  slugs: readonly string[]
): Promise<void> {
  const ordered = [...new Set(slugs)].filter((slug) => slug.length > 0).sort();
  for (const slug of ordered) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantSlugLockKey(slug)}))`;
  }
}

/**
 * Lock every slug, then re-read RetiredTenantSlug before a publish.
 * Callers that already hold structure or split locks take this after those
 * locks. The advisory locks stay until the transaction commits.
 */
export async function lockAndAssertTenantSlugsAvailable(
  tx: Prisma.TransactionClient,
  slugs: readonly string[]
): Promise<void> {
  const ordered = [...new Set(slugs)].filter((slug) => slug.length > 0).sort();
  await lockTenantSlugs(tx, ordered);
  for (const slug of ordered) {
    await assertTenantSlugNotRetired(tx, slug);
  }
}

export async function tenantSlugIsRetired(
  db: SlugDb,
  slug: string
): Promise<boolean> {
  const row = await db.retiredTenantSlug.findUnique({
    where: { slug },
    select: { id: true },
  });
  return row !== null;
}

export async function assertTenantSlugNotRetired(
  db: SlugDb,
  slug: string
): Promise<void> {
  if (await tenantSlugIsRetired(db, slug)) {
    throw new ClinicPortalError(RETIRED_TENANT_SLUG_MESSAGE, "conflict");
  }
}

/**
 * Public hostname labels, including the shared-demo alias, that resolve to
 * a retired tenant slug.
 */
export async function isRetiredPublicTenantLabel(
  label: string
): Promise<boolean> {
  const labels = new Set<string>([label]);
  const aliased = sharedDemoSiteSlugForHostname(label);
  if (aliased) {
    labels.add(aliased);
  }
  const row = await getPrisma().retiredTenantSlug.findFirst({
    where: { slug: { in: [...labels] } },
    select: { id: true },
  });
  return row !== null;
}
