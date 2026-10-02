import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A later Riverside practice revision means an operator adopted a newer
 * sample. Reseeding must keep that snapshot, the canonical pin, and the
 * published placement. A database that only has the original publication
 * (or none) still receives the historical revision 1 bootstrap.
 */
export function riversidePracticeSeedPlan(
  publishedVersions: readonly number[]
): { preserveAdoptedRevisions: boolean } {
  return {
    preserveAdoptedRevisions: publishedVersions.some((version) => version > 1),
  };
}

export interface RiversideSeedSection {
  key: string;
  kind: Prisma.PracticeGuideRevisionSectionCreateWithoutRevisionInput["kind"];
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  provenance: Prisma.PracticeGuideRevisionSectionCreateWithoutRevisionInput["provenance"];
}

type SeedDb = Pick<
  PrismaClient,
  "practiceGuide" | "practiceGuideRevision" | "practiceGuidePlacement"
>;

export async function syncRiversidePracticePublication(
  prisma: SeedDb,
  input: {
    practiceGuideId: string;
    clinicId: string;
    locationId: string;
    seededPinnedRevisionId: string;
    seededPublishedRevisionId: string;
    seededDraftRevisionId: string;
    title: string;
    publicSlug: string;
    publishedAt: Date;
    sections: readonly RiversideSeedSection[];
  }
): Promise<{ preserved: boolean }> {
  const published = await prisma.practiceGuideRevision.findMany({
    where: {
      practiceGuideId: input.practiceGuideId,
      status: "PUBLISHED",
    },
    select: { version: true },
  });
  const { preserveAdoptedRevisions } = riversidePracticeSeedPlan(
    published.map((revision) => revision.version)
  );

  if (!preserveAdoptedRevisions) {
    await prisma.practiceGuide.update({
      where: { id: input.practiceGuideId },
      data: {
        pinnedRevisionId: input.seededPinnedRevisionId,
        publishedAt: input.publishedAt,
      },
    });
    await replaceOriginalRiversideSnapshots(prisma, input);
  }

  await prisma.practiceGuidePlacement.upsert({
    where: {
      locationId_practiceGuideId: {
        locationId: input.locationId,
        practiceGuideId: input.practiceGuideId,
      },
    },
    create: {
      id: `mpl_${input.practiceGuideId}`,
      practiceGuideId: input.practiceGuideId,
      locationId: input.locationId,
      clinicId: input.clinicId,
      publishedPracticeGuideRevisionId: input.seededPublishedRevisionId,
      publicSlug: input.publicSlug,
      isEnabled: true,
    },
    update: {
      clinicId: input.clinicId,
      publicSlug: input.publicSlug,
      isEnabled: true,
      ...(preserveAdoptedRevisions
        ? {}
        : {
            publishedPracticeGuideRevisionId: input.seededPublishedRevisionId,
          }),
    },
  });

  return { preserved: preserveAdoptedRevisions };
}

async function replaceOriginalRiversideSnapshots(
  prisma: SeedDb,
  input: {
    practiceGuideId: string;
    seededPublishedRevisionId: string;
    seededDraftRevisionId: string;
    title: string;
    publishedAt: Date;
    sections: readonly RiversideSeedSection[];
  }
): Promise<void> {
  await prisma.practiceGuideRevision.deleteMany({
    where: { practiceGuideId: input.practiceGuideId },
  });

  const sections = input.sections.map((section, index) => ({
    ...section,
    sortOrder: index + 1,
  }));

  await prisma.practiceGuideRevision.create({
    data: {
      id: input.seededDraftRevisionId,
      practiceGuideId: input.practiceGuideId,
      version: 0,
      status: "DRAFT",
      title: input.title,
      sections: { create: sections },
    },
  });

  await prisma.practiceGuideRevision.create({
    data: {
      id: input.seededPublishedRevisionId,
      practiceGuideId: input.practiceGuideId,
      version: 1,
      status: "PUBLISHED",
      title: input.title,
      publishedAt: input.publishedAt,
      sections: { create: sections },
    },
  });
}
