import type { Prisma, ServiceCategory } from "@prisma/client";

import { guideServiceMismatchMessage } from "@/lib/aftercare/service-compatibility";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";

type PlacementDb = Prisma.TransactionClient;

/**
 * Enabled placements restored onto a destination account must still satisfy
 * the same site/guide classification rule. Disabled placements are not
 * activated by the move.
 */
export async function assertEnabledPlacementsCompatible(
  db: PlacementDb,
  rows: ReadonlyArray<{
    practiceGuideId: string;
    locationId: string;
    isEnabled: boolean;
  }>
): Promise<void> {
  const active = rows.filter((row) => row.isEnabled);
  if (active.length === 0) {
    return;
  }

  const [guides, locations] = await Promise.all([
    db.practiceGuide.findMany({
      where: {
        id: { in: [...new Set(active.map((row) => row.practiceGuideId))] },
      },
      select: { id: true, serviceCategory: true },
    }),
    db.clinicLocation.findMany({
      where: { id: { in: [...new Set(active.map((row) => row.locationId))] } },
      select: {
        id: true,
        name: true,
        clinicSite: {
          select: {
            name: true,
            serviceCategories: { select: { serviceCategory: true } },
          },
        },
      },
    }),
  ]);
  const guideCategory = new Map<string, ServiceCategory | null>(
    guides.map((guide) => [guide.id, guide.serviceCategory])
  );
  const locationById = new Map(
    locations.map((location) => [location.id, location])
  );

  for (const row of active) {
    const category = guideCategory.get(row.practiceGuideId);
    const location = locationById.get(row.locationId);
    if (category === undefined || !location) {
      throw new ClinicPortalError(
        "A moving placement has no destination guide copy.",
        "conflict"
      );
    }
    const message = guideServiceMismatchMessage({
      guideServiceCategory: category,
      siteServiceCategories: location.clinicSite.serviceCategories.map(
        (entry) => entry.serviceCategory
      ),
      locationName: location.name,
      siteName: location.clinicSite.name,
    });
    if (message) {
      throw new ClinicPortalError(message, "conflict");
    }
  }
}
