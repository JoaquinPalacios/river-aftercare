import type { Prisma } from "@prisma/client";

import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { isReservedLocationSlug } from "@/lib/clinics/reserved-location-slugs";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";
import { isSharedDemoHostnameLabel } from "@/lib/tenancy/shared-demo-hostname";

type CollisionDb = Prisma.TransactionClient;

export function assertSiteSlug(slug: string): void {
  if (
    !isValidCareGuideSlug(slug) ||
    isReservedTenantSlug(slug) ||
    isDemoTenant(slug) ||
    isSharedDemoHostnameLabel(slug)
  ) {
    throw new ClinicPortalError(
      isDemoTenant(slug) || isSharedDemoHostnameLabel(slug)
        ? "That hostname is reserved for the interactive demo."
        : "Enter a site address using lowercase letters, numbers, and hyphens.",
      "invalid"
    );
  }
}

export function assertLocationSlug(slug: string): void {
  if (!isValidCareGuideSlug(slug) || isReservedLocationSlug(slug)) {
    throw new ClinicPortalError(
      "Enter a location address using lowercase letters, numbers, and hyphens.",
      "invalid"
    );
  }
}

export const RETIRED_LOCATION_SLUG_MESSAGE =
  "That address is reserved because a location used to be published there.";

async function assertSlugNotRetired(
  db: CollisionDb,
  input: { clinicSiteId: string; slug: string }
): Promise<void> {
  const retired = await db.clinicLocationRedirect.findUnique({
    where: {
      sourceClinicSiteId_fromSlug: {
        sourceClinicSiteId: input.clinicSiteId,
        fromSlug: input.slug,
      },
    },
    select: { sourceClinicSiteId: true },
  });
  if (retired) {
    throw new ClinicPortalError(RETIRED_LOCATION_SLUG_MESSAGE, "retired_slug");
  }
}

/** Root guide addresses and additional location paths share the first URL segment. */
export async function assertLocationSlugAvailable(
  db: CollisionDb,
  input: { clinicId: string; clinicSiteId: string; slug: string }
): Promise<void> {
  assertLocationSlug(input.slug);
  const rootPlacements = await db.practiceGuidePlacement.findMany({
    where: {
      clinicId: input.clinicId,
      isEnabled: true,
      publicSlug: input.slug,
      location: {
        clinicId: input.clinicId,
        clinicSiteId: input.clinicSiteId,
        servesSiteRoot: true,
      },
    },
    select: { id: true },
    take: 1,
  });
  if (rootPlacements.length > 0) {
    throw new ClinicPortalError(
      "That location address is already used by a guide on this site.",
      "conflict"
    );
  }
  await assertSlugNotRetired(db, {
    clinicSiteId: input.clinicSiteId,
    slug: input.slug,
  });
}

export async function assertRootGuideSlugAvailable(
  db: CollisionDb,
  input: { clinicId: string; clinicSiteId: string; publicSlug: string }
): Promise<void> {
  if (!isValidCareGuideSlug(input.publicSlug)) {
    throw new ClinicPortalError("Enter a valid public slug.", "invalid");
  }
  const locations = await db.clinicLocation.findMany({
    where: {
      clinicId: input.clinicId,
      clinicSiteId: input.clinicSiteId,
      servesSiteRoot: false,
      slug: input.publicSlug,
    },
    select: { id: true },
    take: 1,
  });
  if (locations.length > 0) {
    throw new ClinicPortalError(
      "That guide address is already used by a location on this site.",
      "conflict"
    );
  }
  await assertSlugNotRetired(db, {
    clinicSiteId: input.clinicSiteId,
    slug: input.publicSlug,
  });
}
