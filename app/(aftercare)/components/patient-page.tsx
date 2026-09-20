import type { ReactNode } from "react";

import { DemoAftercareNotice } from "@/app/(aftercare)/components/demo-aftercare-notice";
import { PatientAftercareDisclaimer } from "@/app/(aftercare)/components/patient-aftercare-disclaimer";
import { PoweredByAftercareGuide } from "@/app/(aftercare)/components/powered-by-aftercare-guide";
import { PracticeContact } from "@/app/(aftercare)/components/practice-contact";
import { PracticeHeader } from "@/app/(aftercare)/components/practice-header";
import { canRenderPatientAftercareDisclaimer } from "@/lib/aftercare/patient-aftercare-disclaimer";
import {
  hasPracticeContact,
  type PracticeChrome,
} from "@/lib/aftercare/practice-chrome";

import styles from "../patient.module.css";

export function PatientPage({
  chrome,
  children,
  showAftercareDisclaimer = false,
}: {
  chrome: PracticeChrome;
  children: ReactNode;
  showAftercareDisclaimer?: boolean;
}) {
  const renderDisclaimer =
    showAftercareDisclaimer &&
    canRenderPatientAftercareDisclaimer({
      isDemoTenant: chrome.showDemoNotice,
      practiceName: chrome.displayName,
    });

  return (
    <div className={styles.page}>
      <PracticeHeader chrome={chrome} />
      <main className={`${styles.main} ${styles.shell}`}>
        {chrome.showDemoNotice ? <DemoAftercareNotice /> : null}
        {children}
        {renderDisclaimer ? (
          <PatientAftercareDisclaimer
            practiceName={chrome.displayName}
            showContactFollowUp={hasPracticeContact(chrome)}
          />
        ) : null}
        <PracticeContact chrome={chrome} />
      </main>
      {chrome.showCareGuideAttribution ? (
        <footer className={`${styles.footer} ${styles.shell}`}>
          <PoweredByAftercareGuide />
        </footer>
      ) : null}
    </div>
  );
}
