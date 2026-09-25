"use client";

import Link from "next/link";

import { GuideLifecycleActions } from "@/app/(staff)/(clinic-portal)/guides/guide-lifecycle-actions";
import { GuideShareMenu } from "@/app/(staff)/(clinic-portal)/guides/guide-share-menu";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { guideQrDownloadPath } from "@/lib/clinic-portal/guide-qr";
import type {
  ClinicGuideLifecycleStatus,
  GuideDestructiveAction,
} from "@/lib/clinic-portal/guide-status-view";

export function GuideRowActions({
  guideId,
  canManage,
  isPublishedPublic,
  previewHref,
  destructiveAction,
  canUnpublish,
  lifecycle,
}: {
  guideId: string;
  canManage: boolean;
  isPublishedPublic: boolean;
  previewHref: string | null;
  destructiveAction: GuideDestructiveAction | null;
  canUnpublish: boolean;
  lifecycle: ClinicGuideLifecycleStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage ? (
        <Link
          href={`/guides/${guideId}/edit`}
          className="staffBtn staffBtnPrimary"
        >
          Edit
        </Link>
      ) : null}
      <Link
        href={`/guides/${guideId}/preview`}
        className="staffBtn staffBtnSecondary"
      >
        Preview
      </Link>
      {isPublishedPublic && previewHref ? (
        <>
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="staffBtn staffBtnQuiet"
          >
            View patient guide
            <span className="sr-only"> (opens in a new tab)</span>
            <ExternalLinkIcon className="ml-1" />
          </a>
          <GuideShareMenu
            publicUrl={previewHref}
            svgHref={guideQrDownloadPath(guideId, "svg")}
            pngHref={guideQrDownloadPath(guideId, "png")}
          />
        </>
      ) : null}
      {canManage ? (
        <GuideLifecycleActions
          guideId={guideId}
          lifecycle={lifecycle}
          destructiveAction={destructiveAction}
          canUnpublish={canUnpublish}
        />
      ) : null}
    </div>
  );
}
