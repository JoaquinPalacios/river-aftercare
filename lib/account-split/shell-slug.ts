import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
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
  for (const slug of candidates) {
    if (
      !isSplitShellCompatibilitySlug(slug) ||
      !isValidCareGuideSlug(slug) ||
      isReservedTenantSlug(slug)
    ) {
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
  }
  throw new ClinicPortalError(
    "Could not reserve a destination account slug.",
    "conflict"
  );
}
