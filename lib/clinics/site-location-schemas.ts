import "server-only";

import { z } from "zod";

import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { toSafeHttpHref, toTelHref } from "@/lib/aftercare/safe-href";
import { INSTRUCTION_TERMINOLOGY } from "@/lib/aftercare/instruction-terminology";
import { parseCssHexColor } from "@/lib/branding/aftercare-theme";
import { parseClinicTypeface } from "@/lib/branding/clinic-typeface";
import { isClinicLogoStoredReference } from "@/lib/clinic-assets/public-url";
import { isReservedLocationSlug } from "@/lib/clinics/reserved-location-slugs";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null));
}

function hexColor(message: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .refine((value) => value === null || Boolean(parseCssHexColor(value)), {
      message,
    })
    .transform((value) => (value ? parseCssHexColor(value) : null));
}

function storedAsset(message: string) {
  return optionalText(240).refine(
    (value) => value === null || isClinicLogoStoredReference(value),
    { message }
  );
}

const phone = optionalText(40).refine(
  (value) => value === null || Boolean(toTelHref(value)),
  { message: "Enter a phone number patients can tap to call." }
);

const httpUrl = (message: string) =>
  optionalText(240).refine(
    (value) => value === null || Boolean(toSafeHttpHref(value)),
    { message }
  );

export const locationDetailsSchema = z.object({
  name: z.string().trim().min(1, "Enter a location name.").max(80),
  displayName: z
    .string()
    .trim()
    .min(1, "Enter the name patients see for this location.")
    .max(80),
  phone,
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(80),
  contactUrl: httpUrl("Contact URL must use http or https."),
  contactEmail: optionalText(120).refine(
    (value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    { message: "Enter a valid contact email." }
  ),
  bookingUrl: httpUrl("Booking URL must use http or https."),
  emergencyInstructions: optionalText(2000),
});

export type LocationDetailsInput = z.infer<typeof locationDetailsSchema>;

export const locationSlugSchema = z
  .string()
  .trim()
  .refine((value) => isValidCareGuideSlug(value), {
    message:
      "Use 3–32 lowercase letters, numbers, and hyphens for the location address.",
  })
  .refine((value) => !isReservedLocationSlug(value), {
    message: "That location address is reserved.",
  });

export const siteSlugSchema = z
  .string()
  .trim()
  .refine((value) => isValidCareGuideSlug(value), {
    message:
      "Use 3–32 lowercase letters, numbers, and hyphens for the site address.",
  })
  .refine((value) => !isReservedTenantSlug(value), {
    message: "That site address is reserved.",
  });

export const createSiteSchema = z.object({
  siteName: z.string().trim().min(1, "Enter a site name.").max(80),
  siteSlug: siteSlugSchema,
  locationName: z.string().trim().min(1, "Enter a location name.").max(80),
  locationDisplayName: z
    .string()
    .trim()
    .max(80)
    .transform((value) => (value.length > 0 ? value : null)),
  phone,
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(80),
  contactUrl: httpUrl("Contact URL must use http or https."),
  contactEmail: locationDetailsSchema.shape.contactEmail,
  bookingUrl: httpUrl("Booking URL must use http or https."),
  emergencyInstructions: optionalText(2000),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const createLocationSchema = locationDetailsSchema.extend({
  slug: locationSlugSchema,
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const siteBrandingSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a site name.").max(80),
    displayName: z
      .string()
      .trim()
      .min(1, "Enter a patient-facing site name.")
      .max(80),
    logoUrl: storedAsset(
      "Logo must be a clinic asset key or a same-origin PNG, JPEG, WebP, or SVG path."
    ),
    darkLogoUrl: storedAsset(
      "Dark logo must be a clinic asset key or a same-origin PNG, JPEG, WebP, or SVG path."
    ),
    faviconUrl: storedAsset(
      "Favicon must be a clinic asset key or a same-origin PNG path."
    ),
    primaryColor: hexColor("Enter a valid hex colour such as #155e75."),
    accentColor: hexColor("Enter a valid hex colour such as #b45309."),
    darkPrimaryColor: hexColor("Enter a valid hex colour such as #155e75."),
    darkAccentColor: hexColor("Enter a valid hex colour such as #b45309."),
    useCustomDarkBranding: z.boolean().default(false),
    neutralColor: hexColor("Enter a valid hex colour such as #f7f7f5."),
    radiusPreset: z.enum(["SHARP", "MEDIUM", "SOFT"] as const),
    typeface: z.preprocess(
      (value) => (typeof value === "string" ? value : ""),
      z.string().transform((value) => parseClinicTypeface(value))
    ),
    instructionTerminology: z.enum(INSTRUCTION_TERMINOLOGY),
    themeMode: z.enum(["LIGHT", "DARK", "SYSTEM"] as const),
    allowPatientThemeToggle: z.boolean(),
    showCareGuideAttribution: z.boolean(),
  })
  .superRefine((value, context) => {
    if (!value.useCustomDarkBranding) {
      return;
    }
    if (!value.darkPrimaryColor) {
      context.addIssue({
        code: "custom",
        path: ["darkPrimaryColor"],
        message:
          "Enter a Dark primary colour, or turn off custom Dark branding.",
      });
    }
    if (!value.darkAccentColor) {
      context.addIssue({
        code: "custom",
        path: ["darkAccentColor"],
        message:
          "Enter a Dark accent colour, or turn off custom Dark branding.",
      });
    }
  });

export type SiteBrandingInput = z.infer<typeof siteBrandingSchema>;
