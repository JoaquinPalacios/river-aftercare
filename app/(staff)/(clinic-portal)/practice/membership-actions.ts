"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import {
  FORBIDDEN_MEMBER_INVITE_MESSAGE,
  authorizeClinicMemberInvite,
} from "@/lib/clinic-portal/authorize-clinic-member-invite";
import { updateClinicMembershipStatus } from "@/lib/clinic-portal/update-clinic-membership-status";
import { inviteClinicUserFormSchema } from "@/lib/operator/clinic-invitation-input";
import {
  INVITATION_DELIVERY_FAILED_MESSAGE,
  inviteClinicUser,
} from "@/lib/operator/invite-clinic-user";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface MembershipStatusActionState {
  error?: string;
  success?: string;
}

export interface InvitePracticeMemberState {
  error?: string;
  success?: string;
  fieldErrors?: {
    name?: string;
    email?: string;
    role?: string;
  };
}

const INVITATION_SENT_MESSAGE = "Invitation sent.";
const ACCESS_RESTORED_MESSAGE = "Access restored.";

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
  await enforcePrePaymentActivationGate(clinicMembership);
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
      operatorOverride: formData.get("operatorOverride") === "true",
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

export async function invitePracticeMemberAction(
  _previous: InvitePracticeMemberState,
  formData: FormData
): Promise<InvitePracticeMemberState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const { user, clinicMembership } = await requireClinicAdmin();
  await enforcePrePaymentActivationGate(clinicMembership);

  // Clinic id is the authorized session clinic (real membership or operator
  // support context). A posted clinic id is ignored. Operator support is
  // classified as platform_operator and does not create a ClinicMembership.
  const authority = await authorizeClinicMemberInvite({
    actor: {
      id: user.id,
      platformRole: user.platformRole,
    },
    clinicId: clinicMembership.clinic.id,
  });
  if (!authority) {
    return { error: FORBIDDEN_MEMBER_INVITE_MESSAGE };
  }

  const parsed = inviteClinicUserFormSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: InvitePracticeMemberState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "name" || field === "email" || field === "role") &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      error: "Please review the invitation details.",
      fieldErrors,
    };
  }

  try {
    const result = await inviteClinicUser({
      clinicId: authority.clinicId,
      invitedByUserId: authority.userId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      actorPlatformRole: user.platformRole,
      operatorOverride: formData.get("operatorOverride") === "true",
    });
    if (!result.ok) {
      return {
        error: result.error,
        fieldErrors: result.fieldErrors,
      };
    }

    revalidatePath("/practice");
    if (authority.kind === "platform_operator") {
      revalidatePath(`/operator/clinics/${authority.clinicId}`);
      revalidatePath(`/operator/clinics/${authority.clinicId}/team`);
    }

    if (result.outcome === "ACCESS_RESTORED") {
      return { success: ACCESS_RESTORED_MESSAGE };
    }
    if (!result.delivered) {
      return { error: INVITATION_DELIVERY_FAILED_MESSAGE };
    }
    return { success: INVITATION_SENT_MESSAGE };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not send the invitation." };
  }
}
