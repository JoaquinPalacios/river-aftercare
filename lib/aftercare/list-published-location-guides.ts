import "server-only";

import { getPatientLocation } from "@/lib/aftercare/get-patient-location";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";
import type { PublishedPracticeGuideSummary } from "@/lib/aftercare/types";
import { ACTIVE_PRACTICE_GUIDE_WHERE } from "@/lib/entitlements/active-guide";
import { publishedPatientGuidesRemainPublic } from "@/lib/billing/public-guide-access";
import type { ComposedPatientProfile } from "@/lib/clinics/patient-profile";
import { getPrisma } from "@/lib/prisma";

export interface ListedLocationGuides {
  clinic: {
    id: string;
    slug: string;
    name: string;
  };
  profile: ComposedPatientProfile;
  placeName: string;
  locationSlug: string;
  guides: PublishedPracticeGuideSummary[];
}

/**
 * Lists enabled placements for one location. Does not load other locations.
 */
export async function listPublishedLocationGuides(input: {
  siteSlug: string;
  locationSlug: string;
}): Promise<ListedLocationGuides | null> {
  const place = await getPatientLocation({
    siteSlug: input.siteSlug,
    locationSlug: input.locationSlug,
  });
  if (!place) {
    return null;
  }

  const listed = {
    clinic: place.clinic,
    profile: place.profile,
    placeName: place.placeName,
    locationSlug: place.locationSlug,
  };

  const guidesRemainPublic = await publishedPatientGuidesRemainPublic(
    place.clinic.id
  );
  if (!guidesRemainPublic) {
    return { ...listed, guides: [] };
  }

  const placements = await getPrisma().practiceGuidePlacement.findMany({
    where: {
      isEnabled: true,
      clinicId: place.clinic.id,
      locationId: place.locationId,
      practiceGuide: {
        clinicId: place.clinic.id,
        ...ACTIVE_PRACTICE_GUIDE_WHERE,
        ...PUBLIC_PRACTICE_GUIDE_WHERE,
      },
    },
    orderBy: [{ practiceGuide: { sortOrder: "asc" } }, { publicSlug: "asc" }],
    select: {
      publicSlug: true,
      clinicId: true,
      publishedPracticeGuideRevision: {
        select: { title: true, practiceGuideId: true },
      },
      practiceGuide: {
        select: {
          id: true,
          clinicId: true,
          title: true,
          sortOrder: true,
          publishedAt: true,
          guideTemplate: { select: { title: true } },
        },
      },
    },
  });

  return {
    ...listed,
    guides: placements
      .filter(
        (placement) =>
          placement.clinicId === place.clinic.id &&
          placement.practiceGuide.clinicId === place.clinic.id
      )
      .map((placement) => {
        const title =
          placement.publishedPracticeGuideRevision?.practiceGuideId ===
          placement.practiceGuide.id
            ? placement.publishedPracticeGuideRevision.title.trim() ||
              placement.practiceGuide.title.trim() ||
              placement.practiceGuide.guideTemplate?.title ||
              "Aftercare guide"
            : placement.practiceGuide.title.trim() ||
              placement.practiceGuide.guideTemplate?.title ||
              "Aftercare guide";
        return {
          id: placement.practiceGuide.id,
          publicSlug: placement.publicSlug,
          title,
          sortOrder: placement.practiceGuide.sortOrder,
          publishedAt: placement.practiceGuide.publishedAt,
          href: `/${place.locationSlug}/${placement.publicSlug}`,
        };
      }),
  };
}
