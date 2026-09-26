import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

export async function discardPracticeGuideDraftChanges(input: {
  clinicId: string;
  actorUserId: string;
  guideId: string;
}): Promise<{ id: string }> {
  const guide = await getPrisma().practiceGuide.findFirst({
    where: {
      id: input.guideId,
      clinicId: input.clinicId,
    },
    include: {
      contentRevisions: {
        include: {
          sections: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  assertPracticeGuideWritable(guide);

  if (guide.status !== PracticeGuideStatus.PUBLISHED) {
    throw new ClinicPortalError(
      "Discard draft changes is only available after a guide has been published.",
      "invalid"
    );
  }

  const published = guide.contentRevisions
    .filter(
      (revision) =>
        revision.status === GuideRevisionStatus.PUBLISHED &&
        revision.version > 0
    )
    .toSorted((left, right) => right.version - left.version)[0];
  const draft = guide.contentRevisions.find(
    (revision) => revision.version === WORKING_DRAFT_VERSION
  );

  if (!published || !draft) {
    throw new ClinicPortalError(
      "This guide does not have a published version to restore.",
      "conflict"
    );
  }

  const restoreAt = published.publishedAt ?? published.updatedAt;

  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    await tx.practiceGuideRevisionSection.deleteMany({
      where: { revisionId: draft.id },
    });

    if (published.sections.length > 0) {
      await tx.practiceGuideRevisionSection.createMany({
        data: published.sections.map((section, index) => ({
          revisionId: draft.id,
          key: section.key,
          kind: section.kind,
          title: section.title,
          body: section.body,
          periodLabel: section.periodLabel,
          startDay: section.startDay,
          endDay: section.endDay,
          sortOrder: index + 1,
          provenance: section.provenance,
        })),
      });
    }

    await tx.practiceGuideRevision.update({
      where: { id: draft.id },
      data: {
        title: published.title,
        introduction: published.introduction,
        createdByUserId: input.actorUserId,
        updatedAt: restoreAt,
      },
    });

    await tx.practiceGuide.update({
      where: { id: guide.id },
      data: {
        title: published.title,
      },
    });
  });

  return { id: guide.id };
}
