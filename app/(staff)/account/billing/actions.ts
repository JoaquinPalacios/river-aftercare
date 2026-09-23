"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
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
