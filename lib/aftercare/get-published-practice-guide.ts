import "server-only";

import { GuideRevisionStatus } from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import {
  type ClinicBySlugRecord,
  clinicBySlugSelect,
} from "@/lib/aftercare/get-clinic-by-slug";
import { composedSectionsFromPracticeRevision } from "@/lib/aftercare/practice-revision-document";
import { PUBLIC_PRACTICE_GUIDE_WHERE } from "@/lib/aftercare/public-practice-guide-predicates";
import { downgradeRetainedDirectUrlVisible } from "@/lib/entitlements/downgrade-retention";
import { publishedPatientGuidesRemainPublic } from "@/lib/billing/public-guide-access";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import type { ComposedGuideSection } from "@/lib/aftercare/types";
import { getPrisma } from "@/lib/prisma";

/**
 * Public patient document. Serve the clinic's published snapshot only.
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

const publishedGuideInclude = {
  clinic: {
    select: clinicBySlugSelect,
  },
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
      reviewedAt: true,
      sections: {
        orderBy: [{ sortOrder: "asc" as const }, { key: "asc" as const }],
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
  contentRevisions: {
    where: {
      status: GuideRevisionStatus.PUBLISHED,
      version: { gt: 0 },
    },
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      id: true,
      version: true,
      title: true,
      publishedAt: true,
      sections: {
        orderBy: [{ sortOrder: "asc" as const }, { key: "asc" as const }],
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
};

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

  const practiceGuide = await getPrisma().practiceGuide.findFirst({
    where: {
      publicSlug: input.publicSlug,
      clinic: { slug: input.clinicSlug },
      ...PUBLIC_PRACTICE_GUIDE_WHERE,
    },
    include: publishedGuideInclude,
  });

  if (!practiceGuide) {
    return null;
  }

  const now = input.now ?? new Date();
  const guidesRemainPublic = await publishedPatientGuidesRemainPublic(
    practiceGuide.clinic.id,
    now
  );
  if (
    !downgradeRetainedDirectUrlVisible({
      downgradeRetainedAt: practiceGuide.downgradeRetainedAt,
      downgradeRetentionUntil: practiceGuide.downgradeRetentionUntil,
      clinicGuidesRemainPublic: guidesRemainPublic,
      now,
    })
  ) {
    return null;
  }

  const publishedRevision = practiceGuide.contentRevisions[0] ?? null;
  const title =
    publishedRevision?.title?.trim() ||
    practiceGuide.title.trim() ||
    practiceGuide.guideTemplate?.title ||
    "Aftercare guide";

  const sections = publishedRevision
    ? composedSectionsFromPracticeRevision(publishedRevision.sections)
    : practiceGuide.pinnedRevision
      ? composeGuideDocument({
          canonicalSections: practiceGuide.pinnedRevision.sections.map(
            (section) => ({
              key: section.key,
              kind: section.kind,
              title: section.title,
              body: section.body,
              periodLabel: section.periodLabel,
              startDay: section.startDay,
              endDay: section.endDay,
              sortOrder: section.sortOrder,
            })
          ),
          overrides: practiceGuide.overrides,
          additions: practiceGuide.additions.map((addition) => ({
            key: addition.key,
            kind: addition.kind,
            title: addition.title,
            body: addition.body,
            periodLabel: addition.periodLabel,
            startDay: addition.startDay,
            endDay: addition.endDay,
            sortOrder: addition.sortOrder,
            insertAfterSectionKey: addition.insertAfterSectionKey,
          })),
        }).sections
      : [];

  const revision = publishedRevision
    ? {
        id: publishedRevision.id,
        version: publishedRevision.version,
        reviewedAt: publishedRevision.publishedAt,
      }
    : practiceGuide.pinnedRevision
      ? {
          id: practiceGuide.pinnedRevision.id,
          version: practiceGuide.pinnedRevision.version,
          reviewedAt: practiceGuide.pinnedRevision.reviewedAt,
        }
      : {
          id: practiceGuide.id,
          version: 0,
          reviewedAt: practiceGuide.publishedAt,
        };

  return {
    clinic: {
      id: practiceGuide.clinic.id,
      slug: practiceGuide.clinic.slug,
      name: practiceGuide.clinic.name,
    },
    profile: practiceGuide.clinic.profile,
    title,
    template: practiceGuide.guideTemplate,
    practiceGuide: {
      id: practiceGuide.id,
      publicSlug: practiceGuide.publicSlug,
      publishedAt: practiceGuide.publishedAt,
    },
    revision,
    sections,
  };
}
