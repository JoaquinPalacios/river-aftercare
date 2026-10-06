"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  deactivateClinic,
  reactivateClinic,
} from "@/lib/clinics/clinic-deactivation";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface ClinicStatusActionState {
  error?: string;
  success?: string;
}

async function operatorClinicId(formData: FormData): Promise<{
  clinicId: string;
  operatorUserId: string;
}> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const operator = await requirePlatformOperator();
  const clinicId = formData.get("clinicId");
  if (typeof clinicId !== "string" || clinicId.length === 0) {
    notFound();
  }
  return { clinicId, operatorUserId: operator.user.id };
}

export async function setOperatorClinicActiveAction(
  _previous: ClinicStatusActionState,
  formData: FormData
): Promise<ClinicStatusActionState> {
  const { clinicId, operatorUserId } = await operatorClinicId(formData);
  const activate = formData.get("active") === "true";
  const result = activate
    ? await reactivateClinic({ clinicId, operatorUserId })
    : await deactivateClinic({ clinicId, operatorUserId });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/operator/clinics");
  return {
    success: activate
      ? "Clinic reactivated. Access follows the clinic's current billing status. Invitations revoked during deactivation stay revoked."
      : "Clinic deactivated. Patient pages stop resolving and clinic staff cannot use the portal. Billing and Stripe are unchanged.",
  };
}
