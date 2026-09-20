import { PatientThemeBoundary } from "@/app/(aftercare)/components/patient-theme-boundary";
import {
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import { clinicFontPresentation } from "@/lib/branding/clinic-fonts";
import {
  PATIENT_THEME_STORAGE_KEY,
  themePreferenceBootstrapScript,
} from "@/lib/branding/theme-preference";
import {
  aftercareTenantBrandMetadata,
  aftercareThemeFromProfile,
} from "@/lib/aftercare/tenant-metadata";
import { requireTenantClinic } from "@/lib/tenancy/require-tenant-clinic";

import type { Metadata } from "next";
import type { ReactNode } from "react";

interface TenantLayoutProps {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: TenantLayoutProps): Promise<Metadata> {
  const { tenant } = await params;
  const clinic = await requireTenantClinic(tenant);
  return aftercareTenantBrandMetadata(
    aftercareThemeFromProfile(clinic.profile)
  );
}

export default async function TenantLayout({
  children,
  params,
}: TenantLayoutProps) {
  const { tenant } = await params;
  const clinic = await requireTenantClinic(tenant);
  const theme = resolveAftercareTheme(clinic.profile);
  const font = clinicFontPresentation(clinic.profile?.typeface);
  const allowPatientThemeToggle =
    clinic.profile?.allowPatientThemeToggle === true;
  const ThemeControl = allowPatientThemeToggle
    ? (await import("@/app/(aftercare)/components/patient-theme-control"))
        .PatientThemeControl
    : null;

  return (
    <>
      {allowPatientThemeToggle ? (
        <script
          dangerouslySetInnerHTML={{
            __html: themePreferenceBootstrapScript(PATIENT_THEME_STORAGE_KEY),
          }}
        />
      ) : null}
      <style
        dangerouslySetInnerHTML={{
          __html: serializeAftercareThemeCss(theme, {
            themeMode: clinic.profile?.themeMode,
          }),
        }}
      />
      <PatientThemeBoundary
        themeMode={clinic.profile?.themeMode}
        fontClassName={font.className}
        fontCssVariable={font.cssVariable}
      >
        {ThemeControl ? (
          <div className="patientThemeSlot">
            <ThemeControl />
          </div>
        ) : null}
        {children}
      </PatientThemeBoundary>
    </>
  );
}
