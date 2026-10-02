import "server-only";

import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  Prisma,
  type Prisma as PrismaTypes,
} from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import {
  composedSectionsFromPracticeRevision,
  practiceRevisionSectionsFromComposed,
  WORKING_DRAFT_VERSION,
} from "@/lib/aftercare/practice-revision-document";
import {
  createPracticeRevisionSections,
  mapHomeCareInstructions,
  practiceRevisionSectionInclude,
  type PracticeSectionWrite,
} from "@/lib/aftercare/revision-sections";
import type {
  CanonicalGuideSection,
  ComposedGuideSection,
  PracticeGuideAdditionInput,
  PracticeGuideOverrideInput,
} from "@/lib/aftercare/types";
import { advancePublishedPlacement } from "@/lib/clinic-portal/root-placement";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import {
  blankToNull,
  demoCustomisationBlocker,
  sameComposedSections,
  sameText,
} from "@/lib/demo-adoption/composition";
import { designatedDemoForCategory } from "@/lib/demo-adoption/designated-demos";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { getPrisma } from "@/lib/prisma";

const canonicalSectionInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
  },
} satisfies PrismaTypes.GuideTemplateSectionFindManyArgs;

export interface AdoptPublishedSampleInput {
  actorUserId: string;
  templateId: string;
  canonicalRevisionId: string;
  expectedPinnedRevisionId: string | null;
  expectedPublishedPracticeGuideRevisionId: string | null;
}

export interface AdoptPublishedSampleResult {
  status: "adopted" | "current";
  practiceGuideId: string;
  practiceRevisionId: string;
  practiceRevisionVersion: number;
  canonicalRevisionId: string;
  publicSlug: string;
}

/**
 * Adopts one published sample revision into the designated demo clinic.
 *
 * The transaction takes only the clinic account-structure lock. The
 * published canonical revision is immutable, so this does not acquire
 * `canonical-template`. Publishing a canonical revision does not call
 * this function.
 */
export async function adoptPublishedSampleForDesignatedDemo(
  input: AdoptPublishedSampleInput
): Promise<AdoptPublishedSampleResult> {
  const prisma = getPrisma();
  const template = await prisma.guideTemplate.findUnique({
    where: { id: input.templateId },
    select: {
      id: true,
      serviceCategory: true,
      isSample: true,
      isActive: true,
    },
  });
  if (!template) {
    throw new ClinicPortalError("Template not found.", "not_found");
  }
  assertSampleEligible(template);
  const designation = designatedDemoForCategory(template.serviceCategory);
  if (!designation) {
    throw new ClinicPortalError(
      "This service category does not have a designated demo.",
      "invalid"
    );
  }
  const clinic = await prisma.clinic.findUnique({
    where: { slug: designation.clinicSlug },
    select: { id: true, slug: true },
  });
  if (!clinic) {
    throw new ClinicPortalError(
      "The designated demo clinic does not exist.",
      "not_found"
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await lockClinicAccountStructure(tx, clinic.id);
      return adoptLockedDemo(tx, input, clinic.id);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ClinicPortalError(
        "The live demo changed while it was being updated. Review it again before updating.",
        "conflict"
      );
    }
    throw error;
  }
}

function assertSampleEligible(template: {
  isSample: boolean;
  isActive: boolean;
}): void {
  if (!template.isSample) {
    throw new ClinicPortalError(
      "A production template cannot update the live demo.",
      "invalid"
    );
  }
  if (!template.isActive) {
    throw new ClinicPortalError(
      "Only the active sample for this service category can update its designated demo.",
      "invalid"
    );
  }
}

