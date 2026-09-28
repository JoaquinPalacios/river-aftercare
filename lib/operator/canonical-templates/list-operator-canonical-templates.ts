import "server-only";

import { GuideRevisionStatus, type ServiceCategory } from "@prisma/client";

import { hasCompleteCanonicalReviewEvidence } from "@/lib/aftercare/guide-template-review";
import { serviceCategoryLabel } from "@/lib/aftercare/service-category";
import { getPrisma } from "@/lib/prisma";

export interface OperatorTemplateListItem {
  id: string;
  title: string;
  slug: string;
  serviceCategory: ServiceCategory;
  serviceCategoryLabel: string;
  isActive: boolean;
  isSample: boolean;
  latestPublishedVersion: number | null;
  draft: { version: number; reviewed: boolean } | null;
}

export interface OperatorTemplateListFilters {
  serviceCategory?: string;
  activity?: string;
  publication?: string;
}

export async function listOperatorCanonicalTemplates(): Promise<
  OperatorTemplateListItem[]
> {
  const templates = await getPrisma().guideTemplate.findMany({
    orderBy: [{ serviceCategory: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      serviceCategory: true,
      isActive: true,
      isSample: true,
      revisions: {
        orderBy: { version: "desc" },
        select: {
          version: true,
          status: true,
          reviewerName: true,
          reviewedAt: true,
          reviewRecordedByUserId: true,
        },
      },
    },
  });

  return templates.map((template) => {
    const published = template.revisions.find(
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
      latestPublishedVersion: published?.version ?? null,
      draft: draft
        ? {
            version: draft.version,
            reviewed: hasCompleteCanonicalReviewEvidence(draft),
          }
        : null,
    };
  });
}

export function filterOperatorTemplates(
  templates: readonly OperatorTemplateListItem[],
  filters: OperatorTemplateListFilters
): OperatorTemplateListItem[] {
  return templates.filter((template) => {
    if (
      filters.serviceCategory &&
      template.serviceCategory !== filters.serviceCategory
    ) {
      return false;
    }
    if (filters.activity === "active" && !template.isActive) {
      return false;
    }
    if (filters.activity === "inactive" && template.isActive) {
      return false;
    }
    if (filters.publication === "draft" && !template.draft) {
      return false;
    }
    if (
      filters.publication === "published" &&
      template.latestPublishedVersion === null
    ) {
      return false;
    }
    if (
      filters.publication === "unpublished" &&
      template.latestPublishedVersion !== null
    ) {
      return false;
    }
    return true;
  });
}
