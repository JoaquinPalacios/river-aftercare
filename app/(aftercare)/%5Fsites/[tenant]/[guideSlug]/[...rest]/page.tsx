import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import { PrintableGuide } from "@/app/(aftercare)/components/print-care-plan";
import { isDemoPatientExperienceEnabled } from "@/lib/aftercare/demo-tenant";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { instructionLabel } from "@/lib/aftercare/instruction-terminology";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";
import {
  aftercarePageMetadata,
  publicTenantCanonicalUrl,
  tenantGuideDescription,
  tenantGuideDocumentTitle,
} from "@/lib/aftercare/tenant-metadata";

import styles from "../../../../patient.module.css";

interface NestedLocationPageProps {
  params: Promise<{ tenant: string; guideSlug: string; rest: string[] }>;
}

function locationGuidePath(rest: string[]): {
  locationSlug: string;
  guideSlug: string;
  print: boolean;
} | null {
  const [guideSlug, extra, ...more] = rest;
  if (!guideSlug || more.length > 0) {
    return null;
  }
  if (!extra) {
    return { locationSlug: "", guideSlug, print: false };
  }
  if (extra === "print") {
    return { locationSlug: "", guideSlug, print: true };
  }
  return null;
}

async function loadNestedGuide(
  tenant: string,
  locationSlug: string,
  rest: string[]
) {
  const path = locationGuidePath(rest);
  if (!path) {
    return null;
  }
  const document = await getPublishedPracticeGuide({
    clinicSlug: tenant,
    locationSlug,
    publicSlug: path.guideSlug,
  });
  if (!document) {
    return null;
  }
  return { document, print: path.print };
}

export async function generateMetadata({
  params,
}: NestedLocationPageProps): Promise<Metadata> {
  const { tenant, guideSlug, rest } = await params;
  const loaded = await loadNestedGuide(tenant, guideSlug, rest);
  if (!loaded) {
    return aftercarePageMetadata({
      title: instructionLabel(null),
      description: "Patient aftercare instructions.",
    });
  }
  const { document } = loaded;
  const displayName = document.profile?.displayName ?? document.clinic.name;
  const place = document.placeName ? ` · ${document.placeName}` : "";
  return aftercarePageMetadata({
    title: tenantGuideDocumentTitle(
      document.title,
      `${displayName}${place}`,
      document.profile?.instructionTerminology
    ),
    description: tenantGuideDescription(
      document.title,
      displayName,
      document.profile?.instructionTerminology
    ),
    siteName: displayName,
    canonicalUrl: await publicTenantCanonicalUrl(
      `/${guideSlug}/${document.practiceGuide.publicSlug}`
    ),
    faviconUrl: document.profile?.faviconUrl,
    theme: document.profile,
  });
}

export default async function NestedLocationPage({
  params,
}: NestedLocationPageProps) {
  const { tenant, guideSlug, rest } = await params;
  const loaded = await loadNestedGuide(tenant, guideSlug, rest);
  if (!loaded) {
    notFound();
  }
  const { document, print } = loaded;
  const chrome = resolvePracticeChrome({
    slug: document.clinic.slug,
    name: document.clinic.name,
    profile: document.profile,
  });
  const guideHref = `/${guideSlug}/${document.practiceGuide.publicSlug}`;

  if (print) {
    return (
      <div className={styles.shell}>
        <PrintableGuide
          chrome={chrome}
          procedureTitle={document.title}
          instructionsLabel={chrome.instructionsLabel}
          sections={document.sections}
          showDemoSample={isDemoPatientExperienceEnabled(document.clinic.slug)}
          guideHref={guideHref}
        />
      </div>
    );
  }

  return (
    <PatientPage chrome={chrome} showAftercareDisclaimer>
      <header className={styles.hero}>
        <p className={styles.kicker}>
          {document.placeName
            ? `${chrome.instructionsLabel} · ${document.placeName}`
            : chrome.instructionsLabel}
        </p>
        <h1 className={styles.title}>{document.title}</h1>
        <p className={styles.lede}>
          Recovery information from {chrome.displayName}
          {document.placeName ? ` at ${document.placeName}` : ""}. Read the
          sections below in order, and contact the practice if you are unsure or
          need help.
        </p>
      </header>
      <GuideDocument sections={document.sections} />
    </PatientPage>
  );
}
