import type { Metadata } from "next";
import { ClinicMembershipRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { PracticeMembersSection } from "@/app/(staff)/(clinic-portal)/practice/practice-members-section";
import { PracticeSettingsForm } from "@/app/(staff)/(clinic-portal)/practice/practice-settings-form";
import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { isClinicAssetStorageConfigured } from "@/lib/clinic-assets/config";
import { resolveClinicLogoSrc } from "@/lib/clinic-assets/public-url";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { listPracticeMembers } from "@/lib/clinic-portal/list-practice-members";
import { getPrisma } from "@/lib/prisma";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Practice · ${PRODUCT_NAME}`,
  description: "Practice identity, branding, and contact settings.",
};

export default async function PracticePage() {
  const { clinicMembership } = await requireClinicAdmin();
  const [overview, profile, members] = await Promise.all([
    getClinicPortalOverview(clinicMembership.clinic.id),
    getPrisma().clinicProfile.findUnique({
      where: { clinicId: clinicMembership.clinic.id },
    }),
    listPracticeMembers(clinicMembership.clinic.id),
  ]);

  if (!overview) {
    notFound();
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-5xl">
      <header className="staffPracticeHeader">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Practice
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {overview.displayName}
        </h1>
        <p className="max-w-xl text-sm leading-6 text-staff-muted">
          Identity, branding, contact, and emergency details used on the patient
          site. Tenant hostname stays operator-controlled.
        </p>
      </header>
      <PracticeMembersSection
        clinicName={overview.displayName}
        rows={members}
      />
      <PracticeSettingsForm
        canEdit={
          clinicMembership.source === "operator_support" ||
          clinicMembership.role === ClinicMembershipRole.ADMIN
        }
        patientSiteHref={overview.patientSiteHref}
        storageAvailable={isClinicAssetStorageConfigured()}
        logoSrc={resolveClinicLogoSrc(profile?.logoUrl ?? null)}
        darkLogoSrc={resolveClinicLogoSrc(profile?.darkLogoUrl ?? null)}
        faviconSrc={resolveClinicLogoSrc(profile?.faviconUrl ?? null)}
        values={{
          displayName: profile?.displayName || overview.displayName,
          logoUrl: profile?.logoUrl ?? null,
          darkLogoUrl: profile?.darkLogoUrl ?? null,
          faviconUrl: profile?.faviconUrl ?? null,
          primaryColor: profile?.primaryColor ?? null,
          accentColor: profile?.accentColor ?? null,
          darkPrimaryColor: profile?.darkPrimaryColor ?? null,
          darkAccentColor: profile?.darkAccentColor ?? null,
          useCustomDarkBranding: profile?.useCustomDarkBranding ?? false,
          neutralColor: profile?.neutralColor ?? null,
          radiusPreset: profile?.radiusPreset ?? "MEDIUM",
          typeface: profile?.typeface ?? null,
          instructionTerminology:
            profile?.instructionTerminology ?? "AFTERCARE",
          themeMode: profile?.themeMode ?? "SYSTEM",
          allowPatientThemeToggle: profile?.allowPatientThemeToggle ?? false,
          phone: profile?.phone ?? null,
          contactUrl: profile?.contactUrl ?? null,
          addressLine1: profile?.addressLine1 ?? null,
          addressLine2: profile?.addressLine2 ?? null,
          city: profile?.city ?? null,
          region: profile?.region ?? null,
          postalCode: profile?.postalCode ?? null,
          emergencyInstructions: profile?.emergencyInstructions ?? null,
        }}
      />
    </div>
  );
}
