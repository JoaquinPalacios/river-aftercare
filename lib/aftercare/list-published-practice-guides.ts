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

  const clinic = await getClinicBySlug(clinicSlug);

  if (!clinic) {
    return null;
  }

  const guidesRemainPublic = await publishedPatientGuidesRemainPublic(
    clinic.id
  );
  if (!guidesRemainPublic) {
    return {
      clinic: {
        id: clinic.id,
        slug: clinic.slug,
        name: clinic.name,
      },
      profile: clinic.profile,
      guides: [],
    };
  }

  const guides = await getPrisma().practiceGuide.findMany({
    where: {
      clinicId: clinic.id,
      ...ACTIVE_PRACTICE_GUIDE_WHERE,
      ...PUBLIC_PRACTICE_GUIDE_WHERE,
    },
    orderBy: [{ sortOrder: "asc" }, { publicSlug: "asc" }],
    select: {
      id: true,
      publicSlug: true,
      sortOrder: true,
      publishedAt: true,
      title: true,
      guideTemplate: {
        select: { title: true },
      },
      contentRevisions: {
        where: { status: "PUBLISHED", version: { gt: 0 } },
        orderBy: { version: "desc" },
        take: 1,
        select: { title: true },
      },
    },
  });

  return {
    clinic: {
      id: clinic.id,
      slug: clinic.slug,
      name: clinic.name,
    },
    profile: clinic.profile,
    guides: guides.map((guide) => ({
      id: guide.id,
      publicSlug: guide.publicSlug,
      title:
        guide.contentRevisions[0]?.title?.trim() ||
        guide.title.trim() ||
        guide.guideTemplate?.title ||
        "Aftercare guide",
      sortOrder: guide.sortOrder,
      publishedAt: guide.publishedAt,
    })),
  };
}
