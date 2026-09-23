import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import {
  composedSectionsFromPracticeRevision,
  practiceRevisionSectionsFromComposed,
  WORKING_DRAFT_VERSION,
} from "@/lib/aftercare/practice-revision-document";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  clinicGuideLifecycleStatus,
  clinicGuideStatusLabel,
  type ClinicGuideLifecycleStatus,
} from "@/lib/clinic-portal/guide-status";
import { clinicActorLabel } from "@/lib/clinic-portal/practice-review-attestation";
import type { ComposedGuideSection } from "@/lib/aftercare/types";
import { getPrisma } from "@/lib/prisma";

export interface PracticeGuideEditorRecord {
  id: string;
  clinicId: string;
  title: string;
  publicSlug: string;
  introduction: string | null;
  status: PracticeGuideStatus;
  isEnabled: boolean;
  isPublished: boolean;
  hasDraftChanges: boolean;
  lifecycle: ClinicGuideLifecycleStatus;
  statusLabel: string;
  template: {
    id: string;
    slug: string;
    title: string;
  } | null;
  /** Clinic-owned copy of a River template. Not an original custom guide. */
  adaptedFromTemplate: boolean;
  reviewAttestation: {
    confirmedAt: Date;
    confirmedByLabel: string;
  } | null;
  sections: ComposedGuideSection[];
  updatedAt: Date;
}

async function snapshotLegacyComposition(guideId: string) {
  const guide = await getPrisma().practiceGuide.findUnique({
    where: { id: guideId },
    include: {
      pinnedRevision: {
        include: {
          sections: {
            orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
          },
        },
      },
      overrides: true,
      additions: true,
    },
  });

  if (!guide) {
    return;
  }

  const composed = composeGuideDocument({
    canonicalSections: (guide.pinnedRevision?.sections ?? []).map(
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
    overrides: guide.overrides,
    additions: guide.additions.map((addition) => ({
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
  });
  const sections = practiceRevisionSectionsFromComposed(composed.sections);

  await getPrisma().$transaction(async (tx) => {
    const existing = await tx.practiceGuideRevision.findMany({
      where: { practiceGuideId: guide.id },
      select: { version: true },
    });
    if (existing.length > 0) {
      return;
    }

    await tx.practiceGuideRevision.create({
      data: {
        practiceGuideId: guide.id,
        version: WORKING_DRAFT_VERSION,
        status: GuideRevisionStatus.DRAFT,
        title: guide.title,
        sections: { create: sections },
      },
    });

    if (guide.status === PracticeGuideStatus.PUBLISHED) {
      await tx.practiceGuideRevision.create({
        data: {
          practiceGuideId: guide.id,
          version: 1,
          status: GuideRevisionStatus.PUBLISHED,
          title: guide.title,
          publishedAt: guide.publishedAt ?? guide.updatedAt,
          sections: { create: sections },
        },
      });
    }
  });
}

export async function loadPracticeGuideEditor(input: {
  clinicId: string;
  guideId: string;
}): Promise<PracticeGuideEditorRecord> {
  let guide = await getPrisma().practiceGuide.findFirst({
    where: {
      id: input.guideId,
      clinicId: input.clinicId,
    },
    include: {
      guideTemplate: {
        select: { id: true, slug: true, title: true },
      },
      contentRevisions: {
        include: {
          sections: { orderBy: { sortOrder: "asc" } },
          reviewAttestedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  if (guide.contentRevisions.length === 0) {
    await snapshotLegacyComposition(guide.id);
    guide = await getPrisma().practiceGuide.findFirst({
      where: { id: guide.id, clinicId: input.clinicId },
      include: {
        guideTemplate: {
          select: { id: true, slug: true, title: true },
        },
        contentRevisions: {
          include: {
            sections: { orderBy: { sortOrder: "asc" } },
            reviewAttestedBy: { select: { name: true } },
          },
        },
      },
    });
  }

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  const draft = guide.contentRevisions.find(
    (revision) => revision.version === WORKING_DRAFT_VERSION
  );
  const published = guide.contentRevisions
    .filter(
      (revision) =>
        revision.status === GuideRevisionStatus.PUBLISHED &&
        revision.version > 0
    )
    .toSorted((left, right) => right.version - left.version)[0];

  if (!draft) {
    throw new ClinicPortalError("Guide draft is missing.", "conflict");
  }

  const lifecycle = clinicGuideLifecycleStatus({
    status: guide.status,
    isEnabled: guide.isEnabled,
    publishedRevisionStatus: published?.status ?? null,
    draftUpdatedAt: draft.updatedAt,
    publishedAt: published?.publishedAt ?? guide.publishedAt,
  });

  return {
    id: guide.id,
    clinicId: guide.clinicId,
    title: draft.title || guide.title,
    publicSlug: guide.publicSlug,
    introduction: draft.introduction,
    status: guide.status,
    isEnabled: guide.isEnabled,
    isPublished: guide.status === PracticeGuideStatus.PUBLISHED,
    hasDraftChanges: lifecycle === "published_draft_changes",
    lifecycle,
    statusLabel: clinicGuideStatusLabel(lifecycle),
    template: guide.guideTemplate,
    adaptedFromTemplate: guide.sourceGuideTemplateId !== null,
    reviewAttestation:
      published?.reviewAttestedAt && published.reviewAttestedByUserId
        ? {
            confirmedAt: published.reviewAttestedAt,
            confirmedByLabel: clinicActorLabel(
              published.reviewAttestedBy?.name
            ),
          }
        : null,
    sections: composedSectionsFromPracticeRevision(draft.sections),
    updatedAt: draft.updatedAt,
  };
}
