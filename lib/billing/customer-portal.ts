import "server-only";

import { BillingStatus, EntitlementStatus } from "@prisma/client";

import {
  readTrimmedEnv,
  STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV,
  type Env,
} from "@/lib/billing/env";
import { logStripeBilling } from "@/lib/billing/log";
import { getPrisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe-client";

export const BILLING_PORTAL_RETURN_PATH = "/account/billing";

const PORTAL_BILLING_STATUSES = new Set<BillingStatus>([
  BillingStatus.PAYMENT_PENDING,
  BillingStatus.ACTIVE,
  BillingStatus.PAST_DUE,
  BillingStatus.UNPAID,
  BillingStatus.CANCEL_AT_PERIOD_END,
  BillingStatus.ENDED,
]);

export type PortalActorDecision =
  | { ok: true; clinicId: string }
  | {
      ok: false;
      code: "staff_forbidden" | "operator_forbidden" | "tenancy";
    };

export function assertClinicPortalActor(input: {
  role: "ADMIN" | "STAFF";
  membershipSource: "membership" | "operator_support";
  sessionClinicId: string;
  submittedClinicId?: string | null;
}): PortalActorDecision {
  if (input.membershipSource === "operator_support") {
    return { ok: false, code: "operator_forbidden" };
  }
  if (input.role !== "ADMIN") {
    return { ok: false, code: "staff_forbidden" };
  }
  const submitted = input.submittedClinicId?.trim() ?? "";
  if (submitted && submitted !== input.sessionClinicId) {
    return { ok: false, code: "tenancy" };
  }
  return { ok: true, clinicId: input.sessionClinicId };
}

export function clinicSupportsCustomerPortal(input: {
  stripeCustomerId: string | null;
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
}): boolean {
  if (
    !input.stripeCustomerId ||
    !input.entitlementStatus ||
    !input.billingStatus
  ) {
    return false;
  }
  return PORTAL_BILLING_STATUSES.has(input.billingStatus);
}

export type PortalFeatureSnapshot = {
  active: boolean;
  invoiceHistoryEnabled: boolean;
  paymentMethodUpdateEnabled: boolean;
  subscriptionCancelEnabled: boolean;
  subscriptionCancelMode: string | null;
  subscriptionCancelProration: string | null;
  subscriptionUpdateEnabled: boolean;
  customerUpdateEnabled: boolean;
  customerAllowedUpdates: readonly string[];
  loginPageEnabled: boolean;
};

/**
 * Launch portal: invoices, payment methods, and cancel at period end.
 * Plan switching, quantity, promotion codes, immediate cancel, prorated
 * cancel credits, tax-id edits, and the hosted portal login page are refused.
 */
export function portalConfigurationIsLaunchSafe(
  features: PortalFeatureSnapshot
): boolean {
  if (!features.active) {
    return false;
  }
  if (!features.invoiceHistoryEnabled || !features.paymentMethodUpdateEnabled) {
    return false;
  }
  if (
    !features.subscriptionCancelEnabled ||
    features.subscriptionCancelMode !== "at_period_end" ||
    features.subscriptionCancelProration !== "none"
  ) {
    return false;
  }
  if (features.subscriptionUpdateEnabled) {
    return false;
  }
  if (
    features.customerUpdateEnabled &&
    features.customerAllowedUpdates.includes("tax_id")
  ) {
    return false;
  }
  if (features.loginPageEnabled) {
    return false;
  }
  return true;
}

export function isControlledBillingReturnUrl(
  url: string,
  staffOrigin: string
): boolean {
  let parsed: URL;
  let expected: URL;
  try {
    parsed = new URL(url);
    expected = new URL(staffOrigin);
  } catch {
    return false;
  }
  if (
    parsed.username ||
    parsed.password ||
    expected.username ||
    expected.password
  ) {
    return false;
  }
  if (parsed.origin !== expected.origin) {
    return false;
  }
  if (parsed.pathname !== BILLING_PORTAL_RETURN_PATH) {
    return false;
  }
  if (parsed.search || parsed.hash) {
    return false;
  }
  if (expected.protocol === "https:") {
    return true;
  }
  return (
    expected.protocol === "http:" &&
    (expected.hostname === "localhost" ||
      expected.hostname.endsWith(".localhost"))
  );
}

export function isStripeBillingPortalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.hostname === "billing.stripe.com"
    );
  } catch {
    return false;
  }
}

export type PortalConfigurationRecord = {
  id: string;
  active: boolean;
  login_page: { enabled: boolean };
  features: {
    invoice_history: { enabled: boolean };
    payment_method_update: { enabled: boolean };
    subscription_cancel: {
      enabled: boolean;
      mode: string;
      proration_behavior: string;
    };
    subscription_update: { enabled: boolean };
    customer_update: { enabled: boolean; allowed_updates: string[] };
  };
};

export type CustomerPortalStripePort = {
  billingPortal: {
    configurations: {
      retrieve(id: string): Promise<PortalConfigurationRecord>;
    };
    sessions: {
      create(params: {
        customer: string;
        configuration: string;
        return_url: string;
      }): Promise<{ url: string }>;
    };
  };
};

export type CustomerPortalFailureCode =
  | "staff_forbidden"
  | "operator_forbidden"
  | "tenancy"
  | "customer_missing"
  | "portal_unavailable"
  | "portal_not_configured"
  | "portal_configuration_unsafe"
  | "return_url_rejected"
  | "portal_failed";

