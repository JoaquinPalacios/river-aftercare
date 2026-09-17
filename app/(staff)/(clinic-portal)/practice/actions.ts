"use server";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { practiceSettingsSchema } from "@/lib/clinic-portal/practice-settings-schema";
import { updatePracticeSettings } from "@/lib/clinic-portal/update-practice-settings";

export interface PracticeActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}

function practiceError(error: unknown): string {
  if (isClinicPortalError(error)) {
    return error.message;
  }
  return "Could not save practice settings.";
}

export async function savePracticeSettingsAction(
  _previous: PracticeActionState,
  formData: FormData
): Promise<PracticeActionState> {
  const { clinicMembership } = await requireClinicAdmin();
  const parsed = practiceSettingsSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    primaryColor: formData.get("primaryColor") ?? "",
    accentColor: formData.get("accentColor") ?? "",
    neutralColor: formData.get("neutralColor") ?? "",
    radiusPreset: formData.get("radiusPreset") ?? "MEDIUM",
    instructionTerminology:
      formData.get("instructionTerminology") ?? "AFTERCARE",
    themeMode: formData.get("themeMode") ?? "SYSTEM",
    allowPatientThemeToggle: formData.get("allowPatientThemeToggle") === "on",
    phone: formData.get("phone") ?? "",
    contactUrl: formData.get("contactUrl") ?? "",
    addressLine1: formData.get("addressLine1") ?? "",
    addressLine2: formData.get("addressLine2") ?? "",
    city: formData.get("city") ?? "",
    region: formData.get("region") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    emergencyInstructions: formData.get("emergencyInstructions") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { error: "Please review the practice settings.", fieldErrors };
  }

  try {
    await updatePracticeSettings({
      clinicId: clinicMembership.clinic.id,
      values: parsed.data,
    });
    return { saved: true };
  } catch (error) {
    return { error: practiceError(error) };
  }
}
