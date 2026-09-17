import {
  MARKETING_DEMO_CALL_LABEL,
  MARKETING_DEMO_CLINIC_NAME,
  MARKETING_DEMO_GUIDE_HINT,
  MARKETING_DEMO_GUIDE_TITLE,
  MARKETING_DEMO_INSTRUCTIONS_LABEL,
  MARKETING_DEMO_THEME_APPEARANCE,
  MARKETING_DEMO_THEME_SCOPE,
} from "@/lib/marketing/demo-patient-preview";

import styles from "../marketing.module.css";

export function MarketingPatientPreview() {
  return (
    <div className={styles.previewStage}>
      <div
        className={styles.patientHomePreview}
        data-mk-patient-preview=""
        aria-hidden="true"
      >
        <p className={styles.patientViewKicker}>Patient view</p>
        <div
          className={`${styles.patientHomeCard} ${MARKETING_DEMO_THEME_SCOPE}`}
          data-patient-theme={MARKETING_DEMO_THEME_APPEARANCE}
          data-mk-patient-surface="home"
        >
          <p className={styles.patientHomeClinic} translate="no">
            {MARKETING_DEMO_CLINIC_NAME}
          </p>
          <p className={styles.patientHomeTerm}>
            {MARKETING_DEMO_INSTRUCTIONS_LABEL}
          </p>
          <p className={styles.patientHomeGuide}>
            <span className={styles.patientHomeGuideBody}>
              <span>{MARKETING_DEMO_GUIDE_TITLE}</span>
              <span className={styles.patientHomeHint}>
                {MARKETING_DEMO_GUIDE_HINT}
              </span>
            </span>
            <span className={styles.patientHomeArrow}>→</span>
          </p>
          <p className={styles.patientHomeContact}>
            {MARKETING_DEMO_CALL_LABEL}
          </p>
        </div>
      </div>
      <p className={styles.previewCaption}>
        No login, no feed — just the guidance patients need, with the clinic
        still one tap away.
      </p>
    </div>
  );
}
