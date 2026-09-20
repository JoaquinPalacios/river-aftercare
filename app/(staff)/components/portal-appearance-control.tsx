"use client";

import { useEffect, useId, useState } from "react";

import {
  applyThemePreference,
  parseThemePreference,
  PORTAL_THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/branding/theme-preference";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function PortalAppearanceControl() {
  const chooserId = useId().replace(/:/g, "");
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = parseThemePreference(
      localStorage.getItem(PORTAL_THEME_STORAGE_KEY)
    );
    const fromDom = parseThemePreference(
      document.documentElement.getAttribute("data-theme-mode")
    );
    if (stored) {
      setPreference(stored);
      return;
    }
    if (fromDom) {
      setPreference(fromDom);
    }
  }, []);

  const currentLabel =
    OPTIONS.find((option) => option.value === preference)?.label ?? "System";

  function selectPreference(next: ThemePreference) {
    setPreference(next);
    localStorage.setItem(PORTAL_THEME_STORAGE_KEY, next);
    setExpanded(false);
    void applyThemePreference(next, { productCookie: true });
  }

  return (
    <div className="ptl">
      <button
        type="button"
        className="ptlBtn"
        aria-expanded={expanded}
        aria-controls={`portal-theme-${chooserId}`}
        aria-label={`Appearance, colour theme currently ${currentLabel}`}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>Appearance</span>
        <span>{currentLabel}</span>
      </button>
      {expanded ? (
        <div
          id={`portal-theme-${chooserId}`}
          role="radiogroup"
          aria-label="Colour theme"
          className="ptlChooser"
        >
          {OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className="ptlOption"
                onClick={() => selectPreference(option.value)}
              >
                <span>{option.label}</span>
                {selected ? <span aria-hidden="true">Selected</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
