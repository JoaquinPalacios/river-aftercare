import { spawnSync } from "node:child_process";
import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  createClinicCheckout,
  executeClinicCheckout,
  type CheckoutStripePort,
  type LockedCheckoutState,
} from "@/lib/billing/checkout";
import {
  executeCustomerPortalSession,
  portalConfigurationIsLaunchSafe,
} from "@/lib/billing/customer-portal";
import {
  classifyConfiguredStripePrice,
  stripeGroupBasePriceId,
  stripeGroupSiteAddonPriceId,
  stripePriceIdForPlan,
} from "@/lib/billing/price-map";
import { runStripeConfigCheck } from "@/lib/billing/stripe-config-check";
import { getStripeClientConfig } from "@/lib/billing/stripe-client";
import { STRIPE_WEBHOOK_EVENT_TYPES } from "@/lib/billing/stripe-event";
import {
  BILLING_TEST_ENV,
  GROUP_BILLING_TEST_ENV,
} from "@/tests/helpers/billing";

const LIVE_SECRET = "sk_live_sentinelkey";
const LIVE_RESTRICTED = "rk_live_sentinelrestricted";
const TEST_SECRET = "sk_test_sentinelkey";
const TEST_RESTRICTED = "rk_test_sentinelrestricted";
const WEBHOOK = "whsec_sentinelwebhook";
const PORTAL = "bpc_sentinelportal";

function priceEnv(prefix: string): Record<string, string> {
  return {
    STRIPE_ESSENTIAL_MONTHLY_PRICE_ID: `price_${prefix}_essential_m`,
    STRIPE_ESSENTIAL_YEARLY_PRICE_ID: `price_${prefix}_essential_y`,
    STRIPE_PRACTICE_MONTHLY_PRICE_ID: `price_${prefix}_practice_m`,
    STRIPE_PRACTICE_YEARLY_PRICE_ID: `price_${prefix}_practice_y`,
    STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID: `price_${prefix}_location_m`,
    STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID: `price_${prefix}_location_y`,
    STRIPE_GROUP_MONTHLY_PRICE_ID: `price_${prefix}_group_m`,
    STRIPE_GROUP_YEARLY_PRICE_ID: `price_${prefix}_group_y`,
    STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID: `price_${prefix}_site_m`,
    STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID: `price_${prefix}_site_y`,
  };
}

function credentials(input: {
  vercelEnv?: string;
  secret: string;
  webhook?: string;
}): Record<string, string> {
  return {
    ...(input.vercelEnv ? { VERCEL_ENV: input.vercelEnv } : {}),
    STRIPE_SECRET_KEY: input.secret,
    STRIPE_WEBHOOK_SECRET: input.webhook ?? WEBHOOK,
  };
}

function productionCatalogue(secret = LIVE_SECRET): Record<string, string> {
  return {
    ...credentials({ vercelEnv: "production", secret }),
    STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID: PORTAL,
    ...priceEnv("sentinelcat"),
  };
}

function expectNoSecretMaterial(report: string) {
  expect(report).not.toContain("sentinelkey");
  expect(report).not.toContain("sentinelrestricted");
  expect(report).not.toContain("sentinelwebhook");
  expect(report).not.toContain("sentinelportal");
  expect(report).not.toContain("sentinelcat");
  expect(report).not.toContain("sentinelduplicate");
}

function readyState(
  overrides: Partial<LockedCheckoutState> = {}
): LockedCheckoutState {
  return {
    clinicId: "clinic_a",
    userId: "user_a",
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
    offeredAdditionalSiteQuantity: null,
    termsAccepted: true,
    identity: {
      legalEntityName: "Harbour Dental Pty Ltd",
      billingEmail: "accounts@example.com",
      addressLine1: "10 River Street",
      addressLine2: null,
      city: "Tweed Heads",
      region: "NSW",
      postalCode: "2486",
      country: "AU",
    },
    ...overrides,
  };
}

function fakeStripe(): {
  port: CheckoutStripePort;
  sessions: unknown[];
} {
  const sessions: unknown[] = [];
  const port: CheckoutStripePort = {
    customers: {
      async create() {
        return { id: "cus_test" };
      },
      async update(id) {
        return { id };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          sessions.push(params);
          return {
            id: "cs_test_1",
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
            status: "open",
          };
        },
        async retrieve(id) {
          return { id, url: null, status: "expired", line_items: null };
        },
        async expire() {
          return {};
        },
      },
    },
  };
  return { port, sessions };
}

