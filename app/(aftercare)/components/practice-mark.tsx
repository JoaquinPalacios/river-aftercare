import type { PracticeChrome } from "@/lib/aftercare/practice-chrome";
import { resolvePatientThemeLogos } from "@/lib/branding/clinic-logo-theme";

import styles from "../patient.module.css";

export function PracticeMark({
  chrome,
  className,
}: {
  chrome: Pick<PracticeChrome, "logoSrc" | "darkLogoSrc" | "displayName">;
  className?: string;
}) {
  const { lightSrc, darkSrc } = resolvePatientThemeLogos(chrome);
  if (!lightSrc) {
    return null;
  }

  return (
    <span className={`${styles.logoStack} ${className ?? ""}`.trim()}>
      <img
        className={`${styles.logo} ${styles.logoLight}`}
        src={lightSrc}
        alt=""
        width={44}
        height={44}
      />
      {darkSrc ? (
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
