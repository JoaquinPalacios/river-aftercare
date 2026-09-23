import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assertClinicPortalActor,
  clinicSupportsCustomerPortal,
  executeCustomerPortalSession,
  isControlledBillingReturnUrl,
  isStripeBillingPortalUrl,
  portalConfigurationIsLaunchSafe,
  type CustomerPortalStripePort,
  type PortalFeatureSnapshot,
} from "@/lib/billing/customer-portal";

const SAFE_FEATURES: PortalFeatureSnapshot = {
  active: true,
  invoiceHistoryEnabled: true,
  paymentMethodUpdateEnabled: true,
  subscriptionCancelEnabled: true,
  subscriptionCancelMode: "at_period_end",
  subscriptionCancelProration: "none",
  subscriptionUpdateEnabled: false,
  customerUpdateEnabled: false,
  customerAllowedUpdates: [],
  loginPageEnabled: false,
};

function configuration() {
  return {
    id: "bpc_test_portal",
    active: true,
    login_page: { enabled: false },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
      subscription_update: { enabled: false },
      customer_update: { enabled: false, allowed_updates: [] as string[] },
    },
  };
}

function stripePort(overrides?: {
  configuration?: ReturnType<typeof configuration>;
  url?: string;
}): {
  stripe: CustomerPortalStripePort;
  created: Array<Record<string, string>>;
} {
  const created: Array<Record<string, string>> = [];
  return {
    created,
    stripe: {
      billingPortal: {
        configurations: {
          async retrieve() {
            return overrides?.configuration ?? configuration();
          },
        },
        sessions: {
          async create(params) {
            created.push(params);
            return {
              url:
                overrides?.url ??
                "https://billing.stripe.com/p/session/test_session",
            };
          },
        },
      },
    },
  };
}

const ENV = {
  STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID: "bpc_test_portal",
};

