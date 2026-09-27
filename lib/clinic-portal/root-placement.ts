import type { Prisma, ServiceCategory } from "@prisma/client";

import {
  guideServiceCompatibleWithSite,
  guideServiceMismatchMessage,
} from "@/lib/aftercare/service-compatibility";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertRootGuideSlugAvailable } from "@/lib/clinics/slug-collisions";
import { lockClinicSiteLocationCapacity } from "@/lib/entitlements/locks";

export type RootPlacementDb = Prisma.TransactionClient;

type PlacementSite = {
  locationName: string;
  siteName: string;
  siteServiceCategories: ServiceCategory[];
};

async function requireGuideServiceCategory(
  db: RootPlacementDb,
  clinicId: string,
  practiceGuideId: string
): Promise<ServiceCategory | null> {
  const guide = await db.practiceGuide.findFirst({
    where: { id: practiceGuideId, clinicId },
    select: { clinicId: true, serviceCategory: true },
  });
  if (!guide || guide.clinicId !== clinicId) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }
  return guide.serviceCategory;
}

async function describeLocation(
  db: RootPlacementDb,
  clinicId: string,
  locationId: string
): Promise<PlacementSite> {
  const location = await db.clinicLocation.findFirst({
    where: { id: locationId, clinicId },
    select: {
      name: true,
      clinicId: true,
      clinicSite: {
        select: {
          name: true,
          clinicId: true,
          serviceCategories: { select: { serviceCategory: true } },
        },
      },
    },
  });
  if (
    !location ||
    location.clinicId !== clinicId ||
    location.clinicSite.clinicId !== clinicId
  ) {
    throw new ClinicPortalError("Practice not found.", "not_found");
  }
  return {
    locationName: location.name,
    siteName: location.clinicSite.name,
    siteServiceCategories: location.clinicSite.serviceCategories.map(
      (row) => row.serviceCategory
    ),
  };
}

function rejectIncompatiblePlacement(
  guideServiceCategory: ServiceCategory | null,
  site: PlacementSite
): void {
  const message = guideServiceMismatchMessage({
    guideServiceCategory,
    siteServiceCategories: site.siteServiceCategories,
    locationName: site.locationName,
    siteName: site.siteName,
  });
  if (message) {
    throw new ClinicPortalError(message, "conflict");
  }
}

async function requireRootLocation(
  db: RootPlacementDb,
  clinicId: string
): Promise<{ locationId: string; clinicSiteId: string }> {
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

  return { locationId: location.id, clinicSiteId: site.id };
}

