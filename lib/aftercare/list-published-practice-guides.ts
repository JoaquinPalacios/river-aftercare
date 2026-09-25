import "server-only";

import {
  getClinicBySlug,
  type ClinicBySlugRecord,
} from "@/lib/aftercare/get-clinic-by-slug";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";
import { ACTIVE_PRACTICE_GUIDE_WHERE } from "@/lib/entitlements/active-guide";
import { publishedPatientGuidesRemainPublic } from "@/lib/billing/public-guide-access";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import type { PublishedPracticeGuideSummary } from "@/lib/aftercare/types";
import { getPrisma } from "@/lib/prisma";

export interface ListedPublishedPracticeGuides {
  clinic: {
    id: string;
    slug: string;
    name: string;
  };
  profile: ClinicBySlugRecord["profile"];
  guides: PublishedPracticeGuideSummary[];
}

export async function listPublishedPracticeGuides(
  clinicSlug: string
): Promise<ListedPublishedPracticeGuides | null> {
  if (!isValidCareGuideSlug(clinicSlug)) {
    return null;
  }

  const tenant = await getClinicBySlug(clinicSlug);
  if (!tenant) {
    return null;
  }

  const listed = {
    clinic: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    },
    profile: tenant.profile,
  };

  const guidesRemainPublic = await publishedPatientGuidesRemainPublic(
    tenant.id
  );
  if (!guidesRemainPublic) {
    return { ...listed, guides: [] };
  }

  const placements = await getPrisma().practiceGuidePlacement.findMany({
    where: {
      isEnabled: true,
      clinicId: tenant.id,
      location: {
        servesSiteRoot: true,
        active: true,
        clinicId: tenant.id,
        clinicSite: {
          slug: tenant.slug,
          active: true,
          clinicId: tenant.id,
        },
      },
      practiceGuide: {
        clinicId: tenant.id,
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
          guideTemplate: {
            select: { title: true },
          },
        },
      },
    },
  });

  return {
    ...listed,
    guides: placements
      .filter(
        (placement) =>
          placement.clinicId === tenant.id &&
          placement.practiceGuide.clinicId === tenant.id
      )
      .map((placement) => ({
        id: placement.practiceGuide.id,
        publicSlug: placement.publicSlug,
        title:
          placement.publishedPracticeGuideRevision?.practiceGuideId ===
          placement.practiceGuide.id
            ? placement.publishedPracticeGuideRevision.title.trim() ||
              placement.practiceGuide.title.trim() ||
              placement.practiceGuide.guideTemplate?.title ||
              "Aftercare guide"
            : placement.practiceGuide.title.trim() ||
              placement.practiceGuide.guideTemplate?.title ||
              "Aftercare guide",
        sortOrder: placement.practiceGuide.sortOrder,
        publishedAt: placement.practiceGuide.publishedAt,
      })),
  };
}
