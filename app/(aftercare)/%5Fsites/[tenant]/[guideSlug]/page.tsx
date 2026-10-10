import { DemoToday } from "@/app/(aftercare)/components/demo-today";
import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { GuideTimeline } from "@/app/(aftercare)/components/guide-timeline";
import { PatientDemoExperience } from "@/app/(aftercare)/components/patient-demo-experience";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import {
  DEMO_RECOVERY_FIXTURE,
  isDemoPatientExperienceEnabled,
} from "@/lib/aftercare/demo-tenant";
import { demoPatientViewIds } from "@/lib/aftercare/demo-patient-presentation";
import {
  buildDemoTodayContent,
  resolveDemoRecoveryState,
  timelineStatusByKey,
} from "@/lib/aftercare/demo-recovery-state";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { listPublishedLocationGuides } from "@/lib/aftercare/list-published-location-guides";
import { resolveRetiredLocationRedirectHref } from "@/lib/aftercare/patient-location-redirect";
import { GuideList } from "@/app/(aftercare)/components/guide-list";
import {
  instructionLabel,
  patientFacingGuideLede,
  patientIndexLede,
} from "@/lib/aftercare/instruction-terminology";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";
import { timelineSectionsOf } from "@/lib/aftercare/section-body";
import {
  aftercarePageMetadata,
  publicTenantCanonicalUrl,
  tenantGuideDescription,
  tenantGuideDocumentTitle,
} from "@/lib/aftercare/tenant-metadata";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import styles from "../../../patient.module.css";

interface TenantGuidePageProps {
  params: Promise<{ tenant: string; guideSlug: string }>;
}

async function redirectRetiredLocationLanding(
  tenant: string,
  fromSlug: string
): Promise<void> {
  const href = await resolveRetiredLocationRedirectHref({
    sourceSiteSlug: tenant,
    fromSlug,
    path: { kind: "landing" },
  });
  if (href) {
    permanentRedirect(href);
  }
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
    const locationHome = await listPublishedLocationGuides({
      siteSlug: tenant,
      locationSlug: guideSlug,
    });
    if (!locationHome) {
      await redirectRetiredLocationLanding(tenant, guideSlug);
      return aftercarePageMetadata({
        title: instructionLabel(null),
        description: "Patient aftercare instructions.",
      });
    }
    const displayName =
      locationHome.profile.displayName ?? locationHome.clinic.name;
    return aftercarePageMetadata({
      title: `${locationHome.placeName} · ${displayName}`,
      description: `${instructionLabel(locationHome.profile.instructionTerminology)} from ${displayName} at ${locationHome.placeName}.`,
      siteName: displayName,
      canonicalUrl: await publicTenantCanonicalUrl(
        `/${locationHome.locationSlug}`
      ),
      faviconUrl: locationHome.profile.faviconUrl,
      theme: locationHome.profile,
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
    const locationHome = await listPublishedLocationGuides({
      siteSlug: tenant,
      locationSlug: guideSlug,
    });
    if (!locationHome) {
      await redirectRetiredLocationLanding(tenant, guideSlug);
      notFound();
    }
    const chrome = resolvePracticeChrome({
      slug: locationHome.clinic.slug,
      name: locationHome.clinic.name,
      profile: locationHome.profile,
    });
    return (
      <PatientPage chrome={chrome}>
        <header className={styles.hero}>
          <h1 className={styles.title}>{chrome.displayName}</h1>
          <p className={styles.kicker}>{locationHome.placeName}</p>
          <p className={styles.lede}>
            {patientIndexLede({
              instructionsLabel: chrome.instructionsLabel,
              practiceName: chrome.displayName,
              placeName: locationHome.placeName,
            })}
          </p>
        </header>
        <GuideList
          guides={locationHome.guides}
          instructionsLabel={chrome.instructionsLabel}
        />
      </PatientPage>
    );
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
          {patientFacingGuideLede({
            clinicSlug: document.clinic.slug,
            clinicName: chrome.displayName,
            hasTimeline: recovery.hasTimeline,
          })}
        </p>
      </header>
      {demoEnabled ? (
        <PatientDemoExperience
          printHref={printHref}
          views={
            demoPatientViewIds(recovery.hasTimeline)[0] === "today"
              ? [
                  {
                    id: "today",
                    label: "Today",
                    content: (
                      <DemoToday
                        recovery={recovery}
                        today={today}
                        clinicName={chrome.displayName}
                        phoneHref={chrome.phoneHref}
                        phoneDisplay={chrome.phoneDisplay}
                      />
                    ),
                  },
                  {
                    id: "timeline",
                    label: "Timeline",
                    content: (
                      <DemoTimeline
                        recovery={recovery}
                        sections={timelineSections}
                      />
                    ),
                  },
                  {
                    id: "full-guide",
                    label: "Full guide",
                    content: <GuideDocument sections={document.sections} />,
                  },
                ]
              : [
                  {
                    id: "guide",
                    label: "Full guide",
                    content: <GuideDocument sections={document.sections} />,
                  },
                ]
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
        headingIdPrefix="overview"
      />
    </div>
  );
}
