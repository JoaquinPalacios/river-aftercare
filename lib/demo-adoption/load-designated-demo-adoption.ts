import "server-only";

import { GuideRevisionStatus } from "@prisma/client";

import { composeGuideDocument } from "@/lib/aftercare/compose-guide-document";
import { composedSectionsFromPracticeRevision } from "@/lib/aftercare/practice-revision-document";
import {
  mapHomeCareInstructions,
  practiceRevisionSectionInclude,
} from "@/lib/aftercare/revision-sections";
import type {
  CanonicalGuideSection,
  ComposedGuideSection,
} from "@/lib/aftercare/types";
import {
  demoCustomisationBlocker,
  sameComposedSections,
  sameText,
} from "@/lib/demo-adoption/composition";
import { designatedDemoForCategory } from "@/lib/demo-adoption/designated-demos";
import { getPrisma } from "@/lib/prisma";

export interface DesignatedDemoAdoptionView {
  clinicName: string;
  clinicSlug: string;
  publicSlug: string | null;
  pinnedRevisionId: string | null;
  pinnedRevisionVersion: number | null;
  publishedPracticeGuideRevisionId: string | null;
  publishedPracticeGuideRevisionVersion: number | null;
  latestPublishedRevisionId: string;
  latestPublishedRevisionVersion: number;
  alreadyCurrent: boolean;
  overrides: { sectionKey: string; title: string }[];
  additions: {
    key: string;
    title: string;
    insertAfterSectionKey: string | null;
  }[];
  blocker: string | null;
  proposedSections: ComposedGuideSection[];
  canUpdate: boolean;
}

const sectionInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
  },
};

/**
 * Read model for the operator confirmation. Null hides the action:
 * the template is not an active sample, it has no published revision,
 * or its service category has no designated demo.
 */
