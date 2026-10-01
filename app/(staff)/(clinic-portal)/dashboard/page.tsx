import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BillingNotice } from "@/app/(staff)/components/billing-notice";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { loadOverviewBillingNotices } from "@/lib/billing/notices/load";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Overview · ${PRODUCT_NAME}`,
  description: "Clinic aftercare overview for signed-in practice staff.",
};

export default async function ClinicOverviewPage() {
  const { clinicMembership } = await requireStaffSession();
  const overview = await getClinicPortalOverview(clinicMembership.clinic.id);

  if (!overview) {
    notFound();
  }

  const billingNotices = await loadOverviewBillingNotices({
    clinicId: clinicMembership.clinic.id,
    role: clinicMembership.role,
    source: clinicMembership.source,
  });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
            Overview
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-staff-ink">
            {overview.displayName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-staff-muted">
            Manage your clinic&apos;s patient aftercare.
          </p>
        </div>
        {overview.patientSiteHref ? (
          <a
            href={overview.patientSiteHref}
            target="_blank"
            rel="noreferrer"
            className="staffBtn staffBtnPrimary"
          >
            View patient site
            <span className="sr-only"> (opens in a new tab)</span>
            <ExternalLinkIcon className="ml-1" />
          </a>
        ) : null}
      </header>

      {billingNotices.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-3">
          {billingNotices.map((notice) => (
            <BillingNotice key={notice.id} notice={notice} />
          ))}
        </div>
      ) : null}

      <section
        aria-labelledby="guide-summary-heading"
        className="grid gap-3 sm:grid-cols-2"
      >
        <h2 id="guide-summary-heading" className="sr-only">
          Guide summary
        </h2>
        <article className="rounded-xl border border-staff-line bg-staff-panel p-5 shadow-sm">
          <p className="text-sm text-staff-muted">Published guides</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {overview.publishedGuideCount}
          </p>
        </article>
        <article className="rounded-xl border border-staff-line bg-staff-panel p-5 shadow-sm">
          <p className="text-sm text-staff-muted">Draft guides</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {overview.draftGuideCount}
          </p>
        </article>
      </section>

      <section
        aria-labelledby="setup-heading"
        className="rounded-xl border border-staff-line bg-staff-panel p-5 shadow-sm"
      >
        <h2
          id="setup-heading"
          className="text-base font-semibold tracking-tight"
        >
          Clinic setup
        </h2>
        <ul className="mt-4 divide-y divide-staff-line">
          {overview.setup.map((check) => (
            <li
              key={check.id}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
            >
              <div>
                <p className="text-sm font-medium">{check.label}</p>
                <p className="mt-1 text-sm text-staff-muted">{check.detail}</p>
              </div>
              <p
                className="staffStatusPill mt-1 h-7 shrink-0 px-2.5"
                data-tone={check.state === "configured" ? "success" : "warning"}
              >
                {check.state === "configured"
                  ? "Configured"
                  : "Needs attention"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
