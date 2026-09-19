import { z } from "zod";

import { parseCssHexColor } from "@/lib/branding/aftercare-theme";
import { parseClinicTypeface } from "@/lib/branding/clinic-typeface";
import { INSTRUCTION_TERMINOLOGY } from "@/lib/aftercare/instruction-terminology";
import { toSafeHttpHref, toTelHref } from "@/lib/aftercare/safe-href";
import { isClinicLogoStoredReference } from "@/lib/clinic-assets/public-url";

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

export const practiceSettingsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a patient-facing practice name.")
    .max(80),
  logoUrl: optionalText(240).refine(
    (value) => value === null || isClinicLogoStoredReference(value),
    {
      message:
        "Logo must be a clinic asset key or a same-origin PNG, JPEG, WebP, or SVG path.",
    }
  ),
  primaryColor: hexColor("Enter a valid hex colour such as #155e75."),
  accentColor: hexColor("Enter a valid hex colour such as #b45309."),
  neutralColor: hexColor("Enter a valid hex colour such as #f7f7f5."),
  radiusPreset: z.enum(["SHARP", "MEDIUM", "SOFT"] as const),
  typeface: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().transform((value) => parseClinicTypeface(value))
  ),
  instructionTerminology: z.enum(INSTRUCTION_TERMINOLOGY),
  themeMode: z.enum(["LIGHT", "DARK", "SYSTEM"] as const),
  allowPatientThemeToggle: z.boolean(),
  phone: optionalText(40).refine(
    (value) => value === null || Boolean(toTelHref(value)),
    {
      message: "Enter a phone number patients can tap to call.",
    }
  ),
  contactUrl: optionalText(240).refine(
    (value) => value === null || Boolean(toSafeHttpHref(value)),
    {
      message: "Contact URL must use http or https.",
    }
  ),
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  emergencyInstructions: optionalText(2000),
});

export type PracticeSettingsInput = z.infer<typeof practiceSettingsSchema>;
