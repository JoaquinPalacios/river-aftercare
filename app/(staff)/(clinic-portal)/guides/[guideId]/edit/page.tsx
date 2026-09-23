import type { Metadata } from "next";
import { ClinicMembershipRole } from "@prisma/client";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { GuideEditor } from "@/app/(staff)/(clinic-portal)/guides/guide-editor";
import { TemplateAdaptationPanel } from "@/app/(staff)/(clinic-portal)/guides/template-adaptation-panel";
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
import { loadGuideAllowance } from "@/lib/entitlements/guide-usage";
import {
  marketingContactHref,
  marketingPublicLinks,
} from "@/lib/marketing/public-links";
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
    const [guide, clinic, allowance, links] = await Promise.all([
      loadPracticeGuideEditor({
        clinicId: clinicMembership.clinic.id,
        guideId,
      }),
      getPrisma().clinic.findUnique({
        where: { id: clinicMembership.clinic.id },
        select: { profile: true },
      }),
      loadGuideAllowance(clinicMembership.clinic.id),
      marketingPublicLinks(),
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
        {guide.template && allowance.governed ? (
          <div className="mx-auto w-full min-w-0 max-w-5xl">
            <TemplateAdaptationPanel
              guideId={guide.id}
              contactHref={marketingContactHref(links)}
              limitMessage={allowance.limitMessage}
              mode={
                allowance.canAdaptRiverTemplates
                  ? allowance.atLimit
                    ? "practice_full"
                    : "practice"
                  : "essential"
              }
            />
          </div>
        ) : null}
        <GuideEditor
          guide={guide}
          patientUrlExample={patientUrlExample}
          canEdit={
            clinicMembership.source === "operator_support" ||
            clinicMembership.role === ClinicMembershipRole.ADMIN
          }
          requiresReviewAttestation={!isDemoTenant(overview?.slug ?? "")}
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
