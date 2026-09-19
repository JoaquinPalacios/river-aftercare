import type { ReactNode } from "react";

import {
  AFTERCARE_THEME_SCOPE,
  clinicThemeModeToAppearance,
  type AftercareThemeAppearance,
} from "@/lib/branding/aftercare-theme";

export function PatientThemeBoundary({
  themeMode,
  appearance,
  fontClassName,
  fontCssVariable,
  children,
}: {
  themeMode?: string | null;
  appearance?: AftercareThemeAppearance | "portal";
  fontClassName?: string;
  fontCssVariable?: `--font-clinic-${string}` | null;
  children: ReactNode;
}) {
  const patientTheme = appearance ?? clinicThemeModeToAppearance(themeMode);
  const colorScheme =
    patientTheme === "portal"
      ? undefined
      : patientTheme === "light"
        ? "light"
        : patientTheme === "dark"
          ? "dark"
          : "light dark";
  const className = fontClassName
    ? `${AFTERCARE_THEME_SCOPE} ${fontClassName}`
    : AFTERCARE_THEME_SCOPE;
  const style = {
    ...(colorScheme ? { colorScheme } : {}),
    ...(fontCssVariable
      ? ({ "--cg-font-sans": `var(${fontCssVariable})` } as const)
      : {}),
  };

  return (
    <div
      className={className}
      data-patient-theme={patientTheme}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {children}
    </div>
  );
}
