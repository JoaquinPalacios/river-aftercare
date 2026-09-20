import type { PracticeChrome } from "@/lib/aftercare/practice-chrome";
import { PracticeMark } from "@/app/(aftercare)/components/practice-mark";

import styles from "../patient.module.css";

export function PracticeHeader({ chrome }: { chrome: PracticeChrome }) {
  return (
    <header className={styles.header}>
      <div className={`${styles.headerInner} ${styles.shell}`}>
        <a href="/" className={styles.brand}>
          <PracticeMark chrome={chrome} />
          <span className={styles.name}>{chrome.displayName}</span>
        </a>
        {chrome.allowPatientThemeToggle ? (
          <span className={styles.themeSpacer} aria-hidden="true" />
        ) : null}
      </div>
    </header>
  );
}
