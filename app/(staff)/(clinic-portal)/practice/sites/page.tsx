import type { Metadata } from "next";
import Link from "next/link";

import { CreateSiteForm } from "@/app/(staff)/(clinic-portal)/practice/sites/create-site-form";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { listAccountSites } from "@/lib/clinics/list-account-sites";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Sites & Locations · ${PRODUCT_NAME}`,
};

export default async function SitesPage() {
  const { clinicMembership } = await requireStaffSession();
  const canManage =
    clinicMembership.source === "operator_support" ||
    clinicMembership.role === "ADMIN";
  const account = await listAccountSites(clinicMembership.clinic.id);
  const canAddSite =
    canManage && account.usage.activeSites < account.allowance.siteAllowance;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sites & Locations
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          Clinic sites are the public practice identities. Locations are the
          physical places under a site.
        </p>
      </header>
      <section
        className="grid gap-3 rounded-xl border border-staff-line bg-staff-panel p-5 sm:grid-cols-2"
        aria-label="Capacity"
      >
        <p className="text-sm">
          <span className="block text-staff-muted">Sites</span>
          <span className="text-lg font-semibold">
            {account.usage.activeSites} / {account.allowance.siteAllowance}
          </span>
        </p>
        <p className="text-sm">
          <span className="block text-staff-muted">Locations</span>
          <span className="text-lg font-semibold">
            {account.usage.activeLocations} /{" "}
            {account.allowance.locationAllowance}
          </span>
        </p>
      </section>
      <ul className="flex flex-col gap-4">
        {account.sites.map((site) => (
          <li
            key={site.id}
            className="rounded-xl border border-staff-line bg-staff-panel p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{site.name}</h2>
                <p className="text-sm text-staff-muted">
                  {site.slug}.{account.rootDomain}
                </p>
                <p className="mt-1 text-sm">
                  {site.active ? "Active" : "Inactive"}
                  {site.displayName !== site.name
                    ? ` · ${site.displayName}`
                    : ""}
                </p>
              </div>
              <Link
                href={`/practice/sites/${site.id}`}
                className="staffBtn staffBtnSecondary"
              >
                Manage site
              </Link>
            </div>
            <ul className="mt-3 text-sm">
              {site.locations.map((location) => (
                <li key={location.id}>
                  {location.name}
                  {location.servesSiteRoot ? " · site root" : ""}
                  {location.active ? "" : " · Inactive"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {canAddSite ? <CreateSiteForm /> : null}
      {canManage ? (
        <p className="text-sm text-staff-muted">
          Branding for the original site can also be edited in{" "}
          <Link href="/practice" className="font-medium text-staff-brand">
            Practice settings
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm text-staff-muted">
          Staff can view sites and locations. An administrator manages them.
        </p>
      )}
    </div>
  );
}
