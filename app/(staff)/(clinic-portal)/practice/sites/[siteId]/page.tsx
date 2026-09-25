import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteManager } from "@/app/(staff)/(clinic-portal)/practice/sites/[siteId]/site-manager";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { isClinicAssetStorageConfigured } from "@/lib/clinic-assets/config";
import { resolveClinicLogoSrc } from "@/lib/clinic-assets/public-url";
import { getAccountSite } from "@/lib/clinics/list-account-sites";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

interface SitePageProps {
  params: Promise<{ siteId: string }>;
}

export const metadata: Metadata = {
  title: `Clinic site · ${PRODUCT_NAME}`,
};

export default async function SitePage({ params }: SitePageProps) {
  const { siteId } = await params;
  const { clinicMembership } = await requireStaffSession();
  const account = await getAccountSite(clinicMembership.clinic.id, siteId);
  if (!account) {
    notFound();
  }
  const canManage =
    clinicMembership.source === "operator_support" ||
    clinicMembership.role === "ADMIN";
  const canAddLocation =
    canManage &&
    account.site.active &&
    account.usage.activeLocations < account.allowance.locationAllowance;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <p className="text-sm">
        <Link href="/practice/sites" className="text-staff-brand">
          Sites & Locations
        </Link>
      </p>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {account.site.name}
        </h1>
        <p className="mt-1 text-sm text-staff-muted">
          {account.site.slug}.{account.rootDomain} ·{" "}
          {account.site.active ? "Active" : "Inactive"}
        </p>
        <p className="mt-2 text-sm text-staff-muted">
          The site address is permanent. Locations under this site use its
          branding.
        </p>
      </header>
      <SiteManager
        site={account.site}
        canManage={canManage}
        canAddLocation={canAddLocation}
        storageAvailable={isClinicAssetStorageConfigured()}
        logoSrc={resolveClinicLogoSrc(account.site.logoUrl)}
        darkLogoSrc={resolveClinicLogoSrc(account.site.darkLogoUrl)}
        faviconSrc={resolveClinicLogoSrc(account.site.faviconUrl)}
        rootDomain={account.rootDomain}
      />
    </div>
  );
}