export function portalFailureMessage(code: CustomerPortalFailureCode): string {
  switch (code) {
    case "staff_forbidden":
    case "operator_forbidden":
    case "tenancy":
      return "Billing could not be opened for this clinic.";
    case "customer_missing":
    case "portal_unavailable":
    case "portal_not_configured":
    case "portal_configuration_unsafe":
    case "portal_failed":
      return "Billing management isn’t available right now. Contact River Aftercare if this continues.";
    case "return_url_rejected":
      return "Billing could not be opened for this clinic.";
  }
}

export function portalFeatureSnapshot(
  configuration: PortalConfigurationRecord
): PortalFeatureSnapshot {
  return {
    active: configuration.active,
    invoiceHistoryEnabled: configuration.features.invoice_history.enabled,
    paymentMethodUpdateEnabled:
      configuration.features.payment_method_update.enabled,
    subscriptionCancelEnabled:
      configuration.features.subscription_cancel.enabled,
    subscriptionCancelMode: configuration.features.subscription_cancel.mode,
    subscriptionCancelProration:
      configuration.features.subscription_cancel.proration_behavior,
    subscriptionUpdateEnabled:
      configuration.features.subscription_update.enabled,
    customerUpdateEnabled: configuration.features.customer_update.enabled,
    customerAllowedUpdates:
      configuration.features.customer_update.allowed_updates,
    loginPageEnabled: configuration.login_page.enabled,
  };
}

export async function executeCustomerPortalSession(input: {
  clinicId: string;
  stripeCustomerId: string | null;
  entitlementStatus: EntitlementStatus | null;
  billingStatus: BillingStatus | null;
  returnUrl: string;
  staffOrigin: string;
  env?: Env;
  stripe: CustomerPortalStripePort;
}): Promise<
  { ok: true; url: string } | { ok: false; code: CustomerPortalFailureCode }
> {
  const fail = (
    code: CustomerPortalFailureCode,
    reason: string
  ): { ok: false; code: CustomerPortalFailureCode } => {
    logStripeBilling({
      event: "customer_portal_session_failed",
      clinicId: input.clinicId,
      reason,
    });
    return { ok: false, code };
  };

  if (!isControlledBillingReturnUrl(input.returnUrl, input.staffOrigin)) {
    return fail("return_url_rejected", "return_url");
  }
  if (
    !clinicSupportsCustomerPortal({
      stripeCustomerId: input.stripeCustomerId,
      entitlementStatus: input.entitlementStatus,
      billingStatus: input.billingStatus,
    })
  ) {
    return fail(
      input.stripeCustomerId ? "portal_unavailable" : "customer_missing",
      input.stripeCustomerId ? "entitlement" : "customer_missing"
    );
  }

  const configurationId = readTrimmedEnv(
    STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV,
    input.env
  );
  if (!configurationId || !configurationId.startsWith("bpc_")) {
    return fail("portal_not_configured", "configuration_missing");
  }

  try {
    const configuration =
      await input.stripe.billingPortal.configurations.retrieve(configurationId);
    if (
      !portalConfigurationIsLaunchSafe(portalFeatureSnapshot(configuration))
    ) {
      return fail("portal_configuration_unsafe", "configuration_unsafe");
    }
    const session = await input.stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId!,
      configuration: configurationId,
      return_url: input.returnUrl,
    });
    if (!isStripeBillingPortalUrl(session.url)) {
      return fail("portal_failed", "portal_url");
    }
    logStripeBilling({
      event: "customer_portal_session_created",
      clinicId: input.clinicId,
    });
    return { ok: true, url: session.url };
  } catch {
    return fail("portal_failed", "stripe_request_failed");
  }
}

export async function openCustomerPortalForClinic(input: {
  clinicId: string;
  returnUrl: string;
  staffOrigin: string;
  env?: Env;
  stripe?: CustomerPortalStripePort;
}): Promise<
  { ok: true; url: string } | { ok: false; code: CustomerPortalFailureCode }
> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: input.clinicId },
    select: {
      billingProfile: { select: { stripeCustomerId: true } },
      entitlement: {
        select: { billingStatus: true, entitlementStatus: true },
      },
    },
  });
  if (!clinic) {
    return { ok: false, code: "portal_unavailable" };
  }
  const stripeCustomerId = clinic.billingProfile?.stripeCustomerId ?? null;
  const entitlementStatus = clinic.entitlement?.entitlementStatus ?? null;
  const billingStatus = clinic.entitlement?.billingStatus ?? null;
  if (
    !clinicSupportsCustomerPortal({
      stripeCustomerId,
      entitlementStatus,
      billingStatus,
    })
  ) {
    return {
      ok: false,
      code: stripeCustomerId ? "portal_unavailable" : "customer_missing",
    };
  }

  let stripe = input.stripe;
  if (!stripe) {
    try {
      stripe = getStripeClient(input.env);
    } catch {
      return { ok: false, code: "portal_not_configured" };
    }
  }
  return executeCustomerPortalSession({
    clinicId: input.clinicId,
    stripeCustomerId,
    entitlementStatus,
    billingStatus,
    returnUrl: input.returnUrl,
    staffOrigin: input.staffOrigin,
    env: input.env,
    stripe,
  });
}
