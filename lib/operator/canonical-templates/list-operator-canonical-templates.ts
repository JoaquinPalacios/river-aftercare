import "server-only";

import {
  GuideRevisionStatus,
  type Prisma,
  type ServiceCategory,
} from "@prisma/client";

import {
  isServiceCategory,
  serviceCategoryLabel,
} from "@/lib/aftercare/service-category";
import { getPrisma } from "@/lib/prisma";
import type { OperatorTemplateSort } from "@/lib/operator/canonical-templates/template-table-state";
import {
  resolveTablePage,
  type SortDirection,
  type TablePageSize,
} from "@/lib/staff/table-controls";

export interface OperatorTemplateListItem {
  id: string;
  title: string;
  slug: string;
  serviceCategory: ServiceCategory;
  serviceCategoryLabel: string;
  isActive: boolean;
  isSample: boolean;
  latestPublishedVersion: number | null;
  draft: { id: string; version: number } | null;
}

export interface OperatorTemplateListFilters {
  serviceCategory?: string;
  activity?: string;
  publication?: string;
}

const operatorTemplateListSelect = {
  id: true,
  title: true,
  slug: true,
  serviceCategory: true,
  isActive: true,
  isSample: true,
  revisions: {
    orderBy: { version: "desc" as const },
    select: {
      id: true,
      version: true,
      status: true,
    },
  },
} satisfies Prisma.GuideTemplateSelect;

type OperatorTemplateRecord = Prisma.GuideTemplateGetPayload<{
  select: typeof operatorTemplateListSelect;
}>;

function toOperatorTemplateListItem(
  template: OperatorTemplateRecord
): OperatorTemplateListItem {
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
          id: draft.id,
          version: draft.version,
        }
      : null,
  };
}

export async function listOperatorCanonicalTemplates(): Promise<
  OperatorTemplateListItem[]
> {
  const templates = await getPrisma().guideTemplate.findMany({
    orderBy: [{ serviceCategory: "asc" }, { title: "asc" }],
    select: operatorTemplateListSelect,
  });
  return templates.map(toOperatorTemplateListItem);
}

export interface OperatorTemplatePageQuery {
  serviceCategory?: string;
  activity?: string;
  publication?: string;
  q?: string;
  sort: OperatorTemplateSort;
  direction: SortDirection;
  requestedPage: number | null;
  pageSize: TablePageSize;
}

export interface OperatorTemplatePage {
  rows: OperatorTemplateListItem[];
  total: number;
  page: number;
  pageSize: TablePageSize;
  totalPages: number;
  redirect: boolean;
}

function operatorTemplateWhere(
  query: OperatorTemplatePageQuery
): Prisma.GuideTemplateWhereInput {
  const where: Prisma.GuideTemplateWhereInput = {};
  if (query.serviceCategory && isServiceCategory(query.serviceCategory)) {
    where.serviceCategory = query.serviceCategory;
  }
  if (query.activity === "active") {
    where.isActive = true;
  } else if (query.activity === "inactive") {
    where.isActive = false;
  }
  if (query.publication === "draft") {
    where.revisions = { some: { status: GuideRevisionStatus.DRAFT } };
  } else if (query.publication === "published") {
    where.revisions = { some: { status: GuideRevisionStatus.PUBLISHED } };
  } else if (query.publication === "unpublished") {
    where.revisions = { none: { status: GuideRevisionStatus.PUBLISHED } };
  }
  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function operatorTemplateOrder(
  sort: OperatorTemplateSort,
  direction: SortDirection
): Prisma.GuideTemplateOrderByWithRelationInput[] {
  const tie = [{ title: "asc" as const }, { id: "asc" as const }];
  if (sort === "service") {
    return [{ serviceCategory: direction }, ...tie];
  }
  if (sort === "status") {
    return [{ isActive: direction }, { isSample: direction }, ...tie];
  }
  return [{ title: direction }, { id: "asc" }];
}

/**
 * Page of canonical templates. Count and rows share one where-clause.
 * Title and slug search uses case-insensitive contains. Those columns are
 * not indexed for substring search; the operator catalogue is small enough
 * that a speculative index is not added here.
 * Revisions are loaded only for the current page, in the same query.
 */
export async function queryOperatorCanonicalTemplates(
  query: OperatorTemplatePageQuery
): Promise<OperatorTemplatePage> {
  const where = operatorTemplateWhere(query);
  const total = await getPrisma().guideTemplate.count({ where });
  const resolved = resolveTablePage(query.requestedPage, total, query.pageSize);
  if (resolved.redirect) {
    return {
      rows: [],
      total,
      page: resolved.page,
      pageSize: query.pageSize,
      totalPages: resolved.totalPages,
      redirect: true,
    };
  }
  const skip = (resolved.page - 1) * query.pageSize;
  const templates = await getPrisma().guideTemplate.findMany({
    where,
    orderBy: operatorTemplateOrder(query.sort, query.direction),
    skip,
    take: query.pageSize,
    select: operatorTemplateListSelect,
  });
  return {
    rows: templates.map(toOperatorTemplateListItem),
    total,
    page: resolved.page,
    pageSize: query.pageSize,
    totalPages: resolved.totalPages,
    redirect: false,
  };
}

/** Draft editor while a production draft is open; otherwise the detail page. */
export function operatorTemplateHref(template: {
  id: string;
  isSample: boolean;
  draft: { version: number } | null;
}): string {
  if (!template.isSample && template.draft) {
    return `/operator/templates/${template.id}/draft`;
  }
  return `/operator/templates/${template.id}`;
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
