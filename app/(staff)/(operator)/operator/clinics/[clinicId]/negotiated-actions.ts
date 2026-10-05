"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  prepareNegotiatedOffer,
  withdrawNegotiatedOffer,
  type NegotiatedStripePort,
} from "@/lib/billing/negotiated-offer";
import {
  getStripeClient,
  getStripeClientConfig,
} from "@/lib/billing/stripe-client";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface NegotiatedOfferActionState {
  error?: string;
  success?: string;
}

export async function saveNegotiatedOfferAction(
  _previous: NegotiatedOfferActionState,
  formData: FormData
): Promise<NegotiatedOfferActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const { user } = await requirePlatformOperator();
  const clinicId = formData.get("clinicId");
  if (typeof clinicId !== "string" || clinicId.length === 0) {
    notFound();
  }
  const result = await prepareNegotiatedOffer({
    clinicId,
    actorUserId: user.id,
    actorPlatformRole: user.platformRole,
    billingInterval: formData.get("billingInterval"),
    amount: formData.get("amount"),
    startMode: formData.get("startMode"),
    billingStartDate: formData.get("billingStartDate"),
    rateExpiryPolicy: formData.get("rateExpiryPolicy"),
    rateEndDate: formData.get("rateEndDate"),
    commercialTerms: formData.get("commercialTerms"),
  });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/account/billing");
  return {
    success: "Negotiated price prepared. The clinic has not been charged.",
  };
}

export async function withdrawNegotiatedOfferAction(
  _previous: NegotiatedOfferActionState,
  formData: FormData
): Promise<NegotiatedOfferActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const { user } = await requirePlatformOperator();
  const clinicId = formData.get("clinicId");
  if (typeof clinicId !== "string" || clinicId.length === 0) {
    notFound();
  }
  const stripeConfig = getStripeClientConfig();
  const result = await withdrawNegotiatedOffer({
    clinicId,
    actorUserId: user.id,
    actorPlatformRole: user.platformRole,
    stripe: stripeConfig.ready
      ? (getStripeClient() as unknown as NegotiatedStripePort)
      : null,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/account/billing");
  return {
    success: "Negotiated price withdrawn. Complimentary access is unchanged.",
  };
}