async function adoptLockedDemo(
  tx: PrismaTypes.TransactionClient,
  input: AdoptPublishedSampleInput,
  clinicId: string
): Promise<AdoptPublishedSampleResult> {
  const actor = await tx.user.findUnique({
    where: { id: input.actorUserId },
    select: { platformRole: true },
  });
  if (actor?.platformRole !== "OPERATOR") {
    throw new ClinicPortalError(
      "You cannot update the live demo.",
      "forbidden"
    );
  }

  const template = await tx.guideTemplate.findUnique({
    where: { id: input.templateId },
    select: {
      id: true,
      title: true,
      serviceCategory: true,
      isSample: true,
      isActive: true,
    },
  });
  if (!template) {
    throw new ClinicPortalError("Template not found.", "not_found");
  }
  assertSampleEligible(template);
  const designation = designatedDemoForCategory(template.serviceCategory);
  const clinic = await tx.clinic.findFirst({
    where: { id: clinicId },
    select: { id: true, slug: true },
  });
  if (
    !clinic ||
    !designation ||
    clinic.slug !== designation.clinicSlug ||
    clinic.id !== clinicId
  ) {
    throw new ClinicPortalError(
      "This clinic is not an allowlisted demo for this sample.",
      "forbidden"
    );
  }

  const canonicalRevision = await tx.guideTemplateRevision.findFirst({
    where: {
      id: input.canonicalRevisionId,
      guideTemplateId: template.id,
    },
    include: { sections: canonicalSectionInclude },
  });
  if (!canonicalRevision) {
    throw new ClinicPortalError(
      "That published sample revision was not found.",
      "not_found"
    );
  }
  if (canonicalRevision.status !== GuideRevisionStatus.PUBLISHED) {
    throw new ClinicPortalError(
      "A canonical draft cannot be adopted. Publish the sample revision first.",
      "invalid"
    );
  }

  const linked = await tx.practiceGuide.findMany({
    where: {
      clinicId: clinic.id,
      OR: [
        { guideTemplateId: template.id },
        { sourceGuideTemplateId: template.id },
      ],
    },
    include: {
      overrides: { orderBy: { sectionKey: "asc" } },
      additions: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      contentRevisions: {
        include: { sections: practiceRevisionSectionInclude },
      },
      placements: {
        where: {
          clinicId: clinic.id,
          location: {
            servesSiteRoot: true,
            active: true,
            clinicId: clinic.id,
            clinicSite: {
              isPrimary: true,
              active: true,
              clinicId: clinic.id,
            },
          },
        },
        select: {
          id: true,
          publicSlug: true,
          isEnabled: true,
          publishedPracticeGuideRevisionId: true,
        },
      },
    },
  });

  const adapted = linked.filter(
    (guide) =>
      guide.sourceGuideTemplateId === template.id || guide.adaptedAt !== null
  );
  const copies = linked.filter(
    (guide) =>
      guide.guideTemplateId === template.id &&
      guide.copiedFromPracticeGuideId !== null
  );
  const designated = linked.filter(
    (guide) =>
      guide.guideTemplateId === template.id &&
      guide.adaptedAt === null &&
      guide.sourceGuideTemplateId === null &&
      guide.copiedFromPracticeGuideId === null
  );
  if (designated.length === 0 && adapted.length > 0) {
    throw new ClinicPortalError(
      "This demo guide was adapted from the sample. Update live demo does not overwrite an adapted guide.",
      "conflict"
    );
  }
  if (designated.length === 0 && copies.length > 0) {
    throw new ClinicPortalError(
      "This demo guide is a location copy. Update live demo does not overwrite it.",
      "conflict"
    );
  }
  if (designated.length !== 1) {
    throw new ClinicPortalError(
      designated.length === 0
        ? "This demo does not have a guide for this sample."
        : "This demo has more than one guide for this sample.",
      designated.length === 0 ? "not_found" : "conflict"
    );
  }

  const guide = designated[0];
  if (!guide) {
    throw new ClinicPortalError(
      "This demo does not have a guide for this sample.",
      "not_found"
    );
  }
  assertPracticeGuideWritable(guide);
  if (!guide.pinnedRevisionId) {
    throw new ClinicPortalError(
      "This demo guide is not pinned to the sample.",
      "conflict"
    );
  }
  if (guide.placements.length !== 1) {
    throw new ClinicPortalError(
      "The designated demo placement could not be found.",
      "not_found"
    );
  }
  const placement = guide.placements[0];
  if (!placement) {
    throw new ClinicPortalError(
      "The designated demo placement could not be found.",
      "not_found"
    );
  }

  const pinnedRevision = await tx.guideTemplateRevision.findFirst({
    where: {
      id: guide.pinnedRevisionId,
      guideTemplateId: template.id,
      status: GuideRevisionStatus.PUBLISHED,
    },
    include: { sections: canonicalSectionInclude },
  });
  if (!pinnedRevision) {
    throw new ClinicPortalError(
      "The demo pin does not match a published revision of this sample.",
      "conflict"
    );
  }

  const overrides = overridesFrom(guide.overrides);
  const additions = additionsFrom(guide.additions);
  const requestedSections = canonicalSectionsFrom(canonicalRevision.sections);
  const customisationBlocker = demoCustomisationBlocker({
    canonicalSectionKeys: new Set(
      requestedSections.map((section) => section.key)
    ),
    overrides,
    additions,
  });
  if (customisationBlocker) {
    throw new ClinicPortalError(customisationBlocker, "invalid");
  }

  const currentSections = composeGuideDocument({
    canonicalSections: canonicalSectionsFrom(pinnedRevision.sections),
    overrides,
    additions,
  }).sections;
  const targetSections = composeGuideDocument({
    canonicalSections: requestedSections,
    overrides,
    additions,
  }).sections;

  const draft =
    guide.contentRevisions.find(
      (revision) => revision.version === WORKING_DRAFT_VERSION
    ) ?? null;
  const snapshot = placement.publishedPracticeGuideRevisionId
    ? (guide.contentRevisions.find(
        (revision) => revision.id === placement.publishedPracticeGuideRevisionId
      ) ?? null)
    : null;
  if (placement.publishedPracticeGuideRevisionId && !snapshot) {
    throw new ClinicPortalError(
      "The published demo revision could not be found.",
      "not_found"
    );
  }
  if (
    snapshot &&
    (snapshot.status !== GuideRevisionStatus.PUBLISHED || snapshot.version < 1)
  ) {
    throw new ClinicPortalError(
      "The published demo revision could not be found.",
      "conflict"
    );
  }

  if (
    draft &&
    snapshot &&
    (!sameText(draft.title, snapshot.title) ||
      !sameText(draft.introduction, snapshot.introduction))
  ) {
    throw new ClinicPortalError(
      "The demo draft does not match the published snapshot. It was not updated.",
      "conflict"
    );
  }
  if (snapshot && !sameText(snapshot.title, guide.title)) {
    throw new ClinicPortalError(
      "The published demo title does not match the guide. It was not updated.",
      "conflict"
    );
  }

  const snapshotSections = snapshot
    ? composedSectionsFromPracticeRevision(snapshot.sections)
    : null;
  const draftSections = draft
    ? composedSectionsFromPracticeRevision(draft.sections)
    : null;
  if (
    snapshotSections &&
    !sameComposedSections(snapshotSections, currentSections) &&
    !sameComposedSections(snapshotSections, targetSections)
  ) {
    throw new ClinicPortalError(
      "The published demo has clinic changes that are not the recorded overrides. It was not updated.",
      "conflict"
    );
  }
  if (
    draftSections &&
    !sameComposedSections(draftSections, currentSections) &&
    !sameComposedSections(draftSections, targetSections)
  ) {
    throw new ClinicPortalError(
      "The demo draft has clinic changes that are not the recorded overrides. It was not updated.",
      "conflict"
    );
  }

  const introduction = snapshot?.introduction ?? draft?.introduction ?? null;
  const sectionWrites = practiceRevisionSectionsFromComposed(targetSections);
  const snapshotMatchesTarget = Boolean(
    snapshot &&
    snapshotSections &&
    sameComposedSections(snapshotSections, targetSections) &&
    sameText(snapshot.title, guide.title) &&
    sameText(blankToNull(snapshot.introduction), blankToNull(introduction))
  );
  const draftMatchesTarget =
    !draftSections || sameComposedSections(draftSections, targetSections);
  const draftMatchesCurrent =
    !draftSections || sameComposedSections(draftSections, currentSections);

  if (
    snapshot &&
    snapshotMatchesTarget &&
    (draftMatchesTarget || draftMatchesCurrent)
  ) {
    if (!draftMatchesTarget) {
      await writeWorkingDraft(tx, {
        practiceGuideId: guide.id,
        draftId: draft?.id ?? null,
        actorUserId: input.actorUserId,
        title: guide.title,
        introduction,
        sections: sectionWrites,
      });
    }
    if (guide.pinnedRevisionId !== canonicalRevision.id) {
      await tx.practiceGuide.update({
        where: { id: guide.id },
        data: { pinnedRevisionId: canonicalRevision.id },
      });
    }
    return {
      status: "current",
      practiceGuideId: guide.id,
      practiceRevisionId: snapshot.id,
      practiceRevisionVersion: snapshot.version,
      canonicalRevisionId: canonicalRevision.id,
      publicSlug: placement.publicSlug,
    };
  }

  if (
    input.expectedPinnedRevisionId !== guide.pinnedRevisionId ||
    input.expectedPublishedPracticeGuideRevisionId !==
      placement.publishedPracticeGuideRevisionId
  ) {
    throw new ClinicPortalError(
      "The live demo changed after this confirmation was opened. Review it again before updating.",
      "conflict"
    );
  }

  const publishedAt = new Date();
  const nextVersion =
    guide.contentRevisions.reduce(
      (max, revision) =>
        revision.status === GuideRevisionStatus.PUBLISHED
          ? Math.max(max, revision.version)
          : max,
      0
    ) + 1;

  const published = await tx.practiceGuideRevision.create({
    data: {
      practiceGuideId: guide.id,
      version: nextVersion,
      status: GuideRevisionStatus.PUBLISHED,
      title: guide.title,
      introduction,
      publishedAt,
      createdByUserId: input.actorUserId,
      sections: {
        create: sectionWrites.map((section) => ({
          key: section.key,
          kind: section.kind,
          title: section.title,
          body: section.body,
          periodLabel: section.periodLabel,
          startDay: section.startDay,
          endDay: section.endDay,
          sortOrder: section.sortOrder,
          provenance: section.provenance,
          homeCareInstructions: {
            create: (section.homeCareInstructions ?? []).map((item, index) => ({
              key: item.key,
              title: item.title,
              body: item.body,
              frequencyCount: item.frequencyCount,
              frequencyPeriod: item.frequencyPeriod,
              timingLabel: item.timingLabel,
              durationValue: item.durationValue,
              durationUnit: item.durationUnit,
              sortOrder: index + 1,
            })),
          },
        })),
      },
    },
  });

  await tx.practiceGuide.update({
    where: { id: guide.id },
    data: {
      pinnedRevisionId: canonicalRevision.id,
      status: PracticeGuideStatus.PUBLISHED,
      isEnabled: true,
      publishedAt,
    },
  });

  await writeWorkingDraft(tx, {
    practiceGuideId: guide.id,
    draftId: draft?.id ?? null,
    actorUserId: input.actorUserId,
    title: guide.title,
    introduction,
    sections: sectionWrites,
    updatedAt: publishedAt,
  });

  await advancePublishedPlacement(tx, {
    clinicId: clinic.id,
    practiceGuideId: guide.id,
    publicSlug: placement.publicSlug,
    publishedPracticeGuideRevisionId: published.id,
  });

  return {
    status: "adopted",
    practiceGuideId: guide.id,
    practiceRevisionId: published.id,
    practiceRevisionVersion: published.version,
    canonicalRevisionId: canonicalRevision.id,
    publicSlug: placement.publicSlug,
  };
}