describe("customer portal access", () => {
  it("lets a clinic admin open a portal session for that clinic", async () => {
    expect(
      assertClinicPortalActor({
        role: "ADMIN",
        membershipSource: "membership",
        sessionClinicId: "clinic_a",
        submittedClinicId: "clinic_a",
      })
    ).toEqual({ ok: true, clinicId: "clinic_a" });

    const port = stripePort();
    const result = await executeCustomerPortalSession({
      clinicId: "clinic_a",
      stripeCustomerId: "cus_clinic_a",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      returnUrl: "https://app.riveraftercare.com.au/account/billing",
      staffOrigin: "https://app.riveraftercare.com.au",
      env: ENV,
      stripe: port.stripe,
    });
    expect(result).toEqual({
      ok: true,
      url: "https://billing.stripe.com/p/session/test_session",
    });
    expect(port.created).toEqual([
      {
        customer: "cus_clinic_a",
        configuration: "bpc_test_portal",
        return_url: "https://app.riveraftercare.com.au/account/billing",
      },
    ]);
  });

  it("refuses staff, operator support, and another clinic", () => {
    expect(
      assertClinicPortalActor({
        role: "STAFF",
        membershipSource: "membership",
        sessionClinicId: "clinic_a",
      }).ok
    ).toBe(false);
    expect(
      assertClinicPortalActor({
        role: "ADMIN",
        membershipSource: "operator_support",
        sessionClinicId: "clinic_a",
      })
    ).toMatchObject({ ok: false, code: "operator_forbidden" });
    expect(
      assertClinicPortalActor({
        role: "ADMIN",
        membershipSource: "membership",
        sessionClinicId: "clinic_a",
        submittedClinicId: "clinic_b",
      })
    ).toMatchObject({ ok: false, code: "tenancy" });
  });

  it("ignores a browser-supplied customer id and uses the clinic profile", async () => {
    const port = stripePort();
    const browserCustomerId = "cus_attacker";
    const result = await executeCustomerPortalSession({
      clinicId: "clinic_a",
      stripeCustomerId: "cus_clinic_a",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.PAST_DUE,
      returnUrl: "http://app.localhost:3000/account/billing",
      staffOrigin: "http://app.localhost:3000",
      env: ENV,
      stripe: port.stripe,
    });
    expect(result.ok).toBe(true);
    expect(port.created[0]?.customer).toBe("cus_clinic_a");
    expect(port.created[0]?.customer).not.toBe(browserCustomerId);
    expect(JSON.stringify(port.created)).not.toContain("checkout");
  });

  it("refuses a clinic without a Stripe customer or an offer that has not started", async () => {
    const port = stripePort();
    const missing = await executeCustomerPortalSession({
      clinicId: "clinic_a",
      stripeCustomerId: null,
      entitlementStatus: EntitlementStatus.PENDING,
      billingStatus: BillingStatus.OFFER_PREPARED,
      returnUrl: "https://app.riveraftercare.com.au/account/billing",
      staffOrigin: "https://app.riveraftercare.com.au",
      env: ENV,
      stripe: port.stripe,
    });
    expect(missing).toMatchObject({ ok: false, code: "customer_missing" });
    expect(port.created).toHaveLength(0);
    expect(
      clinicSupportsCustomerPortal({
        stripeCustomerId: "cus_clinic_a",
        entitlementStatus: EntitlementStatus.PENDING,
        billingStatus: BillingStatus.OFFER_PREPARED,
      })
    ).toBe(false);
  });

  it("rejects a return URL the server did not construct", async () => {
    const staffOrigin = "https://app.riveraftercare.com.au";
    expect(
      isControlledBillingReturnUrl(
        "https://app.riveraftercare.com.au/account/billing",
        staffOrigin
      )
    ).toBe(true);
    expect(
      isControlledBillingReturnUrl(
        "https://app.riveraftercare.com.au/account/billing?next=https://evil.test",
        staffOrigin
      )
    ).toBe(false);
    expect(
      isControlledBillingReturnUrl(
        "https://evil.test/account/billing",
        staffOrigin
      )
    ).toBe(false);
    const port = stripePort();
    const result = await executeCustomerPortalSession({
      clinicId: "clinic_a",
      stripeCustomerId: "cus_clinic_a",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      returnUrl: "https://evil.test/phish",
      staffOrigin,
      env: ENV,
      stripe: port.stripe,
    });
    expect(result).toMatchObject({ ok: false, code: "return_url_rejected" });
    expect(port.created).toHaveLength(0);
  });

  it("refuses an unsafe portal configuration and does not create a subscription", async () => {
    expect(portalConfigurationIsLaunchSafe(SAFE_FEATURES)).toBe(true);
    expect(
      portalConfigurationIsLaunchSafe({
        ...SAFE_FEATURES,
        subscriptionUpdateEnabled: true,
      })
    ).toBe(false);
    expect(
      portalConfigurationIsLaunchSafe({
        ...SAFE_FEATURES,
        subscriptionCancelMode: "immediately",
      })
    ).toBe(false);
    expect(
      portalConfigurationIsLaunchSafe({
        ...SAFE_FEATURES,
        subscriptionCancelProration: "create_prorations",
      })
    ).toBe(false);
    expect(
      portalConfigurationIsLaunchSafe({
        ...SAFE_FEATURES,
        customerUpdateEnabled: true,
        customerAllowedUpdates: ["tax_id"],
      })
    ).toBe(false);
    expect(
      portalConfigurationIsLaunchSafe({
        ...SAFE_FEATURES,
        loginPageEnabled: true,
      })
    ).toBe(false);

    const unsafe = configuration();
    unsafe.features.subscription_update.enabled = true;
    const port = stripePort({ configuration: unsafe });
    const result = await executeCustomerPortalSession({
      clinicId: "clinic_a",
      stripeCustomerId: "cus_clinic_a",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      returnUrl: "https://app.riveraftercare.com.au/account/billing",
      staffOrigin: "https://app.riveraftercare.com.au",
      env: ENV,
      stripe: port.stripe,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "portal_configuration_unsafe",
    });
    expect(port.created).toHaveLength(0);
    expect(
      isStripeBillingPortalUrl("https://billing.stripe.com/p/session/x")
    ).toBe(true);
    expect(
      isStripeBillingPortalUrl("https://checkout.stripe.com/c/pay/x")
    ).toBe(false);
  });
});
