import "server-only";

import { GuideRevisionStatus, Prisma } from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import {
  type ClinicBySlugRecord,
  getClinicBySlug,
} from "@/lib/aftercare/get-clinic-by-slug";
import { composedSectionsFromPracticeRevision } from "@/lib/aftercare/practice-revision-document";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";
import { downgradeRetainedDirectUrlVisible } from "@/lib/entitlements/downgrade-retention";
import { publishedPatientGuidesRemainPublic } from "@/lib/billing/public-guide-access";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import type { ComposedGuideSection } from "@/lib/aftercare/types";
import { getPrisma } from "@/lib/prisma";

/**
 * Public patient document. Serve the placement's pinned clinic revision, or
 * the canonical template pin when that clinic revision is null.
 * Do not attach reviewAttestedBy, reviewAttestedAt, MedicalWebPage, or
 * canonical reviewedBy to this shape — ADR 0021.
 */
export interface PublishedPracticeGuideDocument {
  clinic: {
    id: string;
    slug: string;
    name: string;
  };
  profile: ClinicBySlugRecord["profile"];
  title: string;
  template: {
    id: string;
    slug: string;
    title: string;
    specialty: string;
  } | null;
  practiceGuide: {
    id: string;
    publicSlug: string;
    publishedAt: Date | null;
  };
  revision: {
    id: string;
    version: number;
    reviewedAt: Date | null;
  };
  sections: ComposedGuideSection[];
}

const placementSelect = Prisma.validator<Prisma.PracticeGuidePlacementSelect>()(
  {
    id: true,
    clinicId: true,
    publicSlug: true,
    isEnabled: true,
    publishedPracticeGuideRevisionId: true,
    location: {
      select: {
        clinicId: true,
        clinicSite: {
          select: {
            slug: true,
            clinicId: true,
            active: true,
          },
        },
      },
    },
    publishedPracticeGuideRevision: {
      select: {
        id: true,
        practiceGuideId: true,
        version: true,
        status: true,
        title: true,
        publishedAt: true,
        sections: {
          orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
          select: {
            key: true,
            kind: true,
            title: true,
            body: true,
            periodLabel: true,
            startDay: true,
            endDay: true,
            sortOrder: true,
            provenance: true,
          },
        },
      },
    },
    practiceGuide: {
      select: {
        id: true,
        clinicId: true,
        title: true,
        publicSlug: true,
        publishedAt: true,
        downgradeRetainedAt: true,
        downgradeRetentionUntil: true,
        guideTemplate: {
          select: {
            id: true,
            slug: true,
            title: true,
            specialty: true,
          },
        },
        pinnedRevision: {
          select: {
            id: true,
            version: true,
            status: true,
            reviewedAt: true,
            sections: {
              orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
              select: {
                key: true,
                kind: true,
                title: true,
                body: true,
                periodLabel: true,
                startDay: true,
                endDay: true,
                sortOrder: true,
              },
            },
          },
        },
        overrides: {
          select: {
            sectionKey: true,
            title: true,
            body: true,
          },
        },
        additions: {
          select: {
            key: true,
            kind: true,
            title: true,
            body: true,
            periodLabel: true,
            startDay: true,
            endDay: true,
            sortOrder: true,
            insertAfterSectionKey: true,
          },
        },
      },
    },
  }
);

type PlacementRow = Prisma.PracticeGuidePlacementGetPayload<{
  select: typeof placementSelect;
}>;

export async function getPublishedPracticeGuide(input: {
  clinicSlug: string;
  publicSlug: string;
  now?: Date;
}): Promise<PublishedPracticeGuideDocument | null> {
  if (
    !isValidCareGuideSlug(input.clinicSlug) ||
    !isValidCareGuideSlug(input.publicSlug)
  ) {
    return null;
  }

  const tenant = await getClinicBySlug(input.clinicSlug);
  if (!tenant) {
    return null;
  }

  const placements = await getPrisma().practiceGuidePlacement.findMany({
    where: {
      publicSlug: input.publicSlug,
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
        ...PUBLIC_PRACTICE_GUIDE_WHERE,
      },
    },
    select: placementSelect,
  });

  if (placements.length !== 1) {
    return null;
  }

  const placement = placements[0];
  if (
    !placement ||
    placement.clinicId !== tenant.id ||
    placement.location.clinicId !== tenant.id ||
    placement.location.clinicSite.clinicId !== tenant.id ||
    placement.location.clinicSite.slug !== tenant.slug ||
    !placement.location.clinicSite.active ||
    placement.practiceGuide.clinicId !== tenant.id
  ) {
    return null;
  }

  const now = input.now ?? new Date();
  const guidesRemainPublic = await publishedPatientGuidesRemainPublic(
    tenant.id,
    now
  );
  if (
    !downgradeRetainedDirectUrlVisible({
      downgradeRetainedAt: placement.practiceGuide.downgradeRetainedAt,
      downgradeRetentionUntil: placement.practiceGuide.downgradeRetentionUntil,
      clinicGuidesRemainPublic: guidesRemainPublic,
      now,
    })
  ) {
    return null;
  }

  const resolved = resolvePlacementContent(placement as PlacementRow);
  if (!resolved) {
    return null;
  }

  return {
    clinic: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    },
    profile: tenant.profile,
    title: resolved.title,
    template: placement.practiceGuide.guideTemplate,
    practiceGuide: {
      id: placement.practiceGuide.id,
      publicSlug: placement.publicSlug,
      publishedAt: placement.practiceGuide.publishedAt,
    },
    revision: resolved.revision,
    sections: resolved.sections,
  };
}

function resolvePlacementContent(placement: PlacementRow): {
  title: string;
  sections: ComposedGuideSection[];
  revision: { id: string; version: number; reviewedAt: Date | null };
} | null {
  const guide = placement.practiceGuide;
  const fallbackTitle =
    guide.title.trim() || guide.guideTemplate?.title || "Aftercare guide";

  if (placement.publishedPracticeGuideRevisionId) {
    const pinned = placement.publishedPracticeGuideRevision;
    if (
      !pinned ||
      pinned.id !== placement.publishedPracticeGuideRevisionId ||
      pinned.practiceGuideId !== guide.id ||
      pinned.status !== GuideRevisionStatus.PUBLISHED ||
      pinned.version <= 0
    ) {
      return null;
    }

    return {
      title: pinned.title.trim() || fallbackTitle,
      sections: composedSectionsFromPracticeRevision(pinned.sections),
      revision: {
        id: pinned.id,
        version: pinned.version,
        reviewedAt: pinned.publishedAt,
      },
    };
  }

  if (
    !guide.pinnedRevision ||
    guide.pinnedRevision.status !== GuideRevisionStatus.PUBLISHED
  ) {
    return null;
  }

  return {
    title: fallbackTitle,
    sections: composeGuideDocument({
      canonicalSections: guide.pinnedRevision.sections,
      overrides: guide.overrides,
      additions: guide.additions,
    }).sections,
    revision: {
      id: guide.pinnedRevision.id,
      version: guide.pinnedRevision.version,
      reviewedAt: guide.pinnedRevision.reviewedAt,
    },
  };
}
