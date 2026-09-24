"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { formatBillingDate } from "@/lib/billing/billing-presentation";
import {
  customerKeepPracticeMessage,
  customerPlanDowngradeMessage,
  submitClinicDowngradeReversal,
  submitClinicPlanDowngrade,
} from "@/lib/billing/plan-downgrade";
import {
  beginClinicPlanDowngrade,
  cancelClinicDowngradePreparation,
  confirmClinicDowngradeSelection,
  keepSelectionMessage,
} from "@/lib/entitlements/downgrade-selection";
import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
} from "@/lib/billing/activation-gate";
import {
  assertClinicCheckoutActor,
  checkoutFailureMessage,
  createClinicCheckout,
} from "@/lib/billing/checkout";
import {
  assertClinicPortalActor,
  BILLING_PORTAL_RETURN_PATH,
  openCustomerPortalForClinic,
  portalFailureMessage,
} from "@/lib/billing/customer-portal";
import { billingIdentityFromForm } from "@/lib/billing/billing-identity";
import { saveBillingSetup } from "@/lib/billing/save-billing-setup";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface BillingSetupActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface CustomerPortalActionState {
  error?: string;
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

export async function continueToSecurePaymentAction(
  _previous: BillingSetupActionState,
  formData: FormData
): Promise<BillingSetupActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const session = await requireClinicAdmin();
  const actor = assertClinicCheckoutActor({
    role: session.clinicMembership.role,
    membershipSource: session.clinicMembership.source ?? "membership",
    sessionClinicId: session.clinicMembership.clinic.id,
    submittedClinicId:
      typeof formData.get("clinicId") === "string"
        ? String(formData.get("clinicId"))
        : null,
  });
  if (!actor.ok) {
    return {
      error: "Billing could not be started for this clinic.",
    };
  }

  const saved = await saveBillingSetup({
    clinicId: actor.clinicId,
    userId: session.user.id,
    form: billingIdentityFromForm(formData),
  });
  if (!saved.ok) {
    return { error: saved.error, fieldErrors: saved.fieldErrors };
  }

  const requestHeaders = await headers();
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  try {
    const checkout = await createClinicCheckout({
      clinicId: actor.clinicId,
      userId: session.user.id,
      successUrl: `${origin}${BILLING_COMPLETE_PATH}`,
      cancelUrl: `${origin}${BILLING_SETUP_PATH}?checkout=cancelled`,
    });
    if (!checkout.ok) {
      if (checkout.code === "checkout_already_completed") {
        redirect(BILLING_COMPLETE_PATH);
      }
      return { error: checkoutFailureMessage(checkout.code) };
    }
    redirect(checkout.url);
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }
    return {
      error: checkoutFailureMessage("checkout_failed"),
    };
  }
}

export async function openCustomerPortalAction(
  _previous: CustomerPortalActionState,
  formData: FormData
): Promise<CustomerPortalActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const session = await requireClinicAdmin();
  const actor = assertClinicPortalActor({
    role: session.clinicMembership.role,
    membershipSource: session.clinicMembership.source ?? "membership",
    sessionClinicId: session.clinicMembership.clinic.id,
    submittedClinicId:
      typeof formData.get("clinicId") === "string"
        ? String(formData.get("clinicId"))
        : null,
  });
  if (!actor.ok) {
    return { error: portalFailureMessage(actor.code) };
  }

  const requestHeaders = await headers();
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const staffOrigin = `${protocol}://${host}`;
  const returnUrl = `${staffOrigin}${BILLING_PORTAL_RETURN_PATH}`;

  try {
    const portal = await openCustomerPortalForClinic({
      clinicId: actor.clinicId,
      returnUrl,
      staffOrigin,
    });
    if (!portal.ok) {
      return { error: portalFailureMessage(portal.code) };
    }
    redirect(portal.url);
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }
    return { error: portalFailureMessage("portal_failed") };
  }
}

export interface GuideSelectionActionState {
  error?: string;
  accepted?: boolean;
}

