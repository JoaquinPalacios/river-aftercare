import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import {
  mapHomeCareInstructions,
  practiceRevisionSectionInclude,
  practiceSectionCreateData,
} from "@/lib/aftercare/revision-sections";
import { actorCanManageClinic } from "@/lib/auth/clinic-authorization";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import { advancePublishedPlacement } from "@/lib/clinic-portal/root-placement";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

export async function publishPracticeGuide(input: {
  clinicId: string;
  actorUserId: string;
  guideId: string;
}): Promise<{ id: string; version: number }> {
  const prisma = getPrisma();
  const [guide, clinic, canManage] = await Promise.all([
    prisma.practiceGuide.findFirst({
      where: {
        id: input.guideId,
        clinicId: input.clinicId,
      },
      include: {
        contentRevisions: {
          include: { sections: practiceRevisionSectionInclude },
        },
      },
    }),
    prisma.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true },
    }),
    actorCanManageClinic({
      actorUserId: input.actorUserId,
      clinicId: input.clinicId,
    }),
  ]);

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  assertPracticeGuideWritable(guide);

  if (!clinic || !canManage) {
    throw new ClinicPortalError("You cannot publish this guide.", "forbidden");
  }

  const draft = guide.contentRevisions.find(
    (revision) => revision.version === WORKING_DRAFT_VERSION
  );
  if (!draft || draft.sections.length === 0) {
    throw new ClinicPortalError(
      "Save a draft with at least one section before publishing.",
      "invalid"
    );
  }

  const latestPublishedVersion = guide.contentRevisions.reduce(
    (max, revision) =>
      revision.status === GuideRevisionStatus.PUBLISHED
        ? Math.max(max, revision.version)
        : max,
    0
  );
  const nextVersion = latestPublishedVersion + 1;
  const publishedAt = new Date();

  return prisma.$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const published = await tx.practiceGuideRevision.create({
      data: {
        practiceGuideId: guide.id,
        version: nextVersion,
        status: GuideRevisionStatus.PUBLISHED,
        title: draft.title,
        introduction: draft.introduction,
        publishedAt,
        createdByUserId: input.actorUserId,
        sections: {
          create: draft.sections.map((section) =>
            practiceSectionCreateData({
              key: section.key,
              kind: section.kind,
              title: section.title,
              body: section.body,
              periodLabel: section.periodLabel,
              startDay: section.startDay,
              endDay: section.endDay,
              sortOrder: section.sortOrder,
              provenance: section.provenance,
              homeCareInstructions: mapHomeCareInstructions(
                section.homeCareInstructions
              ),
            })
          ),
        },
      },
    });

    await tx.practiceGuideRevision.update({
      where: { id: draft.id },
      data: {
        updatedAt: publishedAt,
      },
    });

    await tx.practiceGuide.update({
      where: { id: guide.id },
      data: {
        title: draft.title,
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt,
      },
    });

    await advancePublishedPlacement(tx, {
      clinicId: input.clinicId,
      practiceGuideId: guide.id,
      publicSlug: guide.publicSlug,
      publishedPracticeGuideRevisionId: published.id,
    });

    return { id: guide.id, version: published.version };
  });
}
