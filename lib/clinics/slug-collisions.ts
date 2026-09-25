import type { Prisma } from "@prisma/client";

import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { isReservedLocationSlug } from "@/lib/clinics/reserved-location-slugs";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

type CollisionDb = Prisma.TransactionClient;

export function assertSiteSlug(slug: string): void {
  if (!isValidCareGuideSlug(slug) || isReservedTenantSlug(slug)) {
    throw new ClinicPortalError(
      "Enter a site address using lowercase letters, numbers, and hyphens.",
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
}