async function writeWorkingDraft(
  tx: PrismaTypes.TransactionClient,
  input: {
    practiceGuideId: string;
    draftId: string | null;
    actorUserId: string;
    title: string;
    introduction: string | null;
    sections: PracticeSectionWrite[];
    updatedAt?: Date;
  }
): Promise<void> {
  if (input.draftId) {
    await tx.practiceGuideRevisionSection.deleteMany({
      where: { revisionId: input.draftId },
    });
    await createPracticeRevisionSections(tx, input.draftId, input.sections);
    await tx.practiceGuideRevision.update({
      where: { id: input.draftId },
      data: {
        title: input.title,
        introduction: input.introduction,
        updatedAt: input.updatedAt ?? new Date(),
      },
    });
    return;
  }

  await tx.practiceGuideRevision.create({
    data: {
      practiceGuideId: input.practiceGuideId,
      version: WORKING_DRAFT_VERSION,
      status: GuideRevisionStatus.DRAFT,
      title: input.title,
      introduction: input.introduction,
      createdByUserId: input.actorUserId,
      sections: {
        create: input.sections.map((section) => ({
          key: section.key,
          kind: section.kind,
          title: section.title,
          body: section.body,
          periodLabel: section.periodLabel,
          startDay: section.startDay,
          endDay: section.endDay,
          sortOrder: section.sortOrder,
          provenance: section.provenance,
          homeCareInstructions: {
            create: (section.homeCareInstructions ?? []).map((item, index) => ({
              key: item.key,
              title: item.title,
              body: item.body,
              frequencyCount: item.frequencyCount,
              frequencyPeriod: item.frequencyPeriod,
              timingLabel: item.timingLabel,
              durationValue: item.durationValue,
              durationUnit: item.durationUnit,
              sortOrder: index + 1,
            })),
          },
        })),
      },
    },
  });
}

