"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { cancelClinicInvitation } from "@/lib/operator/cancel-clinic-invitation";
import { inviteClinicUserFormSchema } from "@/lib/operator/clinic-invitation-input";
import {
  clinicTeamStatusPath,
  TEAM_STATUS,
} from "@/lib/operator/clinic-team-status";
import {
  INVITATION_DELIVERY_FAILED_MESSAGE,
  inviteClinicUser,
} from "@/lib/operator/invite-clinic-user";
import { changeClinicMembershipRole } from "@/lib/operator/change-clinic-membership-role";
import { removeClinicAccess } from "@/lib/operator/remove-clinic-access";
import { resendClinicInvitation } from "@/lib/operator/resend-clinic-invitation";
import { updateClinicMembershipStatus } from "@/lib/clinic-portal/update-clinic-membership-status";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface ClinicTeamActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
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

async function requireOperatorOnStaffHost() {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  return requirePlatformOperator();
}

function clinicIdFromForm(formData: FormData): string {
  const clinicId = formData.get("clinicId");
  return typeof clinicId === "string" ? clinicId : "";
}

function revalidateTeam(clinicId: string) {
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath(`/operator/clinics/${clinicId}/team`);
  revalidatePath(`/operator/clinics/${clinicId}/team/invite`);
}

export async function inviteClinicUserAction(
  _previous: ClinicTeamActionState,
  formData: FormData
): Promise<ClinicTeamActionState> {
  const { user } = await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  if (!clinicId) {
    notFound();
  }

  const parsed = inviteClinicUserFormSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
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
      clinicId,
      invitedByUserId: user.id,
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

    revalidateTeam(clinicId);
    if (result.outcome === "ACCESS_RESTORED") {
      redirect(clinicTeamStatusPath(clinicId, TEAM_STATUS.ACCESS_RESTORED));
    }
    if (!result.delivered) {
      return { error: INVITATION_DELIVERY_FAILED_MESSAGE };
    }
    redirect(clinicTeamStatusPath(clinicId, TEAM_STATUS.INVITATION_SENT));
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not send the invitation." };
  }
}

export async function resendClinicInvitationAction(
  _previous: ClinicTeamActionState,
  formData: FormData
): Promise<ClinicTeamActionState> {
  const { user } = await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  const userId = formData.get("userId");
  if (!clinicId || typeof userId !== "string" || !userId) {
    notFound();
  }

  try {
    const result = await resendClinicInvitation({
      clinicId,
      userId,
      invitedByUserId: user.id,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidateTeam(clinicId);
    if (!result.delivered) {
      return { error: INVITATION_DELIVERY_FAILED_MESSAGE };
    }
    return { success: "Invitation sent." };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not resend the invitation." };
  }
}

export async function cancelClinicInvitationAction(
  _previous: ClinicTeamActionState,
  formData: FormData
): Promise<ClinicTeamActionState> {
  await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  const userId = formData.get("userId");
  if (!clinicId || typeof userId !== "string" || !userId) {
    notFound();
  }

  try {
    const result = await cancelClinicInvitation({ clinicId, userId });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidateTeam(clinicId);
    return { success: "Invitation cancelled." };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not cancel the invitation." };
  }
}

export async function removeClinicAccessAction(
  _previous: ClinicTeamActionState,
  formData: FormData
): Promise<ClinicTeamActionState> {
  await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  const membershipId = formData.get("membershipId");
  if (!clinicId || typeof membershipId !== "string" || !membershipId) {
    notFound();
  }

  try {
    const result = await removeClinicAccess({ clinicId, membershipId });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidateTeam(clinicId);
    redirect(clinicTeamStatusPath(clinicId, TEAM_STATUS.ACCESS_REMOVED));
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not remove clinic access." };
  }
}

export async function changeClinicMembershipRoleAction(
  _previous: ClinicTeamActionState,
  formData: FormData
): Promise<ClinicTeamActionState> {
  await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  const membershipId = formData.get("membershipId");
  const role = formData.get("role");
  if (
    !clinicId ||
    typeof membershipId !== "string" ||
    !membershipId ||
    typeof role !== "string" ||
    !role
  ) {
    notFound();
  }

  try {
    const result = await changeClinicMembershipRole({
      clinicId,
      membershipId,
      role,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidateTeam(clinicId);
    redirect(clinicTeamStatusPath(clinicId, TEAM_STATUS.ROLE_UPDATED));
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not update the role." };
  }
}

export async function updateClinicStaffMembershipStatusAction(
  _previous: ClinicTeamActionState,
  formData: FormData
): Promise<ClinicTeamActionState> {
  const { user } = await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  const membershipId = formData.get("membershipId");
  const activeValue = formData.get("active");
  if (!clinicId || typeof membershipId !== "string" || !membershipId) {
    notFound();
  }

  const active = activeValue === "true";

  try {
    const result = await updateClinicMembershipStatus({
      actor: user,
      clinicId,
      membershipId,
      active,
      operatorOverride: formData.get("operatorOverride") === "true",
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidateTeam(clinicId);
    redirect(
      clinicTeamStatusPath(
        clinicId,
        active ? TEAM_STATUS.STAFF_REACTIVATED : TEAM_STATUS.STAFF_DEACTIVATED
      )
    );
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not update membership status." };
  }
}