describe("Stripe live and test mode", () => {
  it("accepts live secret and restricted keys only in production", () => {
    for (const secret of [LIVE_SECRET, LIVE_RESTRICTED]) {
      const config = getStripeClientConfig(
        credentials({ vercelEnv: "production", secret })
      );
      expect(config.ready).toBe(true);
      if (config.ready) {
        expect(config.secretKey).toBe(secret);
      }
    }
  });

  it("rejects test keys in production", () => {
    for (const secret of [TEST_SECRET, TEST_RESTRICTED]) {
      const config = getStripeClientConfig(
        credentials({ vercelEnv: "production", secret })
      );
      expect(config).toEqual({
        ready: false,
        reason: "Test-mode Stripe keys are not permitted in production.",
      });
    }
  });

  it("accepts test secret and restricted keys in preview and local", () => {
    const targets = [
      { vercelEnv: "preview" as const },
      {},
      { vercelEnv: "development" },
    ];
    for (const target of targets) {
      for (const secret of [TEST_SECRET, TEST_RESTRICTED]) {
        const config = getStripeClientConfig(
          credentials({ ...target, secret })
        );
        expect(config.ready).toBe(true);
      }
    }
  });

  it("rejects live keys in preview and local development or test", () => {
    const targets = [
      { vercelEnv: "preview" },
      {},
      { vercelEnv: "development" },
      { vercelEnv: "test" },
    ];
    for (const target of targets) {
      for (const secret of [LIVE_SECRET, LIVE_RESTRICTED]) {
        const config = getStripeClientConfig(
          credentials({ ...target, secret })
        );
        expect(config).toEqual({
          ready: false,
          reason: "Live Stripe keys are not permitted outside production.",
        });
      }
    }
  });

  it("rejects malformed secret keys instead of accepting any Stripe-looking string", () => {
    for (const secret of [
      "sk_live_",
      "pk_live_publishable",
      "sk_test",
      "not-a-key",
    ]) {
      expect(
        getStripeClientConfig(credentials({ vercelEnv: "production", secret }))
          .ready
      ).toBe(false);
      expect(getStripeClientConfig(credentials({ secret })).ready).toBe(false);
    }
  });

  it("keeps a missing Stripe configuration lazy at the billing boundary", async () => {
    expect(getStripeClientConfig({}).ready).toBe(false);
    expect(
      getStripeClientConfig({ STRIPE_SECRET_KEY: TEST_SECRET }).ready
    ).toBe(false);
    expect(
      getStripeClientConfig({ STRIPE_WEBHOOK_SECRET: WEBHOOK }).ready
    ).toBe(false);
    const result = await createClinicCheckout({
      clinicId: "clinic_a",
      userId: "user_a",
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      env: {},
      db: {} as never,
    });
    expect(result).toEqual({ ok: false, code: "checkout_unavailable" });
    const productionTestKey = await createClinicCheckout({
      clinicId: "clinic_a",
      userId: "user_a",
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      env: credentials({ vercelEnv: "production", secret: TEST_SECRET }),
      db: {} as never,
    });
    expect(productionTestKey).toEqual({
      ok: false,
      code: "checkout_unavailable",
    });
  });

  it("requires a webhook secret at the webhook configuration boundary", () => {
    expect(
      getStripeClientConfig(
        credentials({
          vercelEnv: "production",
          secret: LIVE_SECRET,
          webhook: "not-a-webhook-secret",
        })
      )
    ).toEqual({
      ready: false,
      reason: "Stripe webhook secret is malformed.",
    });
  });
});

