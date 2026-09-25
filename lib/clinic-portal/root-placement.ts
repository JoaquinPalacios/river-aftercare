import type { Prisma } from "@prisma/client";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";

export type RootPlacementDb = Prisma.TransactionClient;

async function requireRootLocationId(
  db: RootPlacementDb,
  clinicId: string
): Promise<string> {
  const sites = await db.clinicSite.findMany({
    where: { clinicId, isPrimary: true, active: true },
    select: {
      id: true,
      clinicId: true,
      locations: {
        where: {
          servesSiteRoot: true,
          active: true,
          clinicId,
        },
        select: { id: true, clinicId: true, clinicSiteId: true },
      },
    },
  });

  if (sites.length !== 1) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }

  const site = sites[0];
  if (!site || site.clinicId !== clinicId || site.locations.length !== 1) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }

  const location = site.locations[0];
  if (
    !location ||
    location.clinicId !== clinicId ||
    location.clinicSiteId !== site.id
  ) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }

  return location.id;
}

/**
 * Creates or replaces the placement at the account's primary site root.
 * Other locations are never updated.
 */
export async function upsertRootPlacement(
  db: RootPlacementDb,
  input: {
    clinicId: string;
    practiceGuideId: string;
    publicSlug: string;
    isEnabled: boolean;
    publishedPracticeGuideRevisionId: string | null;
  }
): Promise<void> {
  const locationId = await requireRootLocationId(db, input.clinicId);
  await db.practiceGuidePlacement.upsert({
    where: {
      locationId_practiceGuideId: {
        locationId,
        practiceGuideId: input.practiceGuideId,
      },
    },
    create: {
      locationId,
      practiceGuideId: input.practiceGuideId,
      clinicId: input.clinicId,
      publicSlug: input.publicSlug,
      isEnabled: input.isEnabled,
      publishedPracticeGuideRevisionId: input.publishedPracticeGuideRevisionId,
    },
    update: {
      publicSlug: input.publicSlug,
      isEnabled: input.isEnabled,
      publishedPracticeGuideRevisionId: input.publishedPracticeGuideRevisionId,
    },
  });
}

/** Keeps the root placement slug aligned without changing enablement or pin. */
export async function alignRootPlacementSlug(
  db: RootPlacementDb,
  input: {
    clinicId: string;
    practiceGuideId: string;
    publicSlug: string;
  }
): Promise<void> {
  const locationId = await requireRootLocationId(db, input.clinicId);
  const existing = await db.practiceGuidePlacement.findUnique({
    where: {
      locationId_practiceGuideId: {
        locationId,
        practiceGuideId: input.practiceGuideId,
      },
    },
    select: { id: true, clinicId: true },
  });

  if (!existing) {
    await db.practiceGuidePlacement.create({
      data: {
        locationId,
        practiceGuideId: input.practiceGuideId,
        clinicId: input.clinicId,
        publicSlug: input.publicSlug,
        isEnabled: false,
        publishedPracticeGuideRevisionId: null,
      },
    });
    return;
  }

  if (existing.clinicId !== input.clinicId) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  await db.practiceGuidePlacement.update({
    where: { id: existing.id },
    data: { publicSlug: input.publicSlug },
  });
}

/** Disables only the primary site's root placement. */
export async function disableRootPlacement(
  db: RootPlacementDb,
  input: { clinicId: string; practiceGuideId: string; publicSlug: string }
): Promise<void> {
  const locationId = await requireRootLocationId(db, input.clinicId);
  const existing = await db.practiceGuidePlacement.findUnique({
    where: {
      locationId_practiceGuideId: {
        locationId,
        practiceGuideId: input.practiceGuideId,
      },
    },
    select: { id: true, clinicId: true },
  });

  if (!existing) {
    await db.practiceGuidePlacement.create({
      data: {
        locationId,
        practiceGuideId: input.practiceGuideId,
        clinicId: input.clinicId,
        publicSlug: input.publicSlug,
        isEnabled: false,
        publishedPracticeGuideRevisionId: null,
      },
    });
    return;
  }

  if (existing.clinicId !== input.clinicId) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  await db.practiceGuidePlacement.update({
    where: { id: existing.id },
    data: { isEnabled: false },
  });
}

/** Creates the root placement when a forked guide does not have one yet. */
export async function ensureRootPlacement(
  db: RootPlacementDb,
  input: {
    clinicId: string;
    practiceGuideId: string;
    publicSlug: string;
  }
): Promise<void> {
  const locationId = await requireRootLocationId(db, input.clinicId);
  const existing = await db.practiceGuidePlacement.findUnique({
    where: {
      locationId_practiceGuideId: {
        locationId,
        practiceGuideId: input.practiceGuideId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  await db.practiceGuidePlacement.create({
    data: {
      locationId,
      practiceGuideId: input.practiceGuideId,
      clinicId: input.clinicId,
      publicSlug: input.publicSlug,
      isEnabled: false,
      publishedPracticeGuideRevisionId: null,
    },
  });
}
