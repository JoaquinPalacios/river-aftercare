import type { Metadata } from "next";
import { notFound } from "next/navigation";

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

interface TenantGuidePrintPageProps {
  params: Promise<{ tenant: string; guideSlug: string }>;
}

export async function generateMetadata({
  params,
}: TenantGuidePrintPageProps): Promise<Metadata> {
  const { tenant, guideSlug } = await params;
  const document = await getPublishedPracticeGuide({
    clinicSlug: tenant,
    publicSlug: guideSlug,
  });

  if (!document) {
    return aftercarePageMetadata({
      title: instructionLabel(null),
      description: "Printable aftercare recovery guide.",
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

export default async function TenantGuidePrintPage({
  params,
}: TenantGuidePrintPageProps) {
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

  return (
    <div className={styles.shell}>
      <PrintableGuide
        chrome={chrome}
        procedureTitle={document.title}
        instructionsLabel={chrome.instructionsLabel}
        sections={document.sections}
        showDemoSample={isDemoPatientExperienceEnabled(document.clinic.slug)}
        guideHref={`/${document.practiceGuide.publicSlug}`}
      />
    </div>
  );
}
