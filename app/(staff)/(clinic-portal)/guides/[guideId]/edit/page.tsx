import type { Metadata } from "next";
import { ClinicMembershipRole } from "@prisma/client";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { GuideEditor } from "@/app/(staff)/(clinic-portal)/guides/guide-editor";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { loadPracticeGuideEditor } from "@/lib/clinic-portal/load-practice-guide-editor";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import {
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import { clinicFontPresentation } from "@/lib/branding/clinic-fonts";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { getPrisma } from "@/lib/prisma";

interface GuideEditPageProps {
  params: Promise<{ guideId: string }>;
}

export const metadata: Metadata = {
  title: `Edit guide · ${PRODUCT_NAME}`,
};

export default async function GuideEditPage({ params }: GuideEditPageProps) {
  const { guideId } = await params;
  const { clinicMembership } = await requireStaffSession();
  const overview = await getClinicPortalOverview(clinicMembership.clinic.id);

  try {
    const [guide, clinic] = await Promise.all([
      loadPracticeGuideEditor({
        clinicId: clinicMembership.clinic.id,
        guideId,
      }),
      getPrisma().clinic.findUnique({
        where: { id: clinicMembership.clinic.id },
        select: { profile: true },
      }),
    ]);
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "";
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    const theme = resolveAftercareTheme(clinic?.profile);
    const font = clinicFontPresentation(clinic?.profile?.typeface);
    const clinicSlug = overview?.slug;
    const patientUrlExample =
      (clinicSlug
        ? clinicPatientSiteUrl({
            requestHost: host,
            clinicSlug,
            protocol,
            pathname: `/${guide.publicSlug}`,
          })
        : null) ?? `/${guide.publicSlug}`;

    return (
      <>
        <style
          dangerouslySetInnerHTML={{
            __html: serializeAftercareThemeCss(theme, {
              themeMode: clinic?.profile?.themeMode,
              colorSchemeSelector: "scope",
            }),
          }}
        />
        <GuideEditor
          guide={guide}
          patientUrlExample={patientUrlExample}
          canEdit={clinicMembership.role === ClinicMembershipRole.ADMIN}
          clinicThemeMode={clinic?.profile?.themeMode}
          fontClassName={font.className}
          fontCssVariable={font.cssVariable}
        />
      </>
    );
  } catch (error) {
    if (isClinicPortalError(error) && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
}
