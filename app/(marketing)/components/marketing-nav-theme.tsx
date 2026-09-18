"use client";

import { useEffect, useId, useState } from "react";

import {
  applyThemePreference,
  MARKETING_THEME_STORAGE_KEY,
  parseThemePreference,
  type ThemePreference,
} from "@/lib/branding/theme-preference";

import styles from "../marketing.module.css";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function MarketingNavTheme() {
  const chooserId = useId().replace(/:/g, "");
  const labelId = `mk-theme-label-${chooserId}`;
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = parseThemePreference(
      localStorage.getItem(MARKETING_THEME_STORAGE_KEY)
    );
    if (stored) {
      setPreference(stored);
    }
  }, []);

  function selectPreference(next: ThemePreference) {
    setPreference(next);
    applyThemePreference(next);
    localStorage.setItem(MARKETING_THEME_STORAGE_KEY, next);
  }

  return (
    <div className={styles.navMenuTheme}>
      <p className={styles.navMenuThemeLabel} id={labelId}>
        Theme
      </p>
      <div
        id={`mk-theme-${chooserId}`}
        role="radiogroup"
        aria-labelledby={labelId}
        className={styles.navMenuChooser}
      >
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={styles.navMenuThemeOption}
              onClick={() => selectPreference(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
