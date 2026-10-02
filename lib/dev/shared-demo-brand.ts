import { PRODUCT_ISOLOGO_SRC } from "../branding/product-assets.ts";
import { DEMO_AFTERCARE_TENANT_SLUG } from "../aftercare/demo-tenant.ts";

/**
 * Neutral identity for the one shared demonstration account.
 * No practitioner, street address, ABN, or telephone number.
 */
export const SHARED_DEMO_CLINIC_ID = "clinic_demo_rivers";

export const SHARED_DEMO_DISPLAY_NAME = "River Aftercare Demo Clinic";

export const SHARED_DEMO_ACCOUNT = {
  id: SHARED_DEMO_CLINIC_ID,
  name: SHARED_DEMO_DISPLAY_NAME,
  slug: DEMO_AFTERCARE_TENANT_SLUG,
} as const;

export const SHARED_DEMO_CONTACT_URL =
  "https://example.com/river-aftercare-demo";

export const SHARED_DEMO_EMERGENCY_INSTRUCTIONS =
  "This is a fictional demonstration clinic. It is not a real practice and cannot give clinical advice. In a real emergency, contact local emergency services.";

export const SHARED_DEMO_PROFILE = {
  displayName: SHARED_DEMO_DISPLAY_NAME,
  logoUrl: PRODUCT_ISOLOGO_SRC,
  darkLogoUrl: PRODUCT_ISOLOGO_SRC,
  faviconUrl: null,
  primaryColor: "#3b4bd1",
  accentColor: "#3b4bd1",
  darkPrimaryColor: "#8ea0ff",
  darkAccentColor: "#8ea0ff",
  useCustomDarkBranding: true,
  neutralColor: "#f7f8ff",
  radiusPreset: "MEDIUM" as const,
  instructionTerminology: "AFTERCARE" as const,
  themeMode: "SYSTEM" as const,
  allowPatientThemeToggle: true,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  bookingUrl: null,
  contactUrl: SHARED_DEMO_CONTACT_URL,
  contactEmail: null,
  emergencyInstructions: SHARED_DEMO_EMERGENCY_INSTRUCTIONS,
  showCareGuideAttribution: true,
};
