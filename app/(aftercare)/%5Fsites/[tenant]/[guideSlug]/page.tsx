import { DemoToday } from "@/app/(aftercare)/components/demo-today";
import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { GuideTimeline } from "@/app/(aftercare)/components/guide-timeline";
import { PatientDemoExperience } from "@/app/(aftercare)/components/patient-demo-experience";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import {
  DEMO_RECOVERY_FIXTURE,
  isDemoPatientExperienceEnabled,
} from "@/lib/aftercare/demo-tenant";
import {
  buildDemoTodayContent,
  resolveDemoRecoveryState,
  timelineStatusByKey,
} from "@/lib/aftercare/demo-recovery-state";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { instructionLabel } from "@/lib/aftercare/instruction-terminology";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";
import { timelineSectionsOf } from "@/lib/aftercare/section-body";
import {
  aftercarePageMetadata,
  publicTenantCanonicalUrl,
  tenantGuideDescription,
  tenantGuideDocumentTitle,
} from "@/lib/aftercare/tenant-metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import styles from "../../../patient.module.css";

interface TenantGuidePageProps {
  params: Promise<{ tenant: string; guideSlug: string }>;
}

export async function generateMetadata({
  params,
}: TenantGuidePageProps): Promise<Metadata> {
  const { tenant, guideSlug } = await params;
  const document = await getPublishedPracticeGuide({
    clinicSlug: tenant,
    publicSlug: guideSlug,
  });

  if (!document) {
    return aftercarePageMetadata({
      title: instructionLabel(null),
      description: "Patient aftercare instructions.",
    });
  }

  const displayName = document.profile?.displayName ?? document.clinic.name;

  return aftercarePageMetadata({
    title: tenantGuideDocumentTitle(
      document.title,
      displayName,
      document.profile?.instructionTerminology
    ),
    description: tenantGuideDescription(
      document.title,
      displayName,
      document.profile?.instructionTerminology
    ),
    siteName: displayName,
    canonicalUrl: await publicTenantCanonicalUrl(
      `/${document.practiceGuide.publicSlug}`
    ),
    faviconUrl: document.profile?.faviconUrl,
    theme: document.profile,
  });
}

export default async function TenantGuidePage({
  params,
}: TenantGuidePageProps) {
  const { tenant, guideSlug } = await params;
  const document = await getPublishedPracticeGuide({
    clinicSlug: tenant,
    publicSlug: guideSlug,
  });

  if (!document) {
    notFound();
  }

  const chrome = resolvePracticeChrome({
    slug: document.clinic.slug,
    name: document.clinic.name,
    profile: document.profile,
  });
  const demoEnabled = isDemoPatientExperienceEnabled(document.clinic.slug);
  const recovery = resolveDemoRecoveryState(
    document.sections,
    DEMO_RECOVERY_FIXTURE
  );
  const today = buildDemoTodayContent(document.sections, recovery);
  const timelineSections = timelineSectionsOf(document.sections);
  const printHref = `/${document.practiceGuide.publicSlug}/print`;

  return (
    <PatientPage chrome={chrome} showAftercareDisclaimer>
      <header className={styles.hero}>
        <p className={styles.kicker}>{chrome.instructionsLabel}</p>
        <h1 className={styles.title}>{document.title}</h1>
        <p className={styles.lede}>
          {demoEnabled
            ? `What matters today in your recovery from ${chrome.displayName}.`
            : `Recovery information from ${chrome.displayName}. Read the sections below in order, and contact the practice if you are unsure or need help.`}
        </p>
      </header>
      {demoEnabled ? (
        <PatientDemoExperience
          printHref={printHref}
          today={
            recovery.hasTimeline ? (
              <DemoToday
                recovery={recovery}
                today={today}
                clinicName={chrome.displayName}
                phoneHref={chrome.phoneHref}
                phoneDisplay={chrome.phoneDisplay}
              />
            ) : (
              <GuideDocument sections={document.sections} />
            )
          }
          timeline={
            recovery.hasTimeline ? (
              <DemoTimeline recovery={recovery} sections={timelineSections} />
            ) : (
              <p className={styles.empty}>
                This guide does not include a recovery timeline.
              </p>
            )
          }
        />
      ) : (
        <GuideDocument sections={document.sections} />
      )}
    </PatientPage>
  );
}

function DemoTimeline({
  recovery,
  sections,
}: {
  recovery: ReturnType<typeof resolveDemoRecoveryState>;
  sections: ReturnType<typeof timelineSectionsOf>;
}) {
  const progressPercent =
    recovery.progress === null ? null : Math.round(recovery.progress * 100);

  return (
    <div>
      <section
        className={styles.todayFocus}
        aria-labelledby="timeline-window-heading"
      >
        <p className={styles.kicker}>Recovery window</p>
        <h2 id="timeline-window-heading" className={styles.todayDay}>
          Day {recovery.simulatedDay} of {recovery.windowDays}
        </h2>
        {recovery.currentStage ? (
          <p className={styles.todayStage}>
            Current stage · {recovery.currentStage.title}
          </p>
        ) : null}
        {progressPercent !== null ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label={`Recovery day ${recovery.simulatedDay} of ${recovery.windowDays}`}
            aria-valuemin={0}
            aria-valuemax={recovery.windowDays}
            aria-valuenow={recovery.simulatedDay}
          >
            <span
              className={styles.progressFill}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        ) : null}
      </section>
      <GuideTimeline
        sections={sections}
        stageStatusByKey={timelineStatusByKey(recovery)}
        heading="Recovery overview"
        headingId="recovery-overview-heading"
      />
    </div>
  );
}
