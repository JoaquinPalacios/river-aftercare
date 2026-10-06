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
import { RETIRED_TENANT_MESSAGE } from "@/lib/aftercare/retired-tenant-http";
import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { resolveInactiveSourceLocationRedirect } from "@/lib/aftercare/patient-location-redirect";
import { isRetiredPublicTenantLabel } from "@/lib/clinics/retired-tenant-slug";
import {
  aftercareTenantBrandMetadata,
  aftercareThemeFromProfile,
  clinicThemeColorViewport,
} from "@/lib/aftercare/tenant-metadata";

import type { Metadata, Viewport } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";

interface TenantLayoutProps {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Active public tenants render as today. A permanently retired hostname shows
 * generic copy and no clinic identity. When resolution fails, an exact
 * retired-location redirect may still 308. Every other path 404s, including a
 * reversibly deactivated clinic. The source site is not rendered.
 */
async function loadTenantClinic(tenant: string) {
  const clinic = await getClinicBySlug(tenant);
  if (clinic) {
    return clinic;
  }
  if (await isRetiredPublicTenantLabel(tenant)) {
    return "retired" as const;
  }
  const href = await resolveInactiveSourceLocationRedirect(tenant);
  if (href) {
    permanentRedirect(href);
  }
  notFound();
}

function retiredTenantMetadata(): Metadata {
  return {
    title: "Aftercare",
    robots: { index: false, follow: false },
  };
}

export async function generateMetadata({
  params,
}: TenantLayoutProps): Promise<Metadata> {
  const { tenant } = await params;
  const clinic = await loadTenantClinic(tenant);
  if (clinic === "retired") {
    return retiredTenantMetadata();
  }
  return aftercareTenantBrandMetadata(
    aftercareThemeFromProfile(clinic.profile)
  );
}

export async function generateViewport({
  params,
}: TenantLayoutProps): Promise<Viewport> {
  const { tenant } = await params;
  const clinic = await loadTenantClinic(tenant);
  if (clinic === "retired") {
    return {};
  }
  return clinicThemeColorViewport(aftercareThemeFromProfile(clinic.profile));
}

export default async function TenantLayout({
  children,
  params,
}: TenantLayoutProps) {
  const { tenant } = await params;
  const clinic = await loadTenantClinic(tenant);
  if (clinic === "retired") {
    return (
      <main>
        <p>{RETIRED_TENANT_MESSAGE}</p>
      </main>
    );
  }
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
