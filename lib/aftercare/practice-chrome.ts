import { shouldShowDemoAftercareNotice } from "@/lib/aftercare/demo-tenant";
import {
  instructionLabel,
  parseInstructionTerminology,
  type InstructionTerminology,
} from "@/lib/aftercare/instruction-terminology";
import { toSafeHttpHref, toTelHref } from "@/lib/aftercare/safe-href";
import { resolveClinicLogoSrc } from "@/lib/clinic-assets/public-url";
import {
  parseThemeMode,
  type ClinicThemeMode,
} from "@/lib/branding/theme-preference";

export interface PracticeChromeProfile {
  displayName: string;
  logoUrl: string | null;
  darkLogoUrl?: string | null;
  faviconUrl?: string | null;
  phone: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  bookingUrl: string | null;
  contactUrl: string | null;
  emergencyInstructions: string | null;
  showCareGuideAttribution: boolean;
  instructionTerminology?: string | null;
  themeMode?: string | null;
  allowPatientThemeToggle?: boolean | null;
}

export interface PracticeChrome {
  displayName: string;
  logoSrc: string | null;
  darkLogoSrc: string | null;
  faviconSrc: string | null;
  phoneDisplay: string | null;
  phoneHref: string | null;
  addressText: string | null;
  bookingHref: string | null;
  contactHref: string | null;
  emergencyInstructions: string | null;
  showCareGuideAttribution: boolean;
  showDemoNotice: boolean;
  instructionTerminology: InstructionTerminology;
  instructionsLabel: string;
  themeMode: ClinicThemeMode;
  allowPatientThemeToggle: boolean;
}

export function resolvePracticeChrome(input: {
  slug: string;
  name: string;
  profile: PracticeChromeProfile | null;
}): PracticeChrome {
  const profile = input.profile;
  const phoneDisplay = profile?.phone?.trim() || null;
  const emergencyInstructions = profile?.emergencyInstructions?.trim() || null;

  return {
    displayName: profile?.displayName?.trim() || input.name,
    logoSrc: resolveClinicLogoSrc(profile?.logoUrl ?? null),
    darkLogoSrc: resolveClinicLogoSrc(profile?.darkLogoUrl ?? null),
    faviconSrc: resolveClinicLogoSrc(profile?.faviconUrl ?? null),
    phoneDisplay,
    phoneHref: toTelHref(phoneDisplay),
    addressText: formatPracticeAddress(profile),
    bookingHref: toSafeHttpHref(profile?.bookingUrl ?? null),
    contactHref: toSafeHttpHref(profile?.contactUrl ?? null),
    emergencyInstructions,
    showCareGuideAttribution: profile?.showCareGuideAttribution === true,
    showDemoNotice: shouldShowDemoAftercareNotice(input.slug),
    instructionTerminology: parseInstructionTerminology(
      profile?.instructionTerminology
    ),
    instructionsLabel: instructionLabel(profile?.instructionTerminology),
    themeMode: parseThemeMode(profile?.themeMode),
    allowPatientThemeToggle: profile?.allowPatientThemeToggle === true,
  };
}

export function hasPracticeContact(chrome: PracticeChrome): boolean {
  return Boolean(
    chrome.phoneHref ||
    chrome.contactHref ||
    chrome.emergencyInstructions ||
    chrome.addressText
  );
}

/**
 * Phone or contact-page link actually rendered by `PracticeContact`.
 * Web does not show address. Emergency copy is clinic-authored urgent
 * guidance, not a practice contact channel.
 */
export function hasRenderedWebPracticeContactChannel(
  chrome: PracticeChrome
): boolean {
  return Boolean(chrome.phoneHref || chrome.contactHref);
}

/**
 * Phone or address actually rendered in the print contact block.
 * Print does not emit the contact URL. Emergency copy is not a contact
 * channel.
 */
export function hasRenderedPrintPracticeContactDetails(
  chrome: PracticeChrome
): boolean {
  return Boolean(chrome.phoneDisplay || chrome.addressText);
}

export function formatPracticeAddress(
  profile: PracticeChromeProfile | null | undefined
): string | null {
  if (!profile) {
    return null;
  }

  const street = [profile.addressLine1, profile.addressLine2]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const locality = [profile.city, profile.region, profile.postalCode]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const parts = locality ? [...street, locality] : street;

  return parts.length > 0 ? parts.join(", ") : null;
}
