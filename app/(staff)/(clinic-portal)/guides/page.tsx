import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClinicMembershipRole } from "@prisma/client";

import { ClinicGuidesTable } from "@/app/(staff)/(clinic-portal)/guides/clinic-guides-table";
import {
  RetainedGuideCard,
  retainedGuideIsPublic,
} from "@/app/(staff)/(clinic-portal)/guides/retained-guide-card";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { formatBillingDate } from "@/lib/billing/billing-presentation";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { loadClinicGuideDirectory } from "@/lib/clinic-portal/list-clinic-guides";
import { formatPortalDate } from "@/lib/clinic-portal/format-portal-date";
import {
  clinicGuidesListHref,
  parseClinicGuideTableState,
} from "@/lib/clinic-portal/guide-table-state";
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

export default async function ClinicGuidesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    sort?: string | string[];
    direction?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const { clinicMembership } = await requireStaffSession();
  const clinicId = clinicMembership.clinic.id;
  const canManage =
    clinicMembership.source === "operator_support" ||
    clinicMembership.role === ClinicMembershipRole.ADMIN;
  const canRestore =
    clinicMembership.source !== "operator_support" &&
    clinicMembership.role === ClinicMembershipRole.ADMIN;
  const params = await searchParams;
  const state = parseClinicGuideTableState(params);
  const [overview, directory, allowance, links, preparation] =
    await Promise.all([
      getClinicPortalOverview(clinicId),
      loadClinicGuideDirectory({
        clinicId,
        q: state.q,
        sort: state.sort,
        direction: state.direction,
        requestedPage: state.requestedPage,
        pageSize: state.pageSize,
      }),
      loadGuideAllowance(clinicId),
      marketingPublicLinks(),
      loadDowngradePreparationSnapshot(clinicId),
    ]);
  if (directory.active.redirect) {
    redirect(clinicGuidesListHref({ ...state, page: directory.active.page }));
  }
  const contactHref = marketingContactHref(links);
  const displayName = overview?.displayName ?? clinicMembership.clinic.name;
  const retainedGuides = directory.retained;
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

      <ClinicGuidesTable
        state={{ ...state, requestedPage: directory.active.page }}
        page={directory.active.page}
        total={directory.active.total}
        suppressEmpty={retainedGuides.length > 0}
        guides={directory.active.rows.map((guide) => ({
          id: guide.id,
          title: guide.title,
          publicSlug: guide.publicSlug,
          sourceLabel: guide.sourceLabel,
          updatedLabel: formatPortalDate(guide.updatedAt),
          lifecycle: guide.lifecycle,
          canManage,
          isPublishedPublic: Boolean(guide.previewHref),
          previewHref: guide.previewHref,
          destructiveAction: guide.destructiveAction,
          canUnpublish: guide.canUnpublish,
        }))}
      />

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
