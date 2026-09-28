import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  executeClinicCheckout,
  type CheckoutStripePort,
  type LockedCheckoutState,
} from "@/lib/billing/checkout";
import { BILLING_TEST_ENV, GROUP_BILLING_TEST_ENV } from "./helpers/billing";

const GROUP_MONTHLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
const GROUP_YEARLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_YEARLY_PRICE_ID;
const ADDON_MONTHLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID;
const ADDON_YEARLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID;

describe("Group Checkout line items", () => {
  it("sells a base-only Group offer as one base line", async () => {
    for (const [interval, priceId] of [
      ["MONTHLY", GROUP_MONTHLY],
      ["YEARLY", GROUP_YEARLY],
    ] as const) {
      const stripe = fakeStripe();
      const result = await executeClinicCheckout({
        state: groupState({
          billingInterval: interval,
          offeredAdditionalSiteQuantity: 0,
        }),
        env: GROUP_BILLING_TEST_ENV,
        stripe: stripe.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      });
      expect(result.ok).toBe(true);
      expect(stripe.sessions.created[0]).toMatchObject({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          clinicId: "clinic_a",
          commercialPlan: "GROUP",
          billingInterval: interval,
          offeredAdditionalSiteQuantity: "0",
        },
      });
      expect(
        (stripe.sessions.created[0] as { line_items: unknown[] }).line_items
      ).toHaveLength(1);
    }
  });

  it("sells additional sites as one quantity on the matching interval", async () => {
    const monthly = fakeStripe();
    await executeClinicCheckout({
      state: groupState({ offeredAdditionalSiteQuantity: 2 }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: monthly.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(monthly.sessions.created[0]).toMatchObject({
      line_items: [
        { price: GROUP_MONTHLY, quantity: 1 },
        { price: ADDON_MONTHLY, quantity: 2 },
      ],
    });

    const annual = fakeStripe();
    await executeClinicCheckout({
      state: groupState({
        billingInterval: "YEARLY",
        offeredAdditionalSiteQuantity: 3,
      }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: annual.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(annual.sessions.created[0]).toMatchObject({
      line_items: [
        { price: GROUP_YEARLY, quantity: 1 },
        { price: ADDON_YEARLY, quantity: 3 },
      ],
    });
    const prices = (
      annual.sessions.created[0] as {
        line_items: Array<{ price: string }>;
      }
    ).line_items.map((item) => item.price);
    expect(prices).not.toContain(GROUP_MONTHLY);
    expect(prices).not.toContain(ADDON_MONTHLY);
  });

  it("uses the persisted offer quantity and refuses a missing offer", async () => {
    const stripe = fakeStripe();
    await executeClinicCheckout({
      state: groupState({ offeredAdditionalSiteQuantity: 2 }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(stripe.sessions.created[0]).toMatchObject({
      line_items: [
        { price: GROUP_MONTHLY, quantity: 1 },
        { price: ADDON_MONTHLY, quantity: 2 },
      ],
    });

    const missing = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: groupState({ offeredAdditionalSiteQuantity: null }),
        env: GROUP_BILLING_TEST_ENV,
        stripe: missing.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "group_offer_missing" });
    expect(missing.sessions.created).toHaveLength(0);

    await expect(
      executeClinicCheckout({
        state: groupState({
          offeredAdditionalSiteQuantity: 1.5,
          termsAccepted: false,
        }),
        env: GROUP_BILLING_TEST_ENV,
        stripe: missing.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "group_offer_invalid" });
  });

  it("requires Terms, blocks a second subscription, and fails closed on missing prices", async () => {
    const stripe = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: groupState({ termsAccepted: false }),
        env: GROUP_BILLING_TEST_ENV,
        stripe: stripe.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "terms_required" });

    await expect(
      executeClinicCheckout({
        state: groupState({ stripeSubscriptionId: "sub_existing" }),
        env: GROUP_BILLING_TEST_ENV,
        stripe: stripe.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "subscription_exists" });

    const baseOnlyEnv = {
      ...BILLING_TEST_ENV,
      STRIPE_GROUP_MONTHLY_PRICE_ID: GROUP_MONTHLY,
    };
    const baseOnly = fakeStripe();
    const zero = await executeClinicCheckout({
      state: groupState({ offeredAdditionalSiteQuantity: 0 }),
      env: baseOnlyEnv,
      stripe: baseOnly.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(zero.ok).toBe(true);
    expect(baseOnly.sessions.created[0]).toMatchObject({
      line_items: [{ price: GROUP_MONTHLY, quantity: 1 }],
    });

    const missingAddon = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: groupState({ offeredAdditionalSiteQuantity: 2 }),
        env: baseOnlyEnv,
        stripe: missingAddon.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "price_not_configured" });
    expect(missingAddon.sessions.created).toHaveLength(0);

    const missingBase = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: groupState({
          billingInterval: "YEARLY",
          offeredAdditionalSiteQuantity: 0,
        }),
        env: baseOnlyEnv,
        stripe: missingBase.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "price_not_configured" });
    expect(missingBase.sessions.created).toHaveLength(0);
  });

  it("does not open a second Checkout session for the same Group offer", async () => {
    const stripe = fakeStripe();
    const first = await executeClinicCheckout({
      state: groupState({ offeredAdditionalSiteQuantity: 2 }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(first).toMatchObject({ ok: true, reusedSession: false });
    const second = await executeClinicCheckout({
      state: groupState({
        offeredAdditionalSiteQuantity: 2,
        stripeCustomerId: "cus_test",
        stripeCheckoutSessionId: "cs_test_1",
      }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    });
    expect(second).toMatchObject({ ok: true, reusedSession: true });
    expect(stripe.sessions.created).toHaveLength(1);
  });
});

function groupState(
  overrides: Partial<LockedCheckoutState> = {}
): LockedCheckoutState {
  return {
    clinicId: "clinic_a",
    userId: "user_a",
    commercialPlan: "GROUP",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
    offeredAdditionalSiteQuantity: 0,
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

function fakeStripe() {
  const sessions: { created: unknown[] } = { created: [] };
  const stored = new Map<
    string,
    {
      status: string;
      url: string;
      lineItems: Array<{ price: string; quantity: number }>;
    }
  >();
  let sessionSeq = 0;
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
          sessionSeq += 1;
          const id = `cs_test_${sessionSeq}`;
          sessions.created.push(params);
          stored.set(id, {
            status: "open",
            url: `https://checkout.stripe.com/c/pay/${id}`,
            lineItems: params.line_items,
          });
          return {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            status: "open",
          };
        },
        async retrieve(id) {
          const session = stored.get(id);
          return {
            id,
            url: session?.url ?? null,
            status: session?.status ?? "expired",
            line_items: {
              data: (session?.lineItems ?? []).map((item) => ({
                price: { id: item.price },
                quantity: item.quantity,
              })),
            },
          };
        },
        async expire(id) {
          const session = stored.get(id);
          if (session) {
            session.status = "expired";
          }
          return {};
        },
      },
    },
  };
  return { port, sessions };
}
