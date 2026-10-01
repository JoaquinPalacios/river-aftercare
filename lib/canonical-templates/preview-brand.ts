import { PRODUCT_ISOLOGO_SRC } from "@/lib/branding/product-assets";
import type { AftercareThemeInput } from "@/lib/branding/aftercare-theme";
import {
  resolvePracticeChrome,
  type PracticeChrome,
} from "@/lib/aftercare/practice-chrome";

/**
 * Neutral operator-preview identity. Not a clinic row. Colours are the
 * River Aftercare platform brand already used by staff chrome.
 */
export const CANONICAL_PREVIEW_CLINIC_NAME = "River Aftercare Demo Clinic";

export const CANONICAL_PREVIEW_SLUG = "river-aftercare-demo";

export const CANONICAL_PREVIEW_BRAND_NOTE =
  "Preview uses River Aftercare Demo Clinic branding. Clinics use their own branding after adopting the template.";

export const CANONICAL_PREVIEW_OPERATOR_LABEL = "Operator preview";

/** Light `#3b4bd1` and dark `#8ea0ff` match `app/(staff)/staff.css`. */
export const CANONICAL_PREVIEW_THEME_INPUT: AftercareThemeInput = {
  primaryColor: "#3b4bd1",
  accentColor: "#3b4bd1",
  darkPrimaryColor: "#8ea0ff",
  darkAccentColor: "#8ea0ff",
  useCustomDarkBranding: true,
  radiusPreset: "MEDIUM",
  themeMode: "SYSTEM",
};

export function canonicalTemplatePublishedPreviewPath(
  templateId: string
): string {
  return `/operator/templates/${templateId}/preview`;
}

export function canonicalTemplateRevisionPreviewPath(
  templateId: string,
  revisionId: string
): string {
  return `/operator/templates/${templateId}/preview/${revisionId}`;
}

export function canonicalPreviewPracticeChrome(): PracticeChrome {
  return resolvePracticeChrome({
    slug: CANONICAL_PREVIEW_SLUG,
    name: CANONICAL_PREVIEW_CLINIC_NAME,
    profile: {
      displayName: CANONICAL_PREVIEW_CLINIC_NAME,
      logoUrl: PRODUCT_ISOLOGO_SRC,
      darkLogoUrl: PRODUCT_ISOLOGO_SRC,
      faviconUrl: null,
      phone: null,
      addressLine1: null,
      bookingUrl: null,
      contactUrl: null,
      emergencyInstructions: null,
      showCareGuideAttribution: true,
      instructionTerminology: "AFTERCARE",
      themeMode: "SYSTEM",
      allowPatientThemeToggle: false,
    },
  });
}
