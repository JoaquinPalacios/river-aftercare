import {
  hasPracticeContact,
  hasRenderedWebPracticeContactChannel,
  type PracticeChrome,
} from "@/lib/aftercare/practice-chrome";

import styles from "../patient.module.css";

export function PracticeContact({ chrome }: { chrome: PracticeChrome }) {
  if (!hasPracticeContact(chrome)) {
    return null;
  }

  return (
    <section
      className={styles.contact}
      aria-labelledby="practice-contact-heading"
    >
      <h2 id="practice-contact-heading" className={styles.contactTitle}>
        Contact {chrome.displayName}
      </h2>
      <p className={styles.contactCopy}>Questions about your recovery?</p>
      {hasRenderedWebPracticeContactChannel(chrome) ? (
        <div className={styles.actions}>
          {chrome.phoneHref ? (
            <a
              className={`${styles.action} ${styles.primary}`}
              href={chrome.phoneHref}
            >
              Call {chrome.displayName}
            </a>
          ) : null}
          {chrome.contactHref ? (
            <a
              className={`${styles.action} ${styles.secondary}`}
              href={chrome.contactHref}
            >
              Practice contact page
            </a>
          ) : null}
        </div>
      ) : null}
      {chrome.emergencyInstructions ? (
        <div className={styles.urgent}>
          <h3 className={styles.urgentTitle}>If you need urgent help</h3>
          <p className={styles.body}>{chrome.emergencyInstructions}</p>
        </div>
      ) : null}
    </section>
  );
}
