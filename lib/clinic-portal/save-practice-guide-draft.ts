import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  PracticeSectionProvenance,
} from "@prisma/client";

import { normalizePeriodLabel } from "@/lib/aftercare/period-label";
import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import {
  normalizeDayRange,
  validateTimelineRanges,
} from "@/lib/aftercare/timeline-range";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import type { SaveGuideDraftInput } from "@/lib/clinic-portal/guide-schemas";
import { suppliedTemplateContentChanged } from "@/lib/entitlements/guide-content";
import { governedTemplateEditBlock } from "@/lib/entitlements/guide-usage";
import { ENTITLEMENT_CODES } from "@/lib/entitlements/messages";
import { readPlanGovernance } from "@/lib/entitlements/team-usage";
import { getPrisma } from "@/lib/prisma";

function provenanceForSection(input: {
  previous: PracticeSectionProvenance | undefined;
  kindChanged: boolean;
  contentChanged: boolean;
  isCustomGuide: boolean;
}): PracticeSectionProvenance {
  if (input.isCustomGuide) {
    return PracticeSectionProvenance.PRACTICE_CUSTOM;
  }

  if (
    !input.previous ||
    input.previous === PracticeSectionProvenance.CANONICAL
  ) {
    return input.contentChanged
      ? PracticeSectionProvenance.PRACTICE_OVERRIDE
      : PracticeSectionProvenance.CANONICAL;
  }

  return input.previous;
}

export async function savePracticeGuideDraft(input: {
  clinicId: string;
  actorUserId: string;
  values: SaveGuideDraftInput;
}): Promise<{ id: string }> {
  const guide = await getPrisma().practiceGuide.findFirst({
    where: {
      id: input.values.guideId,
      clinicId: input.clinicId,
    },
    include: {
      contentRevisions: {
        where: { version: WORKING_DRAFT_VERSION },
        take: 1,
        include: {
          sections: true,
        },
      },
    },
  });

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  if (
    guide.status === PracticeGuideStatus.PUBLISHED &&
    guide.publicSlug !== input.values.publicSlug
  ) {
    throw new ClinicPortalError(
      "The public URL of a published guide is protected. Keep the current slug or create a new guide.",
      "slug_published"
    );
  }

  const slugTaken = await getPrisma().practiceGuide.findFirst({
    where: {
      clinicId: input.clinicId,
      publicSlug: input.values.publicSlug,
      NOT: { id: guide.id },
    },
    select: { id: true },
  });
  if (slugTaken) {
    throw new ClinicPortalError(
      "That public slug is already used by another guide in this practice.",
      "conflict"
    );
  }

  const timelineStages = input.values.sections
    .filter((section) => section.kind === "RECOVERY_TIMELINE")
    .map((section) => ({
      key: section.key,
      periodLabel: section.periodLabel,
      ...normalizeDayRange(section.startDay, section.endDay),
    }));
  const timelineIssues = validateTimelineRanges(timelineStages);
  if (timelineIssues.length > 0) {
    throw new ClinicPortalError(timelineIssues[0].message, "invalid");
  }

  const keys = input.values.sections.map((section) => section.key);
  if (new Set(keys).size !== keys.length) {
    throw new ClinicPortalError("Section keys must be unique.", "invalid");
  }

  let draft = guide.contentRevisions[0];

  if (guide.guideTemplateId) {
    const governance = await readPlanGovernance(input.clinicId);
    const currentSections = (draft?.sections ?? [])
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        key: section.key,
        kind: section.kind,
        title: section.title,
        body: section.body,
        periodLabel: section.periodLabel,
        startDay: section.startDay,
        endDay: section.endDay,
        sortOrder: section.sortOrder,
      }));
    const block = governedTemplateEditBlock({
      governance,
      templateBacked: true,
      contentChanged: suppliedTemplateContentChanged({
        currentTitle: draft?.title ?? guide.title,
        nextTitle: input.values.title,
        currentIntroduction: draft?.introduction ?? null,
        nextIntroduction: input.values.introduction ?? "",
        currentSections,
        nextSections: input.values.sections.map((section, index) => ({
          key: section.key,
          kind: section.kind,
          title: section.title,
          body: section.body,
          periodLabel: section.periodLabel ?? null,
          startDay: section.startDay ?? null,
          endDay: section.endDay ?? null,
          sortOrder: index + 1,
        })),
      }),
    });
    if (block) {
      throw new ClinicPortalError(
        block.error,
        block.code === ENTITLEMENT_CODES.TEMPLATE_ADAPTATION_REQUIRED
          ? "template_adaptation_required"
          : "template_adaptation_unavailable"
      );
    }
  }

  const previousByKey = new Map(
    (draft?.sections ?? []).map((section) => [section.key, section])
  );

  return getPrisma().$transaction(async (tx) => {
    if (!draft) {
      draft = await tx.practiceGuideRevision.create({
        data: {
          practiceGuideId: guide.id,
          version: WORKING_DRAFT_VERSION,
          status: GuideRevisionStatus.DRAFT,
          title: input.values.title,
          introduction: input.values.introduction,
          createdByUserId: input.actorUserId,
        },
        include: { sections: true },
      });
    } else if (draft.status !== GuideRevisionStatus.DRAFT) {
      throw new ClinicPortalError(
        "The working draft cannot be replaced.",
        "conflict"
      );
    } else {
      await tx.practiceGuideRevision.update({
        where: { id: draft.id },
        data: {
          title: input.values.title,
          introduction: input.values.introduction,
          createdByUserId: input.actorUserId,
        },
      });
    }

    await tx.practiceGuideRevisionSection.deleteMany({
      where: { revisionId: draft.id },
    });

    if (input.values.sections.length > 0) {
      await tx.practiceGuideRevisionSection.createMany({
        data: input.values.sections.map((section, index) => {
          const range = normalizeDayRange(section.startDay, section.endDay);
          const previous = previousByKey.get(section.key);
          const contentChanged =
            !previous ||
            previous.title !== section.title ||
            previous.body !== section.body ||
            previous.kind !== section.kind ||
            previous.periodLabel !== (section.periodLabel ?? null) ||
            previous.startDay !== range.startDay ||
            previous.endDay !== range.endDay;

          return {
            revisionId: draft.id,
            key: section.key,
            kind: section.kind,
            title: section.title,
            body: section.body,
            periodLabel: normalizePeriodLabel(section.periodLabel),
            startDay: range.startDay,
            endDay: range.endDay,
            sortOrder: index + 1,
            provenance: provenanceForSection({
              previous: previous?.provenance,
              kindChanged: previous ? previous.kind !== section.kind : true,
              contentChanged,
              isCustomGuide: !guide.guideTemplateId,
            }),
          };
        }),
      });
    }

    await tx.practiceGuide.update({
      where: { id: guide.id },
      data: {
        title: input.values.title,
        publicSlug: input.values.publicSlug,
      },
    });

    return { id: guide.id };
  });
}