async function guardRootSlug(
  db: RootPlacementDb,
  clinicId: string,
  publicSlug: string
): Promise<{ locationId: string }> {
  await lockClinicSiteLocationCapacity(db, clinicId);
  const root = await requireRootLocation(db, clinicId);
  await assertRootGuideSlugAvailable(db, {
    clinicId,
    clinicSiteId: root.clinicSiteId,
    publicSlug,
  });
  return { locationId: root.locationId };
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
    /**
     * Initial guide creation skips an incompatible root instead of failing
     * the guide. Publishing and other activations reject it.
     */
    whenIncompatible?: "reject" | "skip";
  }
): Promise<void> {
  const guideServiceCategory = await requireGuideServiceCategory(
    db,
    input.clinicId,
    input.practiceGuideId
  );
  const root = await requireRootLocation(db, input.clinicId);
  const site = await describeLocation(db, input.clinicId, root.locationId);
  if (
    !guideServiceCompatibleWithSite({
      guideServiceCategory,
      siteServiceCategories: site.siteServiceCategories,
    })
  ) {
    if (input.whenIncompatible === "skip") {
      return;
    }
    rejectIncompatiblePlacement(guideServiceCategory, site);
  }
  const { locationId } = await guardRootSlug(
    db,
    input.clinicId,
    input.publicSlug
  );
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

/**
 * Publishing advances the primary root placement when this guide has one.
 * A location-specific copy has no root placement. Publishing then advances
 * only its oldest placement and does not create a root placement.
 */
export async function advancePublishedPlacement(
  db: RootPlacementDb,
  input: {
    clinicId: string;
    practiceGuideId: string;
    publicSlug: string;
    publishedPracticeGuideRevisionId: string;
  }
): Promise<void> {
  const guideServiceCategory = await requireGuideServiceCategory(
    db,
    input.clinicId,
    input.practiceGuideId
  );
  const root = await requireRootLocation(db, input.clinicId);
  const placements = await db.practiceGuidePlacement.findMany({
    where: {
      practiceGuideId: input.practiceGuideId,
      clinicId: input.clinicId,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      clinicId: true,
      locationId: true,
      isEnabled: true,
      location: {
        select: {
          name: true,
          clinicId: true,
          clinicSite: {
            select: {
              name: true,
              clinicId: true,
              serviceCategories: { select: { serviceCategory: true } },
            },
          },
        },
      },
    },
  });
  for (const placement of placements) {
    if (
      placement.clinicId !== input.clinicId ||
      placement.location.clinicId !== input.clinicId ||
      placement.location.clinicSite.clinicId !== input.clinicId
    ) {
      throw new ClinicPortalError("Guide not found.", "not_found");
    }
  }

  const rootPlacement =
    placements.find((placement) => placement.locationId === root.locationId) ??
    null;
  const target = rootPlacement ?? placements[0] ?? null;
  for (const placement of placements) {
    if (!placement.isEnabled && placement.id !== target?.id) {
      continue;
    }
    rejectIncompatiblePlacement(guideServiceCategory, {
      locationName: placement.location.name,
      siteName: placement.location.clinicSite.name,
      siteServiceCategories:
        placement.location.clinicSite.serviceCategories.map(
          (row) => row.serviceCategory
        ),
    });
  }

  if (rootPlacement) {
    await upsertRootPlacement(db, {
      clinicId: input.clinicId,
      practiceGuideId: input.practiceGuideId,
      publicSlug: input.publicSlug,
      isEnabled: true,
      publishedPracticeGuideRevisionId: input.publishedPracticeGuideRevisionId,
    });
    return;
  }

  if (target) {
    await db.practiceGuidePlacement.update({
      where: { id: target.id },
      data: {
        isEnabled: true,
        publishedPracticeGuideRevisionId:
          input.publishedPracticeGuideRevisionId,
      },
    });
    return;
  }

  const rootSite = await describeLocation(db, input.clinicId, root.locationId);
  if (
    !guideServiceCompatibleWithSite({
      guideServiceCategory,
      siteServiceCategories: rootSite.siteServiceCategories,
    })
  ) {
    return;
  }

  await upsertRootPlacement(db, {
    clinicId: input.clinicId,
    practiceGuideId: input.practiceGuideId,
    publicSlug: input.publicSlug,
    isEnabled: true,
    publishedPracticeGuideRevisionId: input.publishedPracticeGuideRevisionId,
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
  const root = await requireRootLocation(db, input.clinicId);
  const currentRoot = await db.practiceGuidePlacement.findUnique({
    where: {
      locationId_practiceGuideId: {
        locationId: root.locationId,
        practiceGuideId: input.practiceGuideId,
      },
    },
    select: { id: true },
  });
  if (!currentRoot) {
    const otherPlacements = await db.practiceGuidePlacement.count({
      where: {
        practiceGuideId: input.practiceGuideId,
        clinicId: input.clinicId,
      },
    });
    if (otherPlacements > 0) {
      return;
    }
  }

  const { locationId } = await guardRootSlug(
    db,
    input.clinicId,
    input.publicSlug
  );
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
    const guideServiceCategory = await requireGuideServiceCategory(
      db,
      input.clinicId,
      input.practiceGuideId
    );
    const site = await describeLocation(db, input.clinicId, locationId);
    if (
      !guideServiceCompatibleWithSite({
        guideServiceCategory,
        siteServiceCategories: site.siteServiceCategories,
      })
    ) {
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
  const root = await requireRootLocation(db, input.clinicId);
  const locationId = root.locationId;
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
    const guideServiceCategory = await requireGuideServiceCategory(
      db,
      input.clinicId,
      input.practiceGuideId
    );
    const site = await describeLocation(db, input.clinicId, locationId);
    if (
      !guideServiceCompatibleWithSite({
        guideServiceCategory,
        siteServiceCategories: site.siteServiceCategories,
      })
    ) {
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
  const { locationId } = await guardRootSlug(
    db,
    input.clinicId,
    input.publicSlug
  );
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

  const guideServiceCategory = await requireGuideServiceCategory(
    db,
    input.clinicId,
    input.practiceGuideId
  );
  const site = await describeLocation(db, input.clinicId, locationId);
  if (
    !guideServiceCompatibleWithSite({
      guideServiceCategory,
      siteServiceCategories: site.siteServiceCategories,
    })
  ) {
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
