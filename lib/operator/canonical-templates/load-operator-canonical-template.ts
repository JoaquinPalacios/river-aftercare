import "server-only";

import { GuideRevisionStatus, type ServiceCategory } from "@prisma/client";

import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import type { CanonicalContentSection } from "@/lib/canonical-templates/content";
import type { CanonicalEditorSection } from "@/lib/aftercare/canonical-editor-content";
import { hasCompleteCanonicalReviewEvidence } from "@/lib/aftercare/guide-template-review";
import { serviceCategoryLabel } from "@/lib/aftercare/service-category";
import type { GuideSectionKind } from "@/lib/aftercare/types";
import { getPrisma } from "@/lib/prisma";

const userSelect = { select: { name: true, email: true } } as const;

function personLabel(
  user: { name: string | null; email: string } | null
): string | null {
  if (!user) {
    return null;
  }
  return user.name?.trim() || user.email;
}

export function formatOperatorTimestamp(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

interface StoredSection {
  key: string;
  kind: GuideSectionKind;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
  homeCareInstructions: Array<{
    key: string;
    title: string;
    body: string | null;
    frequencyCount: number | null;
    frequencyPeriod: CanonicalContentSection["homeCareInstructions"][number]["frequencyPeriod"];
    timingLabel: string | null;
    durationValue: number | null;
    durationUnit: CanonicalContentSection["homeCareInstructions"][number]["durationUnit"];
    sortOrder: number;
  }>;
}

export function storedSectionsToEditor(
  sections: readonly StoredSection[]
): CanonicalEditorSection[] {
  return [...sections]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.body,
      periodLabel: section.periodLabel ?? "",
      startDay: section.startDay === null ? "" : String(section.startDay),
      endDay: section.endDay === null ? "" : String(section.endDay),
      homeCareInstructions: [...section.homeCareInstructions]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
          key: item.key,
          title: item.title,
          body: item.body ?? "",
          frequencyCount:
            item.frequencyCount === null ? "" : String(item.frequencyCount),
          frequencyPeriod: item.frequencyPeriod ?? "",
          timingLabel: item.timingLabel ?? "",
          durationValue:
            item.durationValue === null ? "" : String(item.durationValue),
          durationUnit: item.durationUnit ?? "",
        })),
    }));
}

function contentSignature(sections: readonly StoredSection[]): string {
  const content: CanonicalContentSection[] = [...sections]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => ({
      key: section.key,
      kind: section.kind,
      title: section.title,
      body: section.body,
      periodLabel: section.periodLabel,
      startDay: section.startDay,
      endDay: section.endDay,
      sortOrder: section.sortOrder,
      homeCareInstructions: [...section.homeCareInstructions]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
          key: item.key,
          title: item.title,
          body: item.body,
          frequencyCount: item.frequencyCount,
          frequencyPeriod: item.frequencyPeriod,
          timingLabel: item.timingLabel,
          durationValue: item.durationValue,
          durationUnit: item.durationUnit,
          sortOrder: item.sortOrder,
        })),
    }));
  return canonicalContentSignature(content);
}

const sectionInclude = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
  },
};

export interface OperatorTemplateRevisionView {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED";
  createdAtLabel: string;
  createdByLabel: string | null;
  reviewed: boolean;
  reviewerName: string | null;
  reviewerCredential: string | null;
  reviewNote: string | null;
  reviewedAtLabel: string | null;
  recordedByLabel: string | null;
  publishedAtLabel: string | null;
  publisherLabel: string | null;
  sectionCount: number;
  sections: CanonicalEditorSection[];
  isLatestPublished: boolean;
}

export interface OperatorTemplateDetail {
  id: string;
  title: string;
  slug: string;
  serviceCategory: ServiceCategory;
  serviceCategoryLabel: string;
  isActive: boolean;
  isSample: boolean;
  metadataLocked: boolean;
  deactivatedAtLabel: string | null;
  deactivatedByLabel: string | null;
  latestPublishedVersion: number | null;
  openDraft: {
    id: string;
    version: number;
    reviewed: boolean;
    reviewerName: string | null;
    reviewerCredential: string | null;
    reviewNote: string | null;
    reviewedAtLabel: string | null;
    recordedByLabel: string | null;
    savedContentSignature: string;
    sections: CanonicalEditorSection[];
  } | null;
  revisions: OperatorTemplateRevisionView[];
}

export async function loadOperatorCanonicalTemplate(
  templateId: string
): Promise<OperatorTemplateDetail | null> {
  const template = await getPrisma().guideTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      title: true,
      slug: true,
      serviceCategory: true,
      isActive: true,
      isSample: true,
      deactivatedAt: true,
      deactivatedBy: userSelect,
      revisions: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          createdAt: true,
          createdBy: userSelect,
          reviewerName: true,
          reviewerCredential: true,
          reviewNote: true,
          reviewedAt: true,
          reviewRecordedByUserId: true,
          reviewRecordedBy: userSelect,
          publishedAt: true,
          publishedBy: userSelect,
          sections: sectionInclude,
        },
      },
    },
  });
  if (!template) {
    return null;
  }

  const latestPublished = template.revisions.find(
    (revision) => revision.status === GuideRevisionStatus.PUBLISHED
  );
  const draft = template.revisions.find(
    (revision) => revision.status === GuideRevisionStatus.DRAFT
  );

  return {
    id: template.id,
    title: template.title,
    slug: template.slug,
    serviceCategory: template.serviceCategory,
    serviceCategoryLabel:
      serviceCategoryLabel(template.serviceCategory) ??
      template.serviceCategory,
    isActive: template.isActive,
    isSample: template.isSample,
    metadataLocked: latestPublished != null,
    deactivatedAtLabel: formatOperatorTimestamp(template.deactivatedAt),
    deactivatedByLabel: personLabel(template.deactivatedBy),
    latestPublishedVersion: latestPublished?.version ?? null,
    openDraft: draft
      ? {
          id: draft.id,
          version: draft.version,
          reviewed: hasCompleteCanonicalReviewEvidence(draft),
          reviewerName: draft.reviewerName,
          reviewerCredential: draft.reviewerCredential,
          reviewNote: draft.reviewNote,
          reviewedAtLabel: formatOperatorTimestamp(draft.reviewedAt),
          recordedByLabel: personLabel(draft.reviewRecordedBy),
          savedContentSignature: contentSignature(draft.sections),
          sections: storedSectionsToEditor(draft.sections),
        }
      : null,
    revisions: template.revisions.map((revision) => ({
      id: revision.id,
      version: revision.version,
      status: revision.status,
      createdAtLabel: formatOperatorTimestamp(revision.createdAt) ?? "",
      createdByLabel: personLabel(revision.createdBy),
      reviewed: hasCompleteCanonicalReviewEvidence(revision),
      reviewerName: revision.reviewerName,
      reviewerCredential: revision.reviewerCredential,
      reviewNote: revision.reviewNote,
      reviewedAtLabel: formatOperatorTimestamp(revision.reviewedAt),
      recordedByLabel: personLabel(revision.reviewRecordedBy),
      publishedAtLabel: formatOperatorTimestamp(revision.publishedAt),
      publisherLabel: personLabel(revision.publishedBy),
      sectionCount: revision.sections.length,
      sections: storedSectionsToEditor(revision.sections),
      isLatestPublished: latestPublished?.id === revision.id,
    })),
  };
}
