"use server";

import { redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  createOperatorClinic,
  createOperatorClinicSchema,
} from "@/lib/operator/create-operator-clinic";

export interface OperatorActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createClinicAction(
  _previous: OperatorActionState,
  formData: FormData
): Promise<OperatorActionState> {
  await requirePlatformOperator();
  const parsed = createOperatorClinicSchema.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    serviceCategories: formData
      .getAll("serviceCategories")
      .filter((value): value is string => typeof value === "string"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { error: "Please review the clinic details.", fieldErrors };
  }

  try {
    const created = await createOperatorClinic(parsed.data);
    redirect(`/operator/clinics/${created.id}/setup`);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (isClinicPortalError(error)) {
      return { error: error.message };
    }
    return { error: "Could not create the clinic." };
  }
}
