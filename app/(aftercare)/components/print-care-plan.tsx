import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { PatientAftercareDisclaimer } from "@/app/(aftercare)/components/patient-aftercare-disclaimer";
import { PoweredByAftercareGuide } from "@/app/(aftercare)/components/powered-by-aftercare-guide";
import { PrintTrigger } from "@/app/(aftercare)/components/print-trigger";
import { DEMO_PRINT_SAMPLE_NOTICE } from "@/lib/aftercare/demo-tenant";
import { canRenderPatientAftercareDisclaimer } from "@/lib/aftercare/patient-aftercare-disclaimer";
import {
  hasPracticeContact,
  hasRenderedPrintPracticeContactDetails,
  type PracticeChrome,
} from "@/lib/aftercare/practice-chrome";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

import styles from "../patient.module.css";

export function PrintableGuide({
  chrome,
  procedureTitle,
  instructionsLabel,
  sections,
  showDemoSample,
  guideHref,
}: {
  chrome: PracticeChrome;
  procedureTitle: string;
  instructionsLabel: string;
  sections: ComposedGuideSection[];
  showDemoSample: boolean;
  guideHref: string;
}) {
  return (
    <article
      className={`${styles.page} ${styles.printPage}`}
      data-print-guide=""
    >
      {showDemoSample ? (
        <p className={styles.printSample}>{DEMO_PRINT_SAMPLE_NOTICE}</p>
      ) : null}
      <header className={styles.printHeader}>
        <div className={styles.printBrand}>
          {chrome.logoSrc ? (
            <img
              className={styles.logo}
              src={chrome.logoSrc}
              alt=""
              width={44}
              height={44}
            />
          ) : null}
          <p className={styles.printClinic}>{chrome.displayName}</p>
        </div>
        <p className={styles.kicker}>{instructionsLabel}</p>
        <h1 className={styles.title}>{procedureTitle}</h1>
        <p className={`${styles.lede} ${styles.printIntro}`}>
          Recovery guide from {chrome.displayName}. Use your browser’s Print or
          Save as PDF. This page uses the same recovery information as the web
          guide.
        </p>
        <div className={styles.printActions}>
          <PrintTrigger label="Print / Save PDF" />
          <a
            className={`${styles.action} ${styles.secondary} ${styles.printHide}`}
            href={guideHref}
          >
            Back to guide
          </a>
        </div>
      </header>
      <GuideDocument sections={sections} />
      {canRenderPatientAftercareDisclaimer({
        isDemoTenant: chrome.showDemoNotice,
        practiceName: chrome.displayName,
      }) ? (
        <PatientAftercareDisclaimer
          practiceName={chrome.displayName}
          showContactFollowUp={hasRenderedPrintPracticeContactDetails(chrome)}
        />
      ) : null}
      <PrintPracticeDetails chrome={chrome} />
      {chrome.showCareGuideAttribution ? (
        <footer className={styles.footer}>
          <PoweredByAftercareGuide />
        </footer>
      ) : null}
    </article>
  );
}

function PrintPracticeDetails({ chrome }: { chrome: PracticeChrome }) {
  if (!hasPracticeContact(chrome)) {
    return null;
  }

  return (
    <section
      className={styles.printContact}
      aria-labelledby="print-practice-contact-heading"
    >
      <h2 id="print-practice-contact-heading" className={styles.contactTitle}>
        Contact {chrome.displayName}
      </h2>
      {chrome.phoneDisplay ? (
        <p className={styles.printContactLine}>Phone {chrome.phoneDisplay}</p>
      ) : null}
      {chrome.addressText ? (
        <p className={styles.printContactLine}>{chrome.addressText}</p>
      ) : null}
      {chrome.emergencyInstructions ? (
        <div className={styles.printUrgent}>
          <h3 className={styles.urgentTitle}>If you need urgent help</h3>
          <p className={styles.body}>{chrome.emergencyInstructions}</p>
        </div>
      ) : null}
    </section>
  );
}
