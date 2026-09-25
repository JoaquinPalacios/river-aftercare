"use server";

import { revalidatePath } from "next/cache";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  createClinicLocation,
  createClinicSiteWithRootLocation,
  deactivateClinicLocation,
  reactivateClinicLocation,
  updateClinicLocation,
  updateClinicSiteBranding,
} from "@/lib/clinics/site-location-mutations";
import {
  createLocationSchema,
  createSiteSchema,
  locationDetailsSchema,
  siteBrandingSchema,
} from "@/lib/clinics/site-location-schemas";

export interface SiteActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}

function fieldErrorsFrom(
  issues: Array<{ path: PropertyKey[]; message: string }>
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function actionError(error: unknown, fallback: string): string {
  if (isClinicPortalError(error)) {
    return error.message;
  }
  return fallback;
}

async function adminClinicId(): Promise<string> {
  const { clinicMembership } = await requireClinicAdmin();
  await enforcePrePaymentActivationGate(clinicMembership);
  return clinicMembership.clinic.id;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createSiteAction(
  _previous: SiteActionState,
  formData: FormData
): Promise<SiteActionState> {
  const clinicId = await adminClinicId();
  const parsed = createSiteSchema.safeParse({
    siteName: text(formData, "siteName"),
    siteSlug: text(formData, "siteSlug"),
    locationName: text(formData, "locationName"),
    locationDisplayName: text(formData, "locationDisplayName"),
    phone: text(formData, "phone"),
    addressLine1: text(formData, "addressLine1"),
    addressLine2: text(formData, "addressLine2"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country"),
    contactUrl: text(formData, "contactUrl"),
    contactEmail: text(formData, "contactEmail"),
    bookingUrl: text(formData, "bookingUrl"),
    emergencyInstructions: text(formData, "emergencyInstructions"),
  });
  if (!parsed.success) {
    return {
      error: "Please review the site and location details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  if (text(formData, "slug")) {
    return {
      error: "A site address can only be chosen when the site is created.",
    };
  }
  try {
    const created = await createClinicSiteWithRootLocation({
      clinicId,
      values: parsed.data,
    });
    revalidatePath("/practice/sites");
    revalidatePath(`/practice/sites/${created.siteId}`);
    return { saved: true };
  } catch (error) {
    return { error: actionError(error, "Could not create the clinic site.") };
  }
}

export async function saveSiteBrandingAction(
  _previous: SiteActionState,
  formData: FormData
): Promise<SiteActionState> {
  const clinicId = await adminClinicId();
  const siteId = text(formData, "siteId");
  if (!siteId) {
    return { error: "Clinic site not found." };
  }
  if (text(formData, "slug")) {
    return {
      error: "The site address cannot be changed from clinic administration.",
    };
  }
  const parsed = siteBrandingSchema.safeParse({
    name: text(formData, "name"),
    displayName: text(formData, "displayName"),
    logoUrl: text(formData, "logoUrl"),
    darkLogoUrl: text(formData, "darkLogoUrl"),
    faviconUrl: text(formData, "faviconUrl"),
    primaryColor: text(formData, "primaryColor"),
    accentColor: text(formData, "accentColor"),
    darkPrimaryColor: text(formData, "darkPrimaryColor"),
    darkAccentColor: text(formData, "darkAccentColor"),
    useCustomDarkBranding: formData.get("useCustomDarkBranding") === "on",
    neutralColor: text(formData, "neutralColor"),
    radiusPreset: text(formData, "radiusPreset") || "MEDIUM",
    typeface: text(formData, "typeface"),
    instructionTerminology:
      text(formData, "instructionTerminology") || "AFTERCARE",
    themeMode: text(formData, "themeMode") || "SYSTEM",
    allowPatientThemeToggle: formData.get("allowPatientThemeToggle") === "on",
    showCareGuideAttribution: formData.get("showCareGuideAttribution") === "on",
  });
  if (!parsed.success) {
    return {
      error: "Please review this site's branding.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateClinicSiteBranding({
      clinicId,
      siteId,
      values: parsed.data,
    });
    revalidatePath("/practice");
    revalidatePath("/practice/sites");
    revalidatePath(`/practice/sites/${siteId}`);
    return { saved: true };
  } catch (error) {
    return { error: actionError(error, "Could not save site branding.") };
  }
}

export async function createLocationAction(
  _previous: SiteActionState,
  formData: FormData
): Promise<SiteActionState> {
  const clinicId = await adminClinicId();
  const siteId = text(formData, "siteId");
  if (!siteId) {
    return { error: "Clinic site not found." };
  }
  const parsed = createLocationSchema.safeParse({
    name: text(formData, "name"),
    displayName: text(formData, "displayName"),
    slug: text(formData, "slug"),
    phone: text(formData, "phone"),
    addressLine1: text(formData, "addressLine1"),
    addressLine2: text(formData, "addressLine2"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country"),
    contactUrl: text(formData, "contactUrl"),
    contactEmail: text(formData, "contactEmail"),
    bookingUrl: text(formData, "bookingUrl"),
    emergencyInstructions: text(formData, "emergencyInstructions"),
  });
  if (!parsed.success) {
    return {
      error: "Please review the location details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await createClinicLocation({ clinicId, siteId, values: parsed.data });
    revalidatePath("/practice/sites");
    revalidatePath(`/practice/sites/${siteId}`);
    return { saved: true };
  } catch (error) {
    return { error: actionError(error, "Could not add the location.") };
  }
}

export async function updateLocationAction(
  _previous: SiteActionState,
  formData: FormData
): Promise<SiteActionState> {
  const clinicId = await adminClinicId();
  const locationId = text(formData, "locationId");
  const siteId = text(formData, "siteId");
  if (!locationId) {
    return { error: "Location not found." };
  }
  if (formData.has("slug")) {
    return {
      error: "The location address cannot be changed after it is created.",
    };
  }
  const parsed = locationDetailsSchema.safeParse({
    name: text(formData, "name"),
    displayName: text(formData, "displayName"),
    phone: text(formData, "phone"),
    addressLine1: text(formData, "addressLine1"),
    addressLine2: text(formData, "addressLine2"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country"),
    contactUrl: text(formData, "contactUrl"),
    contactEmail: text(formData, "contactEmail"),
    bookingUrl: text(formData, "bookingUrl"),
    emergencyInstructions: text(formData, "emergencyInstructions"),
  });
  if (!parsed.success) {
    return {
      error: "Please review the location details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateClinicLocation({
      clinicId,
      locationId,
      values: parsed.data,
    });
    revalidatePath("/practice");
    revalidatePath("/practice/sites");
    if (siteId) {
      revalidatePath(`/practice/sites/${siteId}`);
    }
    return { saved: true };
  } catch (error) {
    return { error: actionError(error, "Could not save the location.") };
  }
}

export async function setLocationActiveAction(
  _previous: SiteActionState,
  formData: FormData
): Promise<SiteActionState> {
  const clinicId = await adminClinicId();
  const locationId = text(formData, "locationId");
  const siteId = text(formData, "siteId");
  const active = text(formData, "active") === "true";
  if (!locationId) {
    return { error: "Location not found." };
  }
  try {
    if (active) {
      await reactivateClinicLocation({ clinicId, locationId });
    } else {
      await deactivateClinicLocation({ clinicId, locationId });
    }
    revalidatePath("/practice/sites");
    if (siteId) {
      revalidatePath(`/practice/sites/${siteId}`);
    }
    return { saved: true };
  } catch (error) {
    return {
      error: actionError(error, "Could not update the location status."),
    };
  }
}
