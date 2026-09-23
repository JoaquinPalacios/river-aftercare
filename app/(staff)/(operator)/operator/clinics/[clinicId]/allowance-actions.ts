"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { parseOperatorExtraAllowance } from "@/lib/entitlements/allowance-input";
import { updateOperatorAllowanceExtras } from "@/lib/entitlements/operator-extras";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface AllowanceExtrasActionState {
  error?: string;
  success?: string;
}

function parseExtra(formData: FormData, name: string): number | null {
  return parseOperatorExtraAllowance(formData.get(name));
}

export async function updateAllowanceExtrasAction(
  _previous: AllowanceExtrasActionState,
  formData: FormData
): Promise<AllowanceExtrasActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const { user } = await requirePlatformOperator();
  const clinicId = formData.get("clinicId");
  if (typeof clinicId !== "string" || clinicId.length === 0) {
    notFound();
  }

  const teamMembers = parseExtra(formData, "extraTeamMembers");
  const customGuides = parseExtra(formData, "extraCustomGuides");
  const templateAdaptations = parseExtra(formData, "extraTemplateAdaptations");
  if (
    teamMembers === null ||
    customGuides === null ||
    templateAdaptations === null
  ) {
    return {
      error: "Extra allowances must be whole numbers of zero or more.",
    };
  }

  const result = await updateOperatorAllowanceExtras({
    actorUserId: user.id,
    actorPlatformRole: user.platformRole,
    clinicId,
    extras: { teamMembers, customGuides, templateAdaptations },
  });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath(`/operator/clinics/${clinicId}/team`);
  revalidatePath("/guides");
  revalidatePath("/practice");
  return { success: "Extra allowances saved." };
}
