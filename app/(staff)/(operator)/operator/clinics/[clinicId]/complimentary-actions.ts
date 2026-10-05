"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  extendComplimentaryAccess,
  grantComplimentaryAccess,
} from "@/lib/billing/complimentary-access";
import { commercialPlanLabel } from "@/lib/billing/offer-display";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface ComplimentaryAccessActionState {
  error?: string;
  success?: string;
}

export async function saveComplimentaryAccessAction(
  _previous: ComplimentaryAccessActionState,
  formData: FormData
): Promise<ComplimentaryAccessActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const { user } = await requirePlatformOperator();
  const clinicId = formData.get("clinicId");
  if (typeof clinicId !== "string" || clinicId.length === 0) {
    notFound();
  }
  const mode = formData.get("mode");
  const shared = {
    actorUserId: user.id,
    actorPlatformRole: user.platformRole,
    clinicId,
    duration: formData.get("duration"),
    customEndDate: formData.get("customEndDate"),
    reviewDate: formData.get("reviewDate"),
    reason: formData.get("reason"),
  };
  const result =
    mode === "extend"
      ? await extendComplimentaryAccess(shared)
      : await grantComplimentaryAccess({
          ...shared,
          commercialPlan: formData.get("commercialPlan"),
        });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath(`/operator/clinics/${clinicId}/setup`);
  revalidatePath("/account/billing");
  const plan = commercialPlanLabel(result.commercialPlan);
  return {
    success:
      mode === "extend"
        ? `Complimentary ${plan} access extended.`
        : `Complimentary ${plan} access granted.`,
  };
}
