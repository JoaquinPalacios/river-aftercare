"use client";

import {
  AFTERCARE_THEME_SCOPE,
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import { PRODUCT_FAVICON_32_SRC } from "@/lib/branding/product-assets";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import type { PracticeSettingsInput } from "@/lib/clinic-portal/practice-settings-schema";

export function PracticeBrandingPreview({
  values,
  logoSrc,
  darkLogoSrc,
  faviconSrc,
  appearance,
  onAppearanceChange,
}: {
  values: PracticeSettingsInput;
  logoSrc: string | null;
  darkLogoSrc: string | null;
  faviconSrc: string | null;
  appearance: "light" | "dark";
  onAppearanceChange: (appearance: "light" | "dark") => void;
}) {
  const theme = resolveAftercareTheme(values);
  const previewLogo =
    appearance === "dark" && darkLogoSrc ? darkLogoSrc : logoSrc;
  const tabIcon = faviconSrc ?? PRODUCT_FAVICON_32_SRC;
  const tabIconLabel = faviconSrc
    ? "Clinic favicon"
    : `${PRODUCT_NAME} favicon`;

  return (
    <section
      className="staffBrandingPreview"
      aria-labelledby="practice-branding-preview-heading"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3
            className="text-sm font-semibold"
            id="practice-branding-preview-heading"
          >
            Patient preview
          </h3>
          <p className="text-sm text-staff-muted">
            Preview only. This does not change the clinic default appearance or
            your staff theme.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Preview appearance"
          className="staffBrandingPreviewSwitch"
        >
          <AppearanceOption
            checked={appearance === "light"}
            label="Light"
            onSelect={() => onAppearanceChange("light")}
          />
          <AppearanceOption
            checked={appearance === "dark"}
            label="Dark"
            onSelect={() => onAppearanceChange("dark")}
          />
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: serializeAftercareThemeCss(theme, {
            colorSchemeSelector: "scope",
          }),
        }}
      />

      <div
        className={`${AFTERCARE_THEME_SCOPE} staffPatientPreview`}
        data-patient-theme={appearance}
      >
        <div className="staffPatientPreviewTab">
          {/* Favicon preview is a clinic or product PNG/SVG path. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tabIcon} alt="" width={16} height={16} />
          <span>{values.displayName || "Practice"}</span>
          <span className="sr-only">{tabIconLabel}</span>
        </div>
        <div className="staffPatientPreviewChrome">
          {previewLogo ? (
            // Clinic mark is a same-origin path, configured origin, or object URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewLogo} alt="" className="staffPatientPreviewLogo" />
          ) : (
            <span
              className="staffPatientPreviewLogoFallback"
              aria-hidden="true"
            >
              {initials(values.displayName)}
            </span>
          )}
          <p className="staffPatientPreviewName">
            {values.displayName || "Practice"}
          </p>
        </div>
        <p className="staffPatientPreviewKicker">Aftercare instructions</p>
        <p className="staffPatientPreviewTitle">Sample recovery heading</p>
        <p className="staffPatientPreviewBody">
          Brand colours apply to patient aftercare pages. Surfaces, text, and
          alerts stay on River Aftercare.
        </p>
        <span className="staffPatientPreviewButton">Contact the practice</span>
      </div>
    </section>
  );
}

function AppearanceOption({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={
        checked
          ? "staffBrandingPreviewOptionCurrent"
          : "staffBrandingPreviewOption"
      }
    >
      <input
        type="radio"
        name="branding-preview-appearance"
        value={label.toLowerCase()}
        checked={checked}
        onChange={onSelect}
      />
      {label}
    </label>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "P";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
