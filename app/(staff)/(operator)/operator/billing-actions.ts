"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  planChangeMessage,
  submitOperatorPlanUpgrade,
} from "@/lib/billing/plan-change";
import { parseOfferedAdditionalSiteQuantity } from "@/lib/clinics/group-commercial";
import { prepareClinicCommercialOffer } from "@/lib/billing/prepare-offer";
import {
  parsePromotionExpiry,
  setClinicPromotionalTerm,
} from "@/lib/billing/promotion-offer";
import { parseIntroductoryTermField } from "@/lib/billing/promotion-terms";
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

export async function prepareClinicBillingAction(
  _previous: PrepareBillingActionState,
  formData: FormData
): Promise<PrepareBillingActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const { user } = await requirePlatformOperator();

  const clinicId = String(formData.get("clinicId") ?? "").trim();
  const commercialPlan = String(formData.get("commercialPlan") ?? "");
  const billingInterval = String(formData.get("billingInterval") ?? "");

  if (!clinicId) {
    notFound();
  }
  if (
    commercialPlan !== "ESSENTIAL" &&
    commercialPlan !== "PRACTICE" &&
    commercialPlan !== "GROUP"
  ) {
    return {
      error: "Choose Essential, Practice, or Group.",
      fieldErrors: { commercialPlan: "Choose Essential, Practice, or Group." },
    };
  }
  if (billingInterval !== "MONTHLY" && billingInterval !== "YEARLY") {
    return {
      error: "Choose monthly or annual billing.",
      fieldErrors: { billingInterval: "Choose monthly or annual billing." },
    };
  }

  const offeredAdditionalSiteQuantity =
    commercialPlan === "GROUP"
      ? parseOfferedAdditionalSiteQuantity(
          formData.get("offeredAdditionalSiteQuantity")
        )
      : null;
  if (commercialPlan === "GROUP" && offeredAdditionalSiteQuantity === null) {
    return {
      error: "Enter a whole number of additional sites, zero or more.",
      fieldErrors: {
        offeredAdditionalSiteQuantity:
          "Enter a whole number of additional sites, zero or more.",
      },
    };
  }

  const prepared = await prepareClinicCommercialOffer({
    clinicId,
    commercialPlan,
    billingInterval,
    ...(commercialPlan === "GROUP" ? { offeredAdditionalSiteQuantity } : {}),
  });
  if (!prepared.ok) {
    return { error: prepared.message };
  }

  const introductory = parseIntroductoryTermField(
    formData.has("introductoryTerm")
      ? String(formData.get("introductoryTerm") ?? "")
      : null
  );
  if (introductory.status === "invalid") {
    return {
      error: "Choose a six-month offer, a twelve-month offer, or none.",
      fieldErrors: {
        introductoryTerm:
          "Choose a six-month offer, a twelve-month offer, or none.",
      },
    };
  }
  if (introductory.status !== "absent") {
    const expiry =
      introductory.status === "set"
        ? parsePromotionExpiry(
            formData.get("introductoryExpiresOn"),
            new Date()
          )
        : { ok: true as const, expiresAt: null };
    if (!expiry.ok) {
      return {
        error: expiry.error,
        fieldErrors: { introductoryExpiresOn: expiry.error },
      };
    }
    const authorised = await setClinicPromotionalTerm({
      clinicId,
      actorUserId: user.id,
      term: introductory.status === "set" ? introductory.term : null,
      expiresAt: expiry.expiresAt,
      commercialPlan,
    });
    if (!authorised.ok) {
      return { error: authorised.error };
    }
  }

  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath(`/operator/clinics/${clinicId}/setup`);
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
