"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { BackArrowIcon } from "@/app/(staff)/components/icons";
import type { ClinicGuideLifecycleStatus } from "@/lib/clinic-portal/guide-status-view";

export function StaffPreviewToolbar({
  backHref,
  backLabel,
  editHref,
  lifecycle,
  appearanceControl,
}: {
  backHref: string;
  backLabel: string;
  editHref?: string;
  lifecycle?: ClinicGuideLifecycleStatus;
  appearanceControl?: ReactNode;
}) {
  return (
    <header className="staffPreviewToolbar">
      <Link
        href={backHref}
        className="staffPreviewBack"
        aria-label={backLabel}
        title={backLabel}
      >
        <BackArrowIcon />
        <span className="staffPreviewBackLabel">{backLabel}</span>
      </Link>
      <div className="staffPreviewStatus flex flex-col items-center gap-1">
        <p className="m-0">Draft preview</p>
        {lifecycle ? <GuideStatusPills lifecycle={lifecycle} /> : null}
      </div>
      <div className="staffPreviewToolbarEnd">
        {appearanceControl ?? null}
        {editHref ? (
          <Link href={editHref} className="staffPreviewEdit">
            Edit guide
          </Link>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}