describe("Stripe configuration check", () => {
  it("accepts a complete live production catalogue without printing secrets", () => {
    const result = runStripeConfigCheck(productionCatalogue());
    expect(result.exitCode).toBe(0);
    expect(result.report).toContain("Stripe deployment: production");
    expect(result.report).toContain("Stripe mode: live");
    expect(result.report).toContain("STRIPE_SECRET_KEY: configured (live)");
    expect(result.report).toContain("STRIPE_WEBHOOK_SECRET: configured");
    expect(result.report).toContain(
      "STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID: configured"
    );
    expect(result.report).toContain("Essential monthly: configured");
    expect(result.report).toContain(
      "Practice additional location yearly: configured"
    );
    expect(result.report).toContain("Group additional site yearly: configured");
    expect(result.report).toContain("Catalogue unique: yes");
    expect(result.report).toContain("Stripe configuration: ok");
    expectNoSecretMaterial(result.report);
  });

  it("accepts a restricted live key and a complete preview test catalogue", () => {
    expect(
      runStripeConfigCheck(productionCatalogue(LIVE_RESTRICTED))
    ).toMatchObject({ exitCode: 0 });
    const preview = runStripeConfigCheck({
      VERCEL_ENV: "preview",
      STRIPE_SECRET_KEY: TEST_RESTRICTED,
      STRIPE_WEBHOOK_SECRET: WEBHOOK,
      STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID: PORTAL,
      ...priceEnv("sentinelcat"),
    });
    expect(preview.exitCode).toBe(0);
    expect(preview.report).toContain("Stripe deployment: preview");
    expect(preview.report).toContain("Stripe mode: test");
    expect(preview.report).toContain("STRIPE_SECRET_KEY: configured (test)");
    expectNoSecretMaterial(preview.report);
  });

  it("fails closed for the wrong mode, duplicates, and a missing production price", () => {
    const wrongMode = runStripeConfigCheck({
      ...productionCatalogue(),
      STRIPE_SECRET_KEY: TEST_SECRET,
    });
    expect(wrongMode.exitCode).toBe(1);
    expect(wrongMode.report).toContain("Stripe mode: rejected");
    expect(wrongMode.report).toContain(
      "Test-mode Stripe keys are not permitted in production."
    );
    expectNoSecretMaterial(wrongMode.report);

    const duplicate = runStripeConfigCheck({
      ...productionCatalogue(),
      STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID:
        "price_sentinelduplicate",
      STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID: "price_sentinelduplicate",
    });
    expect(duplicate.exitCode).toBe(1);
    expect(duplicate.report).toContain("Catalogue unique: no");
    expectNoSecretMaterial(duplicate.report);

    const missing = runStripeConfigCheck({
      ...productionCatalogue(),
      STRIPE_GROUP_MONTHLY_PRICE_ID: "",
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.report).toContain("Group monthly: missing");
    expect(missing.report).not.toContain("sk_live_");
  });

  it("treats local Stripe as optional and still rejects a live key", () => {
    const absent = runStripeConfigCheck({});
    expect(absent.exitCode).toBe(0);
    expect(absent.report).toContain("Stripe deployment: local");
    expect(absent.report).toContain("Stripe mode: not configured");
    expect(absent.report).toContain("Essential monthly: not configured");
    expect(absent.report).toContain("Stripe configuration: ok");

    const partial = runStripeConfigCheck({
      ...BILLING_TEST_ENV,
    });
    expect(partial.exitCode).toBe(0);
    expect(partial.report).toContain("Group monthly: not configured");
    expect(partial.report).toContain("Catalogue unique: yes");

    const live = runStripeConfigCheck({
      STRIPE_SECRET_KEY: LIVE_SECRET,
      STRIPE_WEBHOOK_SECRET: WEBHOOK,
    });
    expect(live.exitCode).toBe(1);
    expect(live.report).toContain(
      "Live Stripe keys are not permitted outside production."
    );
    expectNoSecretMaterial(live.report);
  });

  it("runs the read-only command without printing configured secrets", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--disable-warning=ExperimentalWarning",
        "scripts/stripe-config-check.mjs",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          VERCEL_ENV: "production",
          STRIPE_SECRET_KEY: LIVE_SECRET,
          STRIPE_WEBHOOK_SECRET: WEBHOOK,
          STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID: PORTAL,
          ...priceEnv("sentinelcat"),
        },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Stripe mode: live");
    expectNoSecretMaterial(`${result.stdout}\n${result.stderr}`);
  });
});

