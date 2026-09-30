import "server-only";

import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  type Prisma,
} from "@prisma/client";
import { headers } from "next/headers";

import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import type { ServiceCategory } from "@/lib/aftercare/service-category";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import {
  clinicGuideCanUnpublish,
  clinicGuideDestructiveAction,
  clinicGuideLifecycleStatus,
  clinicGuideStatusLabel,
  type ClinicGuideLifecycleStatus,
  type GuideDestructiveAction,
} from "@/lib/clinic-portal/guide-status";
import type { ClinicGuideSort } from "@/lib/clinic-portal/guide-table-state";
import { getPrisma } from "@/lib/prisma";
import { downgradeRetentionIsOpen } from "@/lib/entitlements/downgrade-retention";
import {
  resolveTablePage,
  type SortDirection,
  type TablePageSize,
} from "@/lib/staff/table-controls";

export interface ClinicPortalGuide {
  id: string;
  title: string;
  publicSlug: string;
  status: PracticeGuideStatus;
  lifecycle: ClinicGuideLifecycleStatus;
  statusLabel: string;
  isEnabled: boolean;
  sourceLabel: string;
  templateSlug: string | null;
  serviceCategory: ServiceCategory | null;
  updatedAt: Date;
  previewHref: string | null;
  destructiveAction: GuideDestructiveAction | null;
  canUnpublish: boolean;
  sourceKind: "template" | "custom" | "adapted";
  downgradeRetention: {
    retainedAt: Date;
    retentionUntil: Date;
    open: boolean;
  } | null;
}

function guideListSelect(clinicId: string) {
  return {
    id: true,
    title: true,
    publicSlug: true,
    status: true,
    isEnabled: true,
    publishedAt: true,
    updatedAt: true,
    sourceGuideTemplateId: true,
    serviceCategory: true,
    downgradeRetainedAt: true,
    downgradeRetentionUntil: true,
    guideTemplate: {
      select: {
        title: true,
        slug: true,
      },
    },
    pinnedRevision: {
      select: {
        status: true,
      },
    },
    placements: {
      where: {
        clinicId,
        location: {
          servesSiteRoot: true,
          active: true,
          clinicId,
          clinicSite: {
            isPrimary: true,
            active: true,
            clinicId,
          },
        },
      },
      select: { publicSlug: true },
      take: 2,
    },
    contentRevisions: {
      select: {
        version: true,
        status: true,
        title: true,
        updatedAt: true,
        publishedAt: true,
      },
    },
  } satisfies Prisma.PracticeGuideSelect;
}

type GuideListRecord = Prisma.PracticeGuideGetPayload<{
  select: ReturnType<typeof guideListSelect>;
}>;

interface GuideListContext {
  clinic: {
    id: string;
    sites: Array<{ slug: string; clinicId: string }>;
  };
  host: string;
  protocol: string;
}

async function loadGuideListContext(
  clinicId: string
): Promise<GuideListContext | null> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      sites: {
        where: { isPrimary: true, active: true },
        select: { slug: true, clinicId: true },
      },
    },
  });
  if (!clinic) {
    return null;
  }
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  return { clinic, host, protocol };
}

function mapPracticeGuide(
  guide: GuideListRecord,
  context: GuideListContext,
  now: Date
): ClinicPortalGuide {
  const draft = (guide.contentRevisions ?? []).find(
    (revision) => revision.version === WORKING_DRAFT_VERSION
  );
  const published = (guide.contentRevisions ?? [])
    .filter(
      (revision) =>
        revision.status === GuideRevisionStatus.PUBLISHED &&
        revision.version > 0
    )
    .toSorted(
      (left, right) =>
        (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0)
    )[0];
  const lifecycle = clinicGuideLifecycleStatus({
    status: guide.status,
    isEnabled: guide.isEnabled,
    publishedRevisionStatus: published?.status ?? guide.pinnedRevision?.status,
    draftUpdatedAt: draft?.updatedAt ?? null,
    publishedAt: published?.publishedAt ?? guide.publishedAt,
  });
  const canPreviewPublic =
    guide.isEnabled &&
    guide.status === PracticeGuideStatus.PUBLISHED &&
    Boolean(
      published ||
      guide.pinnedRevision?.status === GuideRevisionStatus.PUBLISHED
    );
  const site =
    context.clinic.sites.length === 1 ? context.clinic.sites[0] : null;
  const rootPlacement =
    guide.placements.length === 1 ? guide.placements[0] : null;
  const previewHref =
    canPreviewPublic &&
    context.host &&
    site &&
    site.clinicId === context.clinic.id &&
    rootPlacement
      ? clinicPatientSiteUrl({
          requestHost: context.host,
          clinicSlug: site.slug,
          protocol: context.protocol,
          pathname: `/${rootPlacement.publicSlug}`,
        })
      : null;
  const retentionOpen = downgradeRetentionIsOpen(guide, now);
  const downgradeRetention =
    guide.downgradeRetainedAt && guide.downgradeRetentionUntil
      ? {
          retainedAt: guide.downgradeRetainedAt,
          retentionUntil: guide.downgradeRetentionUntil,
          open: retentionOpen,
        }
      : null;

  return {
    id: guide.id,
    title:
      draft?.title?.trim() ||
      guide.title ||
      guide.guideTemplate?.title ||
      "Untitled guide",
    publicSlug: guide.publicSlug,
    status: guide.status,
    lifecycle,
    statusLabel: clinicGuideStatusLabel(lifecycle),
    isEnabled: guide.isEnabled,
    sourceLabel: guide.guideTemplate
      ? `Template · ${guide.guideTemplate.title}`
      : guide.sourceGuideTemplateId
        ? "Editable River template"
        : "Custom guide",
    templateSlug: guide.guideTemplate?.slug ?? null,
    serviceCategory: guide.serviceCategory,
    updatedAt: draft?.updatedAt ?? guide.updatedAt,
    previewHref,
    destructiveAction: downgradeRetention
      ? null
      : clinicGuideDestructiveAction(lifecycle),
    canUnpublish: downgradeRetention
      ? false
      : clinicGuideCanUnpublish(lifecycle),
    sourceKind: guide.guideTemplate
      ? "template"
      : guide.sourceGuideTemplateId
        ? "adapted"
        : "custom",
    downgradeRetention,
  };
}

