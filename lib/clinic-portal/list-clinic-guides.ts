import "server-only";

import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";
import { headers } from "next/headers";

import { WORKING_DRAFT_VERSION } from "@/lib/aftercare/practice-revision-document";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import {
  clinicGuideCanUnpublish,
  clinicGuideDestructiveAction,
  clinicGuideLifecycleStatus,
  clinicGuideStatusLabel,
  type ClinicGuideLifecycleStatus,
  type GuideDestructiveAction,
} from "@/lib/clinic-portal/guide-status";
import { getPrisma } from "@/lib/prisma";
import { downgradeRetentionIsOpen } from "@/lib/entitlements/downgrade-retention";

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
  specialty: string | null;
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

export async function listClinicPortalGuides(
  clinicId: string,
  now: Date = new Date()
): Promise<ClinicPortalGuide[]> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, slug: true },
  });

  if (!clinic) {
    return [];
  }

  const guides = await getPrisma().practiceGuide.findMany({
    where: { clinicId: clinic.id },
    orderBy: [{ sortOrder: "asc" }, { publicSlug: "asc" }],
    select: {
      id: true,
      title: true,
      publicSlug: true,
      status: true,
      isEnabled: true,
      publishedAt: true,
      updatedAt: true,
      sourceGuideTemplateId: true,
      downgradeRetainedAt: true,
      downgradeRetentionUntil: true,
      guideTemplate: {
        select: {
          title: true,
          slug: true,
          specialty: true,
        },
      },
      pinnedRevision: {
        select: {
          status: true,
        },
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
    },
  });

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  return guides.map((guide) => {
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
          (right.publishedAt?.getTime() ?? 0) -
          (left.publishedAt?.getTime() ?? 0)
      )[0];
    const lifecycle = clinicGuideLifecycleStatus({
      status: guide.status,
      isEnabled: guide.isEnabled,
      publishedRevisionStatus:
        published?.status ?? guide.pinnedRevision?.status,
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
    const previewHref =
      canPreviewPublic && host
        ? clinicPatientSiteUrl({
            requestHost: host,
            clinicSlug: clinic.slug,
            protocol,
            pathname: `/${guide.publicSlug}`,
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
      specialty: guide.guideTemplate?.specialty ?? null,
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
  });
}