describe("catalogue and checkout behaviour under the mode guard", () => {
  it("loads every current Price slot and rejects duplicates", () => {
    expect(
      stripePriceIdForPlan("ESSENTIAL", "MONTHLY", GROUP_BILLING_TEST_ENV)
    ).toBe("price_test_essential_monthly");
    expect(
      stripePriceIdForPlan("ESSENTIAL", "YEARLY", GROUP_BILLING_TEST_ENV)
    ).toBe("price_test_essential_yearly");
    expect(
      stripePriceIdForPlan("PRACTICE", "MONTHLY", GROUP_BILLING_TEST_ENV)
    ).toBe("price_test_practice_monthly");
    expect(
      stripePriceIdForPlan("PRACTICE", "YEARLY", GROUP_BILLING_TEST_ENV)
    ).toBe("price_test_practice_yearly");
    expect(stripeGroupBasePriceId("MONTHLY", GROUP_BILLING_TEST_ENV)).toBe(
      "price_test_group_monthly"
    );
    expect(stripeGroupBasePriceId("YEARLY", GROUP_BILLING_TEST_ENV)).toBe(
      "price_test_group_yearly"
    );
    expect(stripeGroupSiteAddonPriceId("MONTHLY", GROUP_BILLING_TEST_ENV)).toBe(
      "price_test_group_site_monthly"
    );
    expect(stripeGroupSiteAddonPriceId("YEARLY", GROUP_BILLING_TEST_ENV)).toBe(
      "price_test_group_site_yearly"
    );
    expect(
      classifyConfiguredStripePrice(
        "price_test_practice_location_monthly",
        GROUP_BILLING_TEST_ENV
      )
    ).toEqual({
      role: "PRACTICE_LOCATION_ADDON",
      interval: "MONTHLY",
      priceId: "price_test_practice_location_monthly",
    });
    expect(() =>
      stripePriceIdForPlan("ESSENTIAL", "MONTHLY", {
        ...GROUP_BILLING_TEST_ENV,
        STRIPE_GROUP_YEARLY_PRICE_ID:
          GROUP_BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID,
      })
    ).toThrow(/unique/i);
  });

  it("fails a missing base price and still allows a base-only Group offer", async () => {
    const missing = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: readyState(),
        env: {
          ...BILLING_TEST_ENV,
          STRIPE_ESSENTIAL_MONTHLY_PRICE_ID: "",
        },
        stripe: missing.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "price_not_configured" });
    expect(missing.sessions).toHaveLength(0);

    const baseOnly = fakeStripe();
    const zero = await executeClinicCheckout({
      state: readyState({
        commercialPlan: "GROUP",
        billingInterval: "MONTHLY",
        offeredAdditionalSiteQuantity: 0,
      }),
      env: {
        ...BILLING_TEST_ENV,
        STRIPE_GROUP_MONTHLY_PRICE_ID: "price_test_group_monthly",
      },
      stripe: baseOnly.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(zero.ok).toBe(true);
    expect(baseOnly.sessions[0]).toMatchObject({
      line_items: [{ price: "price_test_group_monthly", quantity: 1 }],
    });

    const missingAddon = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: readyState({
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          offeredAdditionalSiteQuantity: 2,
        }),
        env: {
          ...BILLING_TEST_ENV,
          STRIPE_GROUP_MONTHLY_PRICE_ID: "price_test_group_monthly",
        },
        stripe: missingAddon.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "price_not_configured" });
  });

  it("keeps Essential and Practice Checkout on the server Price for that plan", async () => {
    const essential = fakeStripe();
    await executeClinicCheckout({
      state: readyState(),
      env: BILLING_TEST_ENV,
      stripe: essential.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(essential.sessions[0]).toMatchObject({
      line_items: [
        {
          price: BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID,
          quantity: 1,
        },
      ],
    });

    const practice = fakeStripe();
    await executeClinicCheckout({
      state: readyState({
        commercialPlan: "PRACTICE",
        billingInterval: "YEARLY",
      }),
      env: BILLING_TEST_ENV,
      stripe: practice.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(practice.sessions[0]).toMatchObject({
      line_items: [
        {
          price: BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID,
          quantity: 1,
        },
      ],
    });
  });

  it("keeps Customer Portal plan and quantity changes disabled", async () => {
    expect(
      portalConfigurationIsLaunchSafe({
        active: true,
        invoiceHistoryEnabled: true,
        paymentMethodUpdateEnabled: true,
        subscriptionCancelEnabled: true,
        subscriptionCancelMode: "at_period_end",
        subscriptionCancelProration: "none",
        subscriptionUpdateEnabled: true,
        customerUpdateEnabled: false,
        customerAllowedUpdates: [],
        loginPageEnabled: false,
      })
    ).toBe(false);

    const missing = await executeCustomerPortalSession({
      clinicId: "clinic_a",
      stripeCustomerId: "cus_clinic_a",
      entitlementStatus: EntitlementStatus.ACTIVE,
      billingStatus: BillingStatus.ACTIVE,
      returnUrl: "https://app.riveraftercare.com.au/account/billing",
      staffOrigin: "https://app.riveraftercare.com.au",
      env: { VERCEL_ENV: "production" },
      stripe: {
        billingPortal: {
          configurations: {
            async retrieve() {
              throw new Error("portal retrieve");
            },
          },
          sessions: {
            async create() {
              throw new Error("portal create");
            },
          },
        },
      },
    });
    expect(missing).toEqual({ ok: false, code: "portal_not_configured" });
  });

  it("documents the webhook event set the application consumes", () => {
    expect([...STRIPE_WEBHOOK_EVENT_TYPES]).toEqual([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "invoice.paid",
      "invoice.payment_failed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "subscription_schedule.updated",
      "subscription_schedule.released",
      "subscription_schedule.completed",
      "subscription_schedule.canceled",
    ]);
  });
});
