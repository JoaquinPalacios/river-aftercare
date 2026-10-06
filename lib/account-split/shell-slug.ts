import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
import {
  lockTenantSlugs,
  RETIRED_TENANT_SLUG_MESSAGE,
  tenantSlugIsRetired,
} from "@/lib/clinics/retired-tenant-slug";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

/**
 * Compatibility Clinic.slug for a destination shell.
 * Prefix `xsp` plus 8 hex characters. It is never written to ClinicSite.slug,
 * so patient hostname resolution cannot serve it. Execution replaces
 * Clinic.slug with the moved ClinicSite.slug.
 */
const SPLIT_SHELL_SLUG = /^xsp[a-f0-9]{8}$/;

export function isSplitShellCompatibilitySlug(slug: string): boolean {
  return SPLIT_SHELL_SLUG.test(slug);
}

export function generateSplitShellSlug(): string {
  return `xsp${randomBytes(4).toString("hex")}`;
}

export async function allocateSplitShellSlug(
  tx: Prisma.TransactionClient,
  candidates: readonly string[]
): Promise<string> {
  const usable = candidates.filter(
    (slug) =>
      isSplitShellCompatibilitySlug(slug) &&
      isValidCareGuideSlug(slug) &&
      !isReservedTenantSlug(slug)
  );
  await lockTenantSlugs(tx, usable);
  let sawRetired = false;
  let sawOccupied = false;
  for (const slug of usable) {
    if (await tenantSlugIsRetired(tx, slug)) {
      sawRetired = true;
      continue;
    }
    const clinic = await tx.clinic.findUnique({
      where: { slug },
      select: { id: true },
    });
    const site = await tx.clinicSite.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!clinic && !site) {
      return slug;
    }
    sawOccupied = true;
  }
  if (sawRetired && !sawOccupied) {
    throw new ClinicPortalError(RETIRED_TENANT_SLUG_MESSAGE, "conflict");
  }
  throw new ClinicPortalError(
    "Could not reserve a destination account slug.",
    "conflict"
  );
}
