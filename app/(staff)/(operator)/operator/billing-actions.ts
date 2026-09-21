"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface PrepareBillingActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
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
