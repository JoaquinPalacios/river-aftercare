import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  PracticeSectionProvenance,
  type Prisma,
} from "@prisma/client";

import { homeCareInstructionSignature } from "@/lib/aftercare/home-care-instruction";
import type { ServiceCategory } from "@/lib/aftercare/service-category";
import { guideServiceMismatchMessage } from "@/lib/aftercare/service-compatibility";
import { mapHomeCareInstructions } from "@/lib/aftercare/revision-sections";
import { normalizePeriodLabel } from "@/lib/aftercare/period-label";
import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import {
  createPracticeRevisionSections,
  practiceRevisionSectionInclude,
} from "@/lib/aftercare/revision-sections";
import {
  normalizeDayRange,
  validateTimelineRanges,
} from "@/lib/aftercare/timeline-range";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { alignRootPlacementSlug } from "@/lib/clinic-portal/root-placement";
import { listAccountServiceCategories } from "@/lib/clinics/site-service-categories";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
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

async function changedOriginalCustomCategory(
  tx: Prisma.TransactionClient,
  guide: {
    id: string;
    clinicId: string;
    serviceCategory: ServiceCategory | null;
    guideTemplateId: string | null;
    sourceGuideTemplateId: string | null;
    copiedFromPracticeGuideId: string | null;
  },
  nextCategory: ServiceCategory | undefined
): Promise<ServiceCategory | undefined> {
  if (!nextCategory || nextCategory === guide.serviceCategory) {
    return undefined;
  }
  const originalCustom =
    guide.guideTemplateId === null &&
    guide.sourceGuideTemplateId === null &&
    guide.copiedFromPracticeGuideId === null;
  if (!originalCustom) {
    throw new ClinicPortalError(
      "This guide's service is fixed by its River template or location copy.",
      "conflict"
    );
  }
  const allowed = await listAccountServiceCategories(tx, guide.clinicId);
  if (!allowed.includes(nextCategory)) {
    throw new ClinicPortalError(
      allowed.length === 0
        ? "Configure a site service before changing this guide's service."
        : "Choose a service this account's sites provide.",
      "invalid"
    );
  }
  const placements = await tx.practiceGuidePlacement.findMany({
    where: { practiceGuideId: guide.id, clinicId: guide.clinicId },
    select: {
      location: {
        select: {
          name: true,
          clinicId: true,
          clinicSite: {
            select: {
              name: true,
              clinicId: true,
              serviceCategories: { select: { serviceCategory: true } },
            },
          },
        },
      },
    },
  });
  for (const placement of placements) {
    if (
      placement.location.clinicId !== guide.clinicId ||
      placement.location.clinicSite.clinicId !== guide.clinicId
    ) {
      throw new ClinicPortalError("Guide not found.", "not_found");
    }
    const message = guideServiceMismatchMessage({
      guideServiceCategory: nextCategory,
      siteServiceCategories:
        placement.location.clinicSite.serviceCategories.map(
          (row) => row.serviceCategory
        ),
      locationName: placement.location.name,
      siteName: placement.location.clinicSite.name,
    });
    if (message) {
      throw new ClinicPortalError(message, "conflict");
    }
  }
  return nextCategory;
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
          sections: practiceRevisionSectionInclude,
        },
      },
    },
  });

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  assertPracticeGuideWritable(guide);

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
        homeCareInstructions: mapHomeCareInstructions(
          section.homeCareInstructions
        ),
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
          homeCareInstructions: (section.homeCareInstructions ?? []).map(
            (item, itemIndex) => ({
              ...item,
              sortOrder: itemIndex + 1,
            })
          ),
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
    await lockClinicAccountStructure(tx, input.clinicId);
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
        include: {
          sections: {
            include: {
              homeCareInstructions: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
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

    await createPracticeRevisionSections(
      tx,
      draft.id,
      input.values.sections.map((section, index) => {
        const range = normalizeDayRange(section.startDay, section.endDay);
        const previous = previousByKey.get(section.key);
        const contentChanged =
          !previous ||
          previous.title !== section.title ||
          previous.body !== section.body ||
          previous.kind !== section.kind ||
          previous.periodLabel !== (section.periodLabel ?? null) ||
          previous.startDay !== range.startDay ||
          previous.endDay !== range.endDay ||
          homeCareInstructionSignature(
            mapHomeCareInstructions(previous.homeCareInstructions)
          ) !==
            homeCareInstructionSignature(section.homeCareInstructions ?? []);

        return {
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
          homeCareInstructions: (section.homeCareInstructions ?? []).map(
            (item, itemIndex) => ({
              ...item,
              sortOrder: itemIndex + 1,
            })
          ),
        };
      })
    );

    const serviceCategory = await changedOriginalCustomCategory(
      tx,
      guide,
      input.values.serviceCategory
    );

    await tx.practiceGuide.update({
      where: { id: guide.id },
      data: {
        title: input.values.title,
        publicSlug: input.values.publicSlug,
        ...(serviceCategory ? { serviceCategory } : {}),
      },
    });

    await alignRootPlacementSlug(tx, {
      clinicId: input.clinicId,
      practiceGuideId: guide.id,
      publicSlug: input.values.publicSlug,
    });

    return { id: guide.id };
  });
}
