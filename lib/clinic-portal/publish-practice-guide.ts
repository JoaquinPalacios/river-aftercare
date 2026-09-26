import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import { actorCanManageClinic } from "@/lib/auth/clinic-authorization";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import {
  isPracticeReviewAttested,
  PRACTICE_REVIEW_ATTESTATION_REQUIRED_MESSAGE,
} from "@/lib/clinic-portal/practice-review-attestation";
import { advancePublishedPlacement } from "@/lib/clinic-portal/root-placement";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

export async function publishPracticeGuide(input: {
  clinicId: string;
  actorUserId: string;
  guideId: string;
  reviewAttested?: boolean | string | null;
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
          include: { sections: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    prisma.clinic.findUnique({
      where: { id: input.clinicId },
      select: {
        slug: true,
      },
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

  const demoTenant = isDemoTenant(clinic.slug);
  const attested = isPracticeReviewAttested(input.reviewAttested);
  if (!demoTenant && !attested) {
    throw new ClinicPortalError(
      PRACTICE_REVIEW_ATTESTATION_REQUIRED_MESSAGE,
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
  const reviewAttestedAt = demoTenant || !attested ? null : publishedAt;
  const reviewAttestedByUserId =
    demoTenant || !attested ? null : input.actorUserId;

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
        reviewAttestedAt,
        reviewAttestedByUserId,
        sections: {
          create: draft.sections.map((section) => ({
            key: section.key,
            kind: section.kind,
            title: section.title,
            body: section.body,
            periodLabel: section.periodLabel,
            startDay: section.startDay,
            endDay: section.endDay,
            sortOrder: section.sortOrder,
            provenance: section.provenance,
          })),
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
