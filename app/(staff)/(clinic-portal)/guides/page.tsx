import type { Metadata } from "next";
import Link from "next/link";
import { ClinicMembershipRole } from "@prisma/client";

import { GuideRowActions } from "@/app/(staff)/(clinic-portal)/guides/guide-row-actions";
import {
  RetainedGuideCard,
  retainedGuideIsPublic,
} from "@/app/(staff)/(clinic-portal)/guides/retained-guide-card";
import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { formatBillingDate } from "@/lib/billing/billing-presentation";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { listClinicPortalGuides } from "@/lib/clinic-portal/list-clinic-guides";
import { formatPortalDate } from "@/lib/clinic-portal/format-portal-date";
import { loadDowngradePreparationSnapshot } from "@/lib/entitlements/downgrade-selection";
import { loadGuideAllowance } from "@/lib/entitlements/guide-usage";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  marketingContactHref,
  marketingPublicLinks,
} from "@/lib/marketing/public-links";

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
  const [overview, guides, allowance, links, preparation] = await Promise.all([
    getClinicPortalOverview(clinicId),
    listClinicPortalGuides(clinicId),
    loadGuideAllowance(clinicId),
    marketingPublicLinks(),
    loadDowngradePreparationSnapshot(clinicId),
  ]);
  const contactHref = marketingContactHref(links);
  const displayName = overview?.displayName ?? clinicMembership.clinic.name;
  const activeGuides = guides.filter((guide) => !guide.downgradeRetention);
  const retainedGuides = guides.filter(
    (guide) => guide.downgradeRetention?.open
  );
  const canRestore =
    clinicMembership.source !== "operator_support" &&
    clinicMembership.role === ClinicMembershipRole.ADMIN;

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
          {allowance.customGuides.usageLabel ? (
            <p className="mt-2 text-sm font-medium text-staff-ink">
              {allowance.customGuides.usageLabel}
            </p>
          ) : null}
          {allowance.adaptedTemplates.usageLabel ? (
            <p className="mt-1 text-sm font-medium text-staff-ink">
              {allowance.adaptedTemplates.usageLabel}
            </p>
          ) : null}
          {allowance.combinedGuides.usageLabel ? (
            <p className="mt-1 text-sm font-medium text-staff-ink">
              {allowance.combinedGuides.usageLabel}
            </p>
          ) : null}
          {allowance.customGuides.atLimit &&
          allowance.customGuides.limitMessage ? (
            <p className="mt-1 max-w-xl text-sm leading-6 text-staff-muted">
              {allowance.customGuides.limitMessage} Existing custom guides can
              still be edited. River templates can still be used as supplied.{" "}
              <a href={contactHref} className="underline">
                Contact River Aftercare
              </a>
            </p>
          ) : null}
          {allowance.adaptedTemplates.atLimit &&
          allowance.adaptedTemplates.limitMessage ? (
            <p className="mt-1 max-w-xl text-sm leading-6 text-staff-muted">
              {allowance.adaptedTemplates.limitMessage} Existing editable copies
              can still be edited.
            </p>
          ) : null}
          {allowance.combinedGuides.atLimit &&
          allowance.combinedGuides.limitMessage ? (
            <p className="mt-1 max-w-xl text-sm leading-6 text-staff-muted">
              {allowance.combinedGuides.limitMessage} Existing guides can still
              be edited. River templates can still be used as supplied.
            </p>
          ) : null}
        </div>
        {canManage ? (
          <Link href="/guides/new" className="staffBtn staffBtnPrimary">
            Create guide
          </Link>
        ) : null}
      </header>

      {preparation?.status === "awaiting" ? (
        <p className="rounded-xl border border-staff-line bg-staff-panel px-5 py-4 text-sm leading-6">
          A move to Essential needs a choice of which clinic-owned guides stay
          active.{" "}
          <Link href="/account/billing" className="underline">
            Choose guides
          </Link>
        </p>
      ) : null}

      {activeGuides.length === 0 && retainedGuides.length === 0 ? (
        <p className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm leading-6 text-staff-muted">
          No guides have been configured for this practice yet.
        </p>
      ) : activeGuides.length > 0 ? (
        <ul className="divide-y divide-staff-line overflow-hidden rounded-xl border border-staff-line bg-staff-panel shadow-sm">
          {activeGuides.map((guide) => (
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
      ) : null}

      {retainedGuides.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-staff-ink">
            Retained guides
          </h2>
          <ul className="divide-y divide-staff-line overflow-hidden rounded-xl border border-staff-line bg-staff-panel shadow-sm">
            {retainedGuides.map((guide) => {
              const retentionUntil = guide.downgradeRetention!.retentionUntil;
              return (
                <RetainedGuideCard
                  key={guide.id}
                  guideId={guide.id}
                  title={guide.title}
                  sourceLabel={guide.sourceLabel}
                  lifecycle={guide.lifecycle}
                  retentionUntilLabel={formatBillingDate(retentionUntil)}
                  retentionUntilIso={retentionUntil.toISOString()}
                  patientUrl={
                    retainedGuideIsPublic(guide.lifecycle)
                      ? guide.previewHref
                      : null
                  }
                  canRestore={canRestore}
                />
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
