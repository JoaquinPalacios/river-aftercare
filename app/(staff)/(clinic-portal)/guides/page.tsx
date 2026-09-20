import type { Metadata } from "next";
import Link from "next/link";
import { ClinicMembershipRole } from "@prisma/client";

import { GuideRowActions } from "@/app/(staff)/(clinic-portal)/guides/guide-row-actions";
import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { listClinicPortalGuides } from "@/lib/clinic-portal/list-clinic-guides";
import { formatPortalDate } from "@/lib/clinic-portal/format-portal-date";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Guides · ${PRODUCT_NAME}`,
  description: "Practice aftercare guides for the signed-in clinic.",
};

export default async function ClinicGuidesPage() {
  const { clinicMembership } = await requireStaffSession();
  const clinicId = clinicMembership.clinic.id;
  const canManage =
    clinicMembership.source === "operator_support" ||
    clinicMembership.role === ClinicMembershipRole.ADMIN;
  const [overview, guides] = await Promise.all([
    getClinicPortalOverview(clinicId),
    listClinicPortalGuides(clinicId),
  ]);
  const displayName = overview?.displayName ?? clinicMembership.clinic.name;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
            Guides
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-staff-ink">
            Guides
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-staff-muted">
            Patient aftercare instructions for {displayName}.
          </p>
        </div>
        {canManage ? (
          <Link href="/guides/new" className="staffBtn staffBtnPrimary">
            Create guide
          </Link>
        ) : null}
      </header>

      {guides.length === 0 ? (
        <p className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm leading-6 text-staff-muted">
          No guides have been configured for this practice yet.
        </p>
      ) : (
        <ul className="divide-y divide-staff-line overflow-hidden rounded-xl border border-staff-line bg-staff-panel shadow-sm">
          {guides.map((guide) => (
            <li key={guide.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-staff-ink">{guide.title}</p>
                  <div className="staffGuideMeta">
                    <GuideStatusPills lifecycle={guide.lifecycle} />
                    <p className="staffGuideSource">{guide.sourceLabel}</p>
                  </div>
                  <p className="mt-1 text-sm text-staff-muted">
                    /{guide.publicSlug}
                    <span aria-hidden="true"> · </span>
                    Updated {formatPortalDate(guide.updatedAt)}
                  </p>
                </div>
                <GuideRowActions
                  guideId={guide.id}
                  canManage={canManage}
                  isPublishedPublic={Boolean(guide.previewHref)}
                  previewHref={guide.previewHref}
                  destructiveAction={guide.destructiveAction}
                  canUnpublish={guide.canUnpublish}
                  lifecycle={guide.lifecycle}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