export async function confirmDowngradeGuideSelectionAction(
  _previous: GuideSelectionActionState,
  formData: FormData
): Promise<GuideSelectionActionState> {
  const session = await requireClinicAdmin();
  if (session.clinicMembership.source === "operator_support") {
    return { error: keepSelectionMessage("forbidden") };
  }
  const selectedIds = formData
    .getAll("guideId")
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
  const result = await confirmClinicDowngradeSelection({
    actorUserId: session.user.id,
    clinicId: session.clinicMembership.clinic.id,
    selectedIds,
    operatorSupport: false,
  });
  revalidatePath("/account/billing");
  revalidatePath("/guides");
  revalidatePath(`/operator/clinics/${session.clinicMembership.clinic.id}`);
  if (!result.ok) {
    return { error: keepSelectionMessage(result.code) };
  }
  return { accepted: true };
}

export interface PlanChangeActionState {
  error?: string;
  notice?: "scheduled" | "kept" | "cancelled";
  effectiveLabel?: string;
}

async function customerPlanActor(): Promise<
  { ok: true; clinicId: string; userId: string } | { ok: false; error: string }
> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  const session = await requireClinicAdmin();
  if (
    session.clinicMembership.source === "operator_support" ||
    session.clinicMembership.role !== "ADMIN"
  ) {
    return {
      ok: false,
      error: "A clinic administrator has to make this plan change.",
    };
  }
  return {
    ok: true,
    clinicId: session.clinicMembership.clinic.id,
    userId: session.user.id,
  };
}

function revalidatePlanChange(clinicId: string) {
  revalidatePath("/account/billing");
  revalidatePath(`/operator/clinics/${clinicId}`);
}

export async function beginClinicPlanDowngradeAction(
  _previous: PlanChangeActionState,
  _formData: FormData
): Promise<PlanChangeActionState> {
  const actor = await customerPlanActor();
  if (!actor.ok) {
    return { error: actor.error };
  }
  const result = await beginClinicPlanDowngrade({ clinicId: actor.clinicId });
  revalidatePlanChange(actor.clinicId);
  if (!result.ok) {
    return { error: result.error };
  }
  redirect("/account/billing?change-plan=essential");
}

export async function scheduleClinicPlanDowngradeAction(
  _previous: PlanChangeActionState,
  _formData: FormData
): Promise<PlanChangeActionState> {
  const actor = await customerPlanActor();
  if (!actor.ok) {
    return { error: actor.error };
  }
  const result = await submitClinicPlanDowngrade({
    clinicId: actor.clinicId,
    actorUserId: actor.userId,
  });
  revalidatePlanChange(actor.clinicId);
  if (!result.ok) {
    return { error: customerPlanDowngradeMessage(result.code) };
  }
  return {
    notice: "scheduled",
    effectiveLabel: formatBillingDate(result.effectiveAt),
  };
}

export async function keepPracticeAction(
  _previous: PlanChangeActionState,
  _formData: FormData
): Promise<PlanChangeActionState> {
  const actor = await customerPlanActor();
  if (!actor.ok) {
    return { error: actor.error };
  }
  const result = await submitClinicDowngradeReversal({
    clinicId: actor.clinicId,
    actorUserId: actor.userId,
  });
  revalidatePlanChange(actor.clinicId);
  if (!result.ok) {
    return { error: customerKeepPracticeMessage(result.code) };
  }
  return { notice: "kept" };
}

export async function cancelClinicPlanChangeAction(
  _previous: PlanChangeActionState,
  _formData: FormData
): Promise<PlanChangeActionState> {
  const actor = await customerPlanActor();
  if (!actor.ok) {
    return { error: actor.error };
  }
  const result = await cancelClinicDowngradePreparation({
    clinicId: actor.clinicId,
  });
  revalidatePlanChange(actor.clinicId);
  if (!result.ok) {
    return { error: result.error };
  }
  return { notice: "cancelled" };
}
