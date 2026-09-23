"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  planChangeMessage,
  submitOperatorPlanUpgrade,
} from "@/lib/billing/plan-change";
import {
  planDowngradeMessage,
  submitOperatorDowngradeReversal,
  submitOperatorPlanDowngrade,
} from "@/lib/billing/plan-downgrade";
import { loadEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface PrepareBillingActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export interface PlanUpgradeActionState {
  error?: string;
  accepted?: boolean;
  startedAt?: number;
}

export interface PlanDowngradeActionState {
  error?: string;
  accepted?: boolean;
}

export async function prepareClinicBillingAction(
  _previous: PrepareBillingActionState,
  formData: FormData
): Promise<PrepareBillingActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  await requirePlatformOperator();

  const clinicId = String(formData.get("clinicId") ?? "").trim();
  const commercialPlan = String(formData.get("commercialPlan") ?? "");
  const billingInterval = String(formData.get("billingInterval") ?? "");

  if (!clinicId) {
    notFound();
  }
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

  revalidatePath(`/operator/clinics/${clinicId}`);
  return { success: "Billing offer prepared." };
}

export async function upgradeClinicPlanAction(
  _previous: PlanUpgradeActionState,
  formData: FormData
): Promise<PlanUpgradeActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  await requirePlatformOperator();

  const clinicId = String(formData.get("clinicId") ?? "").trim();
  const requestedPlan = String(formData.get("targetPlan") ?? "");
  if (!clinicId) {
    notFound();
  }

  const result = await submitOperatorPlanUpgrade({
    clinicId,
    requestedPlan,
  });

  revalidatePath(`/operator/clinics/${clinicId}`);
  if (!result.ok) {
    return { error: planChangeMessage(result.code) };
  }
  return { accepted: true, startedAt: Date.now() };
}

export async function scheduleClinicPlanDowngradeAction(
  _previous: PlanDowngradeActionState,
  formData: FormData
): Promise<PlanDowngradeActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  await requirePlatformOperator();

  const clinicId = String(formData.get("clinicId") ?? "").trim();
  if (!clinicId) {
    notFound();
  }

  const result = await submitOperatorPlanDowngrade({ clinicId });
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/account/billing");
  if (!result.ok) {
    const readiness =
      result.code === "not_ready"
        ? await loadEssentialDowngradeReadiness(clinicId)
        : undefined;
    return { error: planDowngradeMessage(result.code, readiness) };
  }
  return { accepted: true };
}

export async function keepPracticePlanAction(
  _previous: PlanDowngradeActionState,
  formData: FormData
): Promise<PlanDowngradeActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  await requirePlatformOperator();

  const clinicId = String(formData.get("clinicId") ?? "").trim();
  if (!clinicId) {
    notFound();
  }

  const result = await submitOperatorDowngradeReversal({ clinicId });
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/account/billing");
  if (!result.ok) {
    return { error: planDowngradeMessage(result.code) };
  }
  return { accepted: true };
}