function canonicalSectionsFrom(
  sections: readonly {
    key: string;
    kind: CanonicalGuideSection["kind"];
    title: string;
    body: string;
    periodLabel: string | null;
    startDay: number | null;
    endDay: number | null;
    sortOrder: number;
    homeCareInstructions?: Parameters<typeof mapHomeCareInstructions>[0];
  }[]
): CanonicalGuideSection[] {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    homeCareInstructions: mapHomeCareInstructions(section.homeCareInstructions),
  }));
}

function overridesFrom(
  overrides: readonly { sectionKey: string; title: string; body: string }[]
): PracticeGuideOverrideInput[] {
  return overrides.map((override) => ({
    sectionKey: override.sectionKey,
    title: override.title,
    body: override.body,
  }));
}

function additionsFrom(
  additions: readonly {
    key: string;
    kind: PracticeGuideAdditionInput["kind"];
    title: string;
    body: string;
    periodLabel: string | null;
    startDay: number | null;
    endDay: number | null;
    sortOrder: number;
    insertAfterSectionKey: string | null;
  }[]
): PracticeGuideAdditionInput[] {
  return additions.map((addition) => ({
    key: addition.key,
    kind: addition.kind,
    title: addition.title,
    body: addition.body,
    periodLabel: addition.periodLabel,
    startDay: addition.startDay,
    endDay: addition.endDay,
    sortOrder: addition.sortOrder,
    insertAfterSectionKey: addition.insertAfterSectionKey,
    homeCareInstructions: [],
  }));
}

export function proposedSectionsForDemo(input: {
  canonicalSections: CanonicalGuideSection[];
  overrides: PracticeGuideOverrideInput[];
  additions: PracticeGuideAdditionInput[];
}): ComposedGuideSection[] {
  return composeGuideDocument(input).sections;
}