export async function loadDesignatedDemoAdoption(
  templateId: string
): Promise<DesignatedDemoAdoptionView | null> {
  const prisma = getPrisma();
  const template = await prisma.guideTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      title: true,
      serviceCategory: true,
      isSample: true,
      isActive: true,
      revisions: {
        where: { status: GuideRevisionStatus.PUBLISHED },
        orderBy: { version: "desc" },
        include: { sections: sectionInclude },
      },
    },
  });
  if (!template?.isSample || !template.isActive) {
    return null;
  }
  const latest = template.revisions[0];
  if (!latest) {
    return null;
  }
  const designation = designatedDemoForCategory(template.serviceCategory);
  if (!designation) {
    return null;
  }
  const clinic = await prisma.clinic.findUnique({
    where: { slug: designation.clinicSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!clinic) {
    return {
      clinicName: designation.clinicSlug,
      clinicSlug: designation.clinicSlug,
      publicSlug: null,
      pinnedRevisionId: null,
      pinnedRevisionVersion: null,
      publishedPracticeGuideRevisionId: null,
      publishedPracticeGuideRevisionVersion: null,
      latestPublishedRevisionId: latest.id,
      latestPublishedRevisionVersion: latest.version,
      alreadyCurrent: false,
      overrides: [],
      additions: [],
      blocker: "The designated demo clinic does not exist.",
      proposedSections: [],
      canUpdate: false,
    };
  }

  const linked = await prisma.practiceGuide.findMany({
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
      pinnedRevision: { select: { id: true, version: true, status: true } },
      contentRevisions: {
        include: { sections: practiceRevisionSectionInclude },
      },
      placements: {
        where: {
          location: {
            servesSiteRoot: true,
            active: true,
            clinicSite: { isPrimary: true, active: true },
          },
        },
        select: {
          publicSlug: true,
          publishedPracticeGuideRevisionId: true,
          publishedPracticeGuideRevision: {
            select: {
              id: true,
              version: true,
              title: true,
              introduction: true,
            },
          },
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

  const emptySections: ComposedGuideSection[] = [];
  const base = {
    clinicName: clinic.name,
    clinicSlug: clinic.slug,
    latestPublishedRevisionId: latest.id,
    latestPublishedRevisionVersion: latest.version,
  };

  if (designated.length !== 1) {
    const blocker =
      adapted.length > 0
        ? "This demo guide was adapted from the sample. Update live demo does not overwrite an adapted guide."
        : copies.length > 0
          ? "This demo guide is a location copy. Update live demo does not overwrite it."
          : designated.length > 1
            ? "This demo has more than one guide for this sample."
            : "This demo does not have a guide for this sample.";
    return {
      ...base,
      publicSlug: null,
      pinnedRevisionId: null,
      pinnedRevisionVersion: null,
      publishedPracticeGuideRevisionId: null,
      publishedPracticeGuideRevisionVersion: null,
      alreadyCurrent: false,
      overrides: [],
      additions: [],
      blocker,
      proposedSections: emptySections,
      canUpdate: false,
    };
  }

  const guide = designated[0];
  if (!guide) {
    return null;
  }
  const placement = guide.placements[0] ?? null;
  const canonicalSections: CanonicalGuideSection[] = latest.sections.map(
    (section) => ({
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
    })
  );
  const overrides = guide.overrides.map((override) => ({
    sectionKey: override.sectionKey,
    title: override.title,
    body: override.body,
  }));
  const additions = guide.additions.map((addition) => ({
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
  const proposedSections = composeGuideDocument({
    canonicalSections,
    overrides,
    additions,
  }).sections;
  const blocker =
    guide.downgradeRetainedAt !== null
      ? "This demo guide is retained and cannot be updated."
      : !guide.pinnedRevisionId || !guide.pinnedRevision
        ? "This demo guide is not pinned to the sample."
        : !placement
          ? "The designated demo placement could not be found."
          : guide.publicSlug !== designation.publicGuideSlug ||
              placement.publicSlug !== designation.publicGuideSlug
            ? "The designated demo guide is not published at its stable public address."
            : demoCustomisationBlocker({
                canonicalSectionKeys: new Set(
                  canonicalSections.map((section) => section.key)
                ),
                overrides,
                additions,
              });

  const published = placement?.publishedPracticeGuideRevision ?? null;
  const publishedRevision = published
    ? guide.contentRevisions.find((revision) => revision.id === published.id)
    : null;
  const draft = guide.contentRevisions.find(
    (revision) => revision.version === 0
  );
  const pinnedSections = guide.pinnedRevision
    ? template.revisions.find(
        (revision) => revision.id === guide.pinnedRevisionId
      )
    : null;
  let drifted = false;
  if (!blocker && pinnedSections && publishedRevision && draft) {
    const currentSections = composeGuideDocument({
      canonicalSections: pinnedSections.sections.map((section) => ({
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
      })),
      overrides,
      additions,
    }).sections;
    const snapshotSections = composedSectionsFromPracticeRevision(
      publishedRevision.sections
    );
    const draftSections = composedSectionsFromPracticeRevision(draft.sections);
    drifted =
      (!sameComposedSections(snapshotSections, currentSections) &&
        !sameComposedSections(snapshotSections, proposedSections)) ||
      (!sameComposedSections(draftSections, currentSections) &&
        !sameComposedSections(draftSections, proposedSections)) ||
      !sameText(draft.title, publishedRevision.title) ||
      !sameText(draft.introduction, publishedRevision.introduction) ||
      !sameText(publishedRevision.title, guide.title);
  }

  const driftBlocker = drifted
    ? "The demo has clinic changes that are not the recorded overrides. It was not updated."
    : null;
  const resolvedBlocker = blocker ?? driftBlocker;
  const alreadyCurrent = Boolean(
    !resolvedBlocker &&
    guide.pinnedRevisionId === latest.id &&
    publishedRevision &&
    draft &&
    sameComposedSections(
      composedSectionsFromPracticeRevision(publishedRevision.sections),
      proposedSections
    ) &&
    sameComposedSections(
      composedSectionsFromPracticeRevision(draft.sections),
      proposedSections
    )
  );

  return {
    ...base,
    publicSlug: placement?.publicSlug ?? guide.publicSlug,
    pinnedRevisionId: guide.pinnedRevisionId,
    pinnedRevisionVersion: guide.pinnedRevision?.version ?? null,
    publishedPracticeGuideRevisionId: published?.id ?? null,
    publishedPracticeGuideRevisionVersion: published?.version ?? null,
    alreadyCurrent,
    overrides: overrides.map((override) => ({
      sectionKey: override.sectionKey,
      title: override.title,
    })),
    additions: additions.map((addition) => ({
      key: addition.key,
      title: addition.title,
      insertAfterSectionKey: addition.insertAfterSectionKey,
    })),
    blocker: resolvedBlocker,
    proposedSections: resolvedBlocker ? emptySections : proposedSections,
    canUpdate: resolvedBlocker === null,
  };
}
