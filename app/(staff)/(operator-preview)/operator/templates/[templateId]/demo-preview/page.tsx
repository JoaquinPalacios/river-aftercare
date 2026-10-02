import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import { StaffPreviewShell } from "@/app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-shell";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";
import {
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { loadDesignatedDemoAdoption } from "@/lib/demo-adoption/load-designated-demo-adoption";
import { getPrisma } from "@/lib/prisma";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

import styles from "@/app/(aftercare)/patient.module.css";

export const metadata: Metadata = {
  title: `Demo preview · ${PRODUCT_NAME}`,
  robots: PRIVATE_ROBOTS,
};

export default async function DesignatedDemoPreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requirePlatformOperator();
  const { templateId } = await params;
  const adoption = await loadDesignatedDemoAdoption(templateId);
  if (!adoption) {
    notFound();
  }

  const clinic = await getPrisma().clinic.findUnique({
    where: { slug: adoption.clinicSlug },
    select: {
      name: true,
      slug: true,
      profile: true,
    },
  });
  const chrome = resolvePracticeChrome({
    slug: clinic?.slug ?? adoption.clinicSlug,
    name: clinic?.name ?? adoption.clinicName,
    profile: clinic?.profile ?? null,
  });
  const theme = resolveAftercareTheme(
    clinic?.profile
      ? {
          primaryColor: clinic.profile.primaryColor,
          accentColor: clinic.profile.accentColor,
          darkPrimaryColor: clinic.profile.darkPrimaryColor,
          darkAccentColor: clinic.profile.darkAccentColor,
          neutralColor: clinic.profile.neutralColor,
          useCustomDarkBranding: clinic.profile.useCustomDarkBranding,
          radiusPreset: clinic.profile.radiusPreset,
          themeMode: clinic.profile.themeMode,
        }
      : null
  );

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: serializeAftercareThemeCss(theme, {
            themeMode: clinic?.profile?.themeMode ?? "SYSTEM",
            colorSchemeSelector: "scope",
          }),
        }}
      />
      <StaffPreviewShell
        backHref={`/operator/templates/${templateId}`}
        backLabel="Back to template"
        statusLabel="Proposed demo"
        statusDetail={
          adoption.canUpdate
            ? `Sample revision ${adoption.latestPublishedRevisionVersion}`
            : "Cannot update"
        }
        clinicThemeMode={clinic?.profile?.themeMode ?? "SYSTEM"}
        printLabel="Print / Save as PDF"
        banner={
          <p className="templatePreviewBrandNote">
            This preview composes the latest published sample revision with the
            demo&apos;s recorded overrides. It does not update the live demo.
          </p>
        }
      >
        {adoption.canUpdate ? (
          <PatientPage chrome={chrome} showAftercareDisclaimer>
            <header className={styles.hero}>
              <p className={styles.kicker}>{chrome.instructionsLabel}</p>
              <h1 className={styles.title}>Proposed demo guide</h1>
              <p className={styles.lede}>
                Recovery information from {chrome.displayName}, composed from
                sample revision {adoption.latestPublishedRevisionVersion}.
              </p>
            </header>
            <GuideDocument sections={adoption.proposedSections} />
          </PatientPage>
        ) : (
          <p className={styles.body}>{adoption.blocker}</p>
        )}
      </StaffPreviewShell>
    </>
  );
}