export async function listClinicPortalGuides(
  clinicId: string,
  now: Date = new Date()
): Promise<ClinicPortalGuide[]> {
  const context = await loadGuideListContext(clinicId);
  if (!context) {
    return [];
  }
  const guides = await getPrisma().practiceGuide.findMany({
    where: { clinicId: context.clinic.id },
    orderBy: [{ sortOrder: "asc" }, { publicSlug: "asc" }],
    select: guideListSelect(context.clinic.id),
  });
  return guides.map((guide) => mapPracticeGuide(guide, context, now));
}

export interface ClinicGuidePage {
  rows: ClinicPortalGuide[];
  total: number;
  page: number;
  pageSize: TablePageSize;
  totalPages: number;
  redirect: boolean;
}

export interface ClinicGuideDirectory {
  active: ClinicGuidePage;
  retained: ClinicPortalGuide[];
}

function activeGuideWhere(
  clinicId: string,
  q: string
): Prisma.PracticeGuideWhereInput {
  const where: Prisma.PracticeGuideWhereInput = {
    clinicId,
    OR: [{ downgradeRetainedAt: null }, { downgradeRetentionUntil: null }],
  };
  if (q) {
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { publicSlug: { contains: q, mode: "insensitive" } },
          {
            contentRevisions: {
              some: {
                version: WORKING_DRAFT_VERSION,
                title: { contains: q, mode: "insensitive" },
              },
            },
          },
        ],
      },
    ];
  }
  return where;
}

function guideOrder(
  sort: ClinicGuideSort,
  direction: SortDirection
): Prisma.PracticeGuideOrderByWithRelationInput[] {
  const tie = [{ title: "asc" as const }, { id: "asc" as const }];
  if (sort === "status") {
    return [{ status: direction }, { isEnabled: direction }, ...tie];
  }
  if (sort === "updated") {
    return [{ updatedAt: direction }, ...tie];
  }
  return [{ title: direction }, { id: "asc" }];
}

/**
 * Active guides are paginated in the database. Retained guides stay a
 * separate small read. Search covers title, public slug, and the working
 * draft title. It does not read section bodies.
 * Title and slug contains-search is not covered by a dedicated index.
 */
export async function loadClinicGuideDirectory(input: {
  clinicId: string;
  q: string;
  sort: ClinicGuideSort;
  direction: SortDirection;
  requestedPage: number | null;
  pageSize: TablePageSize;
  now?: Date;
}): Promise<ClinicGuideDirectory> {
  const now = input.now ?? new Date();
  const empty: ClinicGuideDirectory = {
    active: {
      rows: [],
      total: 0,
      page: 1,
      pageSize: input.pageSize,
      totalPages: 0,
      redirect: false,
    },
    retained: [],
  };
  const context = await loadGuideListContext(input.clinicId);
  if (!context) {
    const resolved = resolveTablePage(input.requestedPage, 0, input.pageSize);
    return {
      ...empty,
      active: {
        ...empty.active,
        redirect: resolved.redirect,
        page: resolved.page,
      },
    };
  }
  const where = activeGuideWhere(context.clinic.id, input.q);
  const total = await getPrisma().practiceGuide.count({ where });
  const resolved = resolveTablePage(input.requestedPage, total, input.pageSize);
  if (resolved.redirect) {
    return {
      active: {
        rows: [],
        total,
        page: resolved.page,
        pageSize: input.pageSize,
        totalPages: resolved.totalPages,
        redirect: true,
      },
      retained: [],
    };
  }
  const [guides, retained] = await Promise.all([
    getPrisma().practiceGuide.findMany({
      where,
      orderBy: guideOrder(input.sort, input.direction),
      skip: (resolved.page - 1) * input.pageSize,
      take: input.pageSize,
      select: guideListSelect(context.clinic.id),
    }),
    getPrisma().practiceGuide.findMany({
      where: {
        clinicId: context.clinic.id,
        downgradeRetainedAt: { not: null },
        downgradeRetentionUntil: { gt: now },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      select: guideListSelect(context.clinic.id),
    }),
  ]);
  return {
    active: {
      rows: guides.map((guide) => mapPracticeGuide(guide, context, now)),
      total,
      page: resolved.page,
      pageSize: input.pageSize,
      totalPages: resolved.totalPages,
      redirect: false,
    },
    retained: retained.map((guide) => mapPracticeGuide(guide, context, now)),
  };
}
