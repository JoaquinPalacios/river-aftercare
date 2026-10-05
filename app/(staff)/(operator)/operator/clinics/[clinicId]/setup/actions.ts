"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { discardAssistedClinic } from "@/lib/operator/discard-assisted-clinic";
import { INVITATION_DELIVERY_FAILED_MESSAGE } from "@/lib/operator/invite-clinic-user";
import { inviteFirstClinicAdministrator } from "@/lib/operator/invite-first-clinic-administrator";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface OnboardingActionState {
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
  return typeof clinicId === "string" ? clinicId.trim() : "";
}

function revalidateOnboarding(clinicId: string) {
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath(`/operator/clinics/${clinicId}/setup`);
  revalidatePath(`/operator/clinics/${clinicId}/team`);
}

export async function prepareOnboardingStandardOfferAction(
  _previous: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  if (!clinicId) {
    notFound();
  }
  const commercialPlan = String(formData.get("commercialPlan") ?? "");
  const billingInterval = String(formData.get("billingInterval") ?? "");
  if (commercialPlan !== "ESSENTIAL" && commercialPlan !== "PRACTICE") {
    return {
      error: "Choose Essential or Practice.",
      fieldErrors: { commercialPlan: "Choose Essential or Practice." },
    };
  }
  if (billingInterval !== "MONTHLY" && billingInterval !== "YEARLY") {
    return {
      error: "Choose monthly or annual billing.",
      fieldErrors: { billingInterval: "Choose monthly or annual billing." },
    };
  }

  const prepared = await prepareClinicCommercialOffer({
    clinicId,
    commercialPlan,
    billingInterval,
  });
  if (!prepared.ok) {
    return { error: prepared.message };
  }
  revalidateOnboarding(clinicId);
  return {
    success: "Paid plan prepared. The clinic authorises payment later.",
  };
}

export async function discardAssistedClinicAction(
  _previous: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  if (!clinicId) {
    notFound();
  }
  try {
    const result = await discardAssistedClinic(clinicId);
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/operator/clinics");
    revalidatePath(`/operator/clinics/${clinicId}`);
    revalidatePath(`/operator/clinics/${clinicId}/setup`);
    redirect("/operator/clinics");
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not discard this clinic." };
  }
}

export async function inviteFirstClinicAdministratorAction(
  _previous: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { user } = await requireOperatorOnStaffHost();
  const clinicId = clinicIdFromForm(formData);
  if (!clinicId) {
    notFound();
  }

  try {
    const result = await inviteFirstClinicAdministrator({
      clinicId,
      invitedByUserId: user.id,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
    if (!result.ok) {
      return { error: result.error, fieldErrors: result.fieldErrors };
    }
    revalidateOnboarding(clinicId);
    if (result.outcome === "ACCESS_RESTORED") {
      return { success: "Administrator access restored." };
    }
    if (!result.delivered) {
      return { error: INVITATION_DELIVERY_FAILED_MESSAGE };
    }
    return { success: "Invitation sent." };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: "Could not send the invitation." };
  }
}
