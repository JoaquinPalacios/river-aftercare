import {
  PATIENT_AFTERCARE_DISCLAIMER_HEADING,
  patientAftercareDisclaimerBody,
} from "@/lib/aftercare/patient-aftercare-disclaimer";

import styles from "../patient.module.css";

export function PatientAftercareDisclaimer({
  practiceName,
  showContactFollowUp,
}: {
  practiceName: string;
  showContactFollowUp: boolean;
}) {
  const name = practiceName.trim();
  if (!name) {
    return null;
  }

  return (
    <section
      className={styles.disclaimer}
      aria-labelledby="patient-aftercare-disclaimer-heading"
    >
      <h2
        id="patient-aftercare-disclaimer-heading"
        className={styles.disclaimerTitle}
      >
        {PATIENT_AFTERCARE_DISCLAIMER_HEADING}
      </h2>
      <p className={styles.disclaimerCopy}>
        {patientAftercareDisclaimerBody(name, {
          includeContactFollowUp: showContactFollowUp,
        })}
      </p>
    </section>
  );
}
