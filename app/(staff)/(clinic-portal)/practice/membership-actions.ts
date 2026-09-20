"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { updateClinicMembershipStatus } from "@/lib/clinic-portal/update-clinic-membership-status";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface MembershipStatusActionState {
  error?: string;
  success?: string;
}

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_NOT_FOUND"))
  );
}

export async function updateStaffMembershipStatusAction(
  _previous: MembershipStatusActionState,
  formData: FormData
): Promise<MembershipStatusActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const { user, clinicMembership } = await requireClinicAdmin();
  const membershipId =
    typeof formData.get("membershipId") === "string"
      ? String(formData.get("membershipId"))
      : "";
  const activeValue = formData.get("active");
  const active = activeValue === "true";

  if (!membershipId) {
    return { error: "That clinic access could not be found." };
  }

  try {
    const result = await updateClinicMembershipStatus({
      actor: user,
      clinicId: clinicMembership.clinic.id,
      membershipId,
      active,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    return {
      success: active
        ? "Staff access restored for this clinic."
        : "Staff access deactivated for this clinic.",
    };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Unable to update membership status right now." };
  }
}
