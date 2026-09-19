import type { Metadata } from "next";
import { ClinicMembershipRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import { StaffPreviewShell } from "@/app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-shell";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import {
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import { clinicFontPresentation } from "@/lib/branding/clinic-fonts";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { loadPracticeGuideEditor } from "@/lib/clinic-portal/load-practice-guide-editor";
import { staffPreviewBackLabel } from "@/lib/clinic-portal/preview-back-label";
import { getPrisma } from "@/lib/prisma";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

import styles from "@/app/(aftercare)/patient.module.css";

interface GuidePreviewPageProps {
  params: Promise<{ guideId: string }>;
}

export const metadata: Metadata = {
  title: `Draft preview · ${PRODUCT_NAME}`,
  robots: PRIVATE_ROBOTS,
};

export default async function GuidePreviewPage({
  params,
}: GuidePreviewPageProps) {
  const { guideId } = await params;
  const { clinicMembership } = await requireStaffSession();
  const canEdit = clinicMembership.role === ClinicMembershipRole.ADMIN;

  try {
    const [guide, clinic] = await Promise.all([
      loadPracticeGuideEditor({
        clinicId: clinicMembership.clinic.id,
        guideId,
      }),
      getPrisma().clinic.findUnique({
        where: { id: clinicMembership.clinic.id },
        select: {
          slug: true,
          name: true,
          profile: true,
        },
      }),
    ]);

    if (!clinic) {
      notFound();
    }

    const chrome = resolvePracticeChrome({
      slug: clinic.slug,
      name: clinic.name,
      profile: clinic.profile,
    });
    const theme = resolveAftercareTheme(clinic.profile);
    const font = clinicFontPresentation(clinic.profile?.typeface);

    return (
      <>
        <style
          dangerouslySetInnerHTML={{
            __html: serializeAftercareThemeCss(theme, {
              themeMode: clinic.profile?.themeMode,
              colorSchemeSelector: "scope",
            }),
          }}
        />
        <StaffPreviewShell
          backHref={canEdit ? `/guides/${guide.id}/edit` : "/guides"}
          backLabel={staffPreviewBackLabel({
            canEdit,
            guideTitle: guide.title,
          })}
          editHref={canEdit ? `/guides/${guide.id}/edit` : undefined}
          lifecycle={guide.lifecycle}
          clinicThemeMode={clinic.profile?.themeMode}
          fontClassName={font.className}
          fontCssVariable={font.cssVariable}
        >
          <PatientPage chrome={chrome}>
            <header className={styles.hero}>
              <p className={styles.kicker}>{chrome.instructionsLabel}</p>
              <h1 className={styles.title}>{guide.title}</h1>
              <p className={styles.lede}>
                {guide.introduction?.trim() ||
                  `Recovery information from ${chrome.displayName}. Read the sections below in order, and contact the practice if you are unsure or need help.`}
              </p>
            </header>
            <GuideDocument sections={guide.sections} />
          </PatientPage>
        </StaffPreviewShell>
      </>
    );
  } catch (error) {
    if (isClinicPortalError(error) && error.code === "not_found") {
      notFound();
    }
    throw error;
  }
}
