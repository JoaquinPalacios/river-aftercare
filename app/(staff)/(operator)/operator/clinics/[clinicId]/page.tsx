import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { AllowanceExtrasForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/allowance-extras-form";
import { PrepareBillingForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/prepare-billing-form";
import { UpgradePlanForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/upgrade-plan-form";
import { startOperatorClinicSupportAction } from "@/app/(staff)/(operator)/operator/support-actions";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { loadOperatorBillingPanel } from "@/lib/billing/billing-page";
import { loadGuideAllowance } from "@/lib/entitlements/guide-usage";
import { loadTeamAllowance } from "@/lib/entitlements/team-usage";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { getOperatorClinic } from "@/lib/operator/get-operator-clinic";
import { clinicTypefaceLabel } from "@/lib/branding/clinic-typeface";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

interface OperatorClinicPageProps {
  params: Promise<{ clinicId: string }>;
}

export const metadata: Metadata = {
  title: `Clinic · ${PRODUCT_NAME}`,
};

export default async function OperatorClinicDetailPage({
  params,
}: OperatorClinicPageProps) {
  await requirePlatformOperator();
  const { clinicId } = await params;
  const clinic = await getOperatorClinic(clinicId);
  if (!clinic) {
    notFound();
  }
  const [billing, teamAllowance, guideAllowance] = await Promise.all([
    loadOperatorBillingPanel(clinic.id),
    loadTeamAllowance(clinic.id),
    loadGuideAllowance(clinic.id),
  ]);

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const patientSiteHref = host
    ? clinicPatientSiteUrl({
        requestHost: host,
        clinicSlug: clinic.slug,
        protocol,
      })
    : null;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            { label: clinic.displayName },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {clinic.displayName}
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          {clinic.name} · {clinic.slug}
        </p>
        {patientSiteHref ? (
          <a
            href={patientSiteHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex text-sm font-medium text-staff-brand"
          >
            View patient site ↗
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </header>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Branding</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-staff-muted">Primary</dt>
            <dd>{clinic.branding.primaryColor ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Accent</dt>
            <dd>{clinic.branding.accentColor ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Custom Dark branding</dt>
            <dd>{clinic.branding.useCustomDarkBranding ? "Enabled" : "Off"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Dark primary</dt>
            <dd>{clinic.branding.darkPrimaryColor ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Favicon</dt>
            <dd>
              {clinic.branding.faviconUrl ? "Configured" : "River fallback"}
            </dd>
          </div>
          <div>
            <dt className="text-staff-muted">Dark logo</dt>
            <dd>
              {clinic.branding.darkLogoUrl ? "Configured" : "Standard logo"}
            </dd>
          </div>
          <div>
            <dt className="text-staff-muted">Radius</dt>
            <dd>{clinic.branding.radiusPreset ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Typeface</dt>
            <dd>
              {clinicTypefaceLabel(clinic.branding.typeface) ??
                "River Aftercare default"}
            </dd>
          </div>
          <div>
            <dt className="text-staff-muted">Theme</dt>
            <dd>{clinic.branding.themeMode ?? "Not set"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Contact / emergency</h2>
        <p className="mt-2 text-sm">
          Phone: {clinic.contact.phone ?? "Not set"}
        </p>
        <p className="mt-1 text-sm">
          Contact URL: {clinic.contact.contactUrl ?? "Not set"}
        </p>
        <p className="mt-1 text-sm">
          Emergency copy:{" "}
          {clinic.contact.emergencyInstructions
            ? "Configured"
            : "Needs attention"}
        </p>
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Guides</h2>
        {clinic.guides.length === 0 ? (
          <p className="mt-2 text-sm text-staff-muted">No guides yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-staff-line">
            {clinic.guides.map((guide) => (
              <li key={guide.id} className="py-2 text-sm">
                {guide.title} · /{guide.publicSlug} · {guide.status}
                {guide.isEnabled ? "" : " · disabled"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <PrepareBillingForm
        clinicId={clinic.id}
        plan={billing.plan}
        interval={billing.interval}
        canRevise={billing.canRevise}
        blockedReason={billing.reviseBlockedReason}
        planLabel={billing.planLabel}
        intervalLabel={billing.intervalLabel}
        entitlementLabel={billing.entitlementLabel}
        billingLabel={billing.billingLabel}
        customerLinked={billing.customerLinked}
        subscriptionLinked={billing.subscriptionLinked}
        paidThroughLabel={billing.paidThroughLabel}
        cancellationScheduled={billing.cancellationScheduled}
        cancellationDateLabel={billing.cancellationDateLabel}
      />

      <UpgradePlanForm
        clinicId={clinic.id}
        canUpgradeToPractice={billing.canUpgradeToPractice}
        downgradeDeferred={billing.downgradeDeferred}
        downgradeReadiness={billing.downgradeReadiness}
      />

      {billing.plan &&
      teamAllowance.baseLimit !== null &&
      teamAllowance.extraAllowance !== null &&
      guideAllowance.customGuides.baseLimit !== null &&
      guideAllowance.customGuides.extraAllowance !== null &&
      guideAllowance.adaptedTemplates.baseLimit !== null &&
      guideAllowance.adaptedTemplates.extraAllowance !== null &&
      guideAllowance.combinedGuides.baseLimit !== null ? (
        <AllowanceExtrasForm
          clinicId={clinic.id}
          planName={billing.plan === "ESSENTIAL" ? "Essential" : "Practice"}
          team={{
            used: teamAllowance.occupiedPlaces,
            base: teamAllowance.baseLimit,
            extra: teamAllowance.extraAllowance,
          }}
          customGuides={{
            used: guideAllowance.customGuides.used,
            base: guideAllowance.customGuides.baseLimit,
            extra: guideAllowance.customGuides.extraAllowance,
          }}
          adaptedTemplates={{
            used: guideAllowance.adaptedTemplates.used,
            base: guideAllowance.adaptedTemplates.baseLimit,
            extra: guideAllowance.adaptedTemplates.extraAllowance,
          }}
          combinedGuides={{
            used: guideAllowance.combinedGuides.used,
            base: guideAllowance.combinedGuides.baseLimit,
          }}
        />
      ) : null}

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Team</h2>
        <p className="mt-2 text-sm text-staff-muted">
          Manage who can access this clinic.
        </p>
        <p className="mt-2 text-sm">
          {clinic.members.filter((member) => member.active).length === 0
            ? "No active members yet."
            : `${clinic.members.filter((member) => member.active).length} active member${clinic.members.filter((member) => member.active).length === 1 ? "" : "s"}.`}
        </p>
        <Link
          href={`/operator/clinics/${clinic.id}/team`}
          className="mt-3 inline-flex text-sm font-medium text-staff-brand"
        >
          Open team
        </Link>
        <form action={startOperatorClinicSupportAction} className="mt-4">
          <input type="hidden" name="clinicId" value={clinic.id} />
          <button type="submit" className="staffBtn staffBtnPrimary">
            Manage clinic workspace
          </button>
        </form>
      </section>

      <p>
        <Link
          href="/operator/clinics"
          className="staffBtn staffBtnQuiet gap-1 px-0"
          aria-label="Back to all clinics"
        >
          <BackArrowIcon />
          All clinics
        </Link>
      </p>
    </div>
  );
}
