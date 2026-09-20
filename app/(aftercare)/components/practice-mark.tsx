import type { PracticeChrome } from "@/lib/aftercare/practice-chrome";

import styles from "../patient.module.css";

export function PracticeMark({
  chrome,
  className,
}: {
  chrome: Pick<PracticeChrome, "logoSrc" | "darkLogoSrc" | "displayName">;
  className?: string;
}) {
  if (!chrome.logoSrc && !chrome.darkLogoSrc) {
    return null;
  }

  const lightSrc = chrome.logoSrc ?? chrome.darkLogoSrc;
  const darkSrc = chrome.darkLogoSrc;
  const showDarkAlternate = Boolean(
    lightSrc && darkSrc && darkSrc !== lightSrc
  );

  return (
    <span className={`${styles.logoStack} ${className ?? ""}`.trim()}>
      {lightSrc ? (
        <img
          className={`${styles.logo} ${styles.logoLight}`}
          src={lightSrc}
          alt=""
          width={44}
          height={44}
        />
      ) : null}
      {showDarkAlternate && darkSrc ? (
        <img
          className={`${styles.logo} ${styles.logoDark}`}
          src={darkSrc}
          alt=""
          width={44}
          height={44}
        />
      ) : null}
    </span>
  );
}
