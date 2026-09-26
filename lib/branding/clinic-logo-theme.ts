/**
 * Clinic logo choice for patient pages and the branding preview.
 *
 * Dark theme uses a dedicated dark logo when one is stored. Otherwise it
 * keeps the standard logo. Light theme uses the standard logo.
 *
 * A dark-only upload stays a supported patient mark: the header shows that
 * file in both themes. The branding preview does not invent a light logo in
 * that case; it keeps the initials fallback.
 */

export interface ClinicLogoSources {
  logoSrc: string | null | undefined;
  darkLogoSrc: string | null | undefined;
}

export interface PatientThemeLogos {
  /** Mark rendered in light theme, including a dark-only upload. */
  lightSrc: string | null;
  /**
   * Dedicated dark mark. Null when dark theme should keep showing `lightSrc`.
   */
  darkSrc: string | null;
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolvePatientThemeLogos(
  input: ClinicLogoSources
): PatientThemeLogos {
  const logoSrc = present(input.logoSrc);
  const darkLogoSrc = present(input.darkLogoSrc);
  const lightSrc = logoSrc ?? darkLogoSrc;
  const darkSrc =
    darkLogoSrc && lightSrc && darkLogoSrc !== lightSrc ? darkLogoSrc : null;
  return { lightSrc, darkSrc };
}

export function clinicLogoSrcForAppearance(
  appearance: "light" | "dark",
  input: ClinicLogoSources
): string | null {
  const logoSrc = present(input.logoSrc);
  const darkLogoSrc = present(input.darkLogoSrc);
  if (appearance === "dark") {
    return darkLogoSrc ?? logoSrc;
  }
  return logoSrc;
}
