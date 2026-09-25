"use server";

import { revalidatePath } from "next/cache";

import { requireAccountSplitOperator } from "@/lib/account-split/authorize";
import {
  cancelAccountSplitPreparation,
  createAccountSplitPreparation,
  createSplitDestinationAccount,
  saveAccountSplitSiteDecisions,
  saveAccountSplitStaffSelections,
  updateAccountSplitDestinationTarget,
} from "@/lib/account-split/preparation";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";

export type SplitActionState = {
  error?: string;
};

function splitPath(clinicId: string): string {
  return `/operator/clinics/${clinicId}/split`;
}

function failure(error: unknown): SplitActionState {
  if (isClinicPortalError(error)) {
    return { error: error.message };
  }
  return { error: "Could not update the account split preparation." };
}

export async function createSplitPreparationAction(
  _previous: SplitActionState,
  formData: FormData
): Promise<SplitActionState> {
  const { user } = await requireAccountSplitOperator();
  const sourceClinicId = String(formData.get("sourceClinicId") ?? "");
  const destinationPlan = formData.get("destinationPlan");
  const destinationBillingInterval = formData.get("destinationBillingInterval");
  if (destinationPlan !== "ESSENTIAL" && destinationPlan !== "PRACTICE") {
    return {
      error: "Choose Essential or Practice for the destination Account.",
    };
  }
  if (
    destinationBillingInterval !== "MONTHLY" &&
    destinationBillingInterval !== "YEARLY"
  ) {
    return { error: "Choose monthly or yearly billing." };
  }
  try {
    await createAccountSplitPreparation({
      sourceClinicId,
      keptClinicSiteId: String(formData.get("keptClinicSiteId") ?? ""),
      destinationPlan,
      destinationBillingInterval,
      operatorUserId: user.id,
    });
    revalidatePath(splitPath(sourceClinicId));
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function saveSplitSiteDecisionsAction(
  _previous: SplitActionState,
  formData: FormData
): Promise<SplitActionState> {
  await requireAccountSplitOperator();
  const preparationId = String(formData.get("preparationId") ?? "");
  const sourceClinicId = String(formData.get("sourceClinicId") ?? "");
  const siteIds = formData.getAll("siteId").map((value) => String(value));
  const decisions: Array<{
    clinicSiteId: string;
    decision: "SPLIT" | "DEACTIVATE";
  }> = [];
  for (const clinicSiteId of siteIds) {
    const decision = formData.get(`decision:${clinicSiteId}`);
    if (decision !== "SPLIT" && decision !== "DEACTIVATE") {
      return {
        error: "Choose Split or Deactivate for every site that is not kept.",
      };
    }
    decisions.push({ clinicSiteId, decision });
  }
  try {
    await saveAccountSplitSiteDecisions({
      preparationId,
      decisions,
    });
    revalidatePath(splitPath(sourceClinicId));
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function saveSplitStaffAction(
  _previous: SplitActionState,
  formData: FormData
): Promise<SplitActionState> {
  await requireAccountSplitOperator();
  const preparationId = String(formData.get("preparationId") ?? "");
  const sourceClinicId = String(formData.get("sourceClinicId") ?? "");
  const userIds = formData.getAll("userId").map((value) => String(value));
  const selections = userIds.map((userId) => {
    const placement = formData.get(`placement:${userId}`);
    const role = formData.get(`role:${userId}`);
    return {
      userId,
      keepOnSource: placement === "source",
      grantOnDestination: placement === "destination",
      destinationRole:
        role === "STAFF" ? ("STAFF" as const) : ("ADMIN" as const),
    };
  });
  if (
    selections.some(
      (selection) => !selection.keepOnSource && !selection.grantOnDestination
    )
  ) {
    return {
      error: "Choose source only or destination only for every person.",
    };
  }
  try {
    await saveAccountSplitStaffSelections({ preparationId, selections });
    revalidatePath(splitPath(sourceClinicId));
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function createSplitShellAction(
  _previous: SplitActionState,
  formData: FormData
): Promise<SplitActionState> {
  await requireAccountSplitOperator();
  const preparationId = String(formData.get("preparationId") ?? "");
  const sourceClinicId = String(formData.get("sourceClinicId") ?? "");
  try {
    await createSplitDestinationAccount(preparationId);
    revalidatePath(splitPath(sourceClinicId));
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function updateSplitTargetAction(
  _previous: SplitActionState,
  formData: FormData
): Promise<SplitActionState> {
  await requireAccountSplitOperator();
  const preparationId = String(formData.get("preparationId") ?? "");
  const sourceClinicId = String(formData.get("sourceClinicId") ?? "");
  const destinationPlan = formData.get("destinationPlan");
  const destinationBillingInterval = formData.get("destinationBillingInterval");
  if (destinationPlan !== "ESSENTIAL" && destinationPlan !== "PRACTICE") {
    return {
      error: "Choose Essential or Practice for the destination Account.",
    };
  }
  if (
    destinationBillingInterval !== "MONTHLY" &&
    destinationBillingInterval !== "YEARLY"
  ) {
    return { error: "Choose monthly or yearly billing." };
  }
  try {
    await updateAccountSplitDestinationTarget({
      preparationId,
      destinationPlan,
      destinationBillingInterval,
    });
    revalidatePath(splitPath(sourceClinicId));
    return {};
  } catch (error) {
    return failure(error);
  }
}

export async function cancelSplitPreparationAction(
  _previous: SplitActionState,
  formData: FormData
): Promise<SplitActionState> {
  await requireAccountSplitOperator();
  const preparationId = String(formData.get("preparationId") ?? "");
  const sourceClinicId = String(formData.get("sourceClinicId") ?? "");
  try {
    await cancelAccountSplitPreparation(preparationId);
    revalidatePath(splitPath(sourceClinicId));
    return {};
  } catch (error) {
    return failure(error);
  }
}
