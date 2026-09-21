import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertClinicCheckoutActor,
  CHECKOUT_PAYMENT_METHOD_TYPES,
  executeClinicCheckout,
  type CheckoutStripePort,
  type LockedCheckoutState,
} from "@/lib/billing/checkout";
import { RIVER_CLINIC_ID_METADATA_KEY } from "@/lib/billing/identity";
import { BILLING_TEST_ENV } from "@/tests/helpers/billing";

const PRACTICE_YEARLY = BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID;

describe("checkout authorization", () => {
  it("allows a clinic admin and ignores a matching clinic id", () => {
    expect(
      assertClinicCheckoutActor({
        role: "ADMIN",
        membershipSource: "membership",
        sessionClinicId: "clinic_a",
        submittedClinicId: "clinic_a",
      })
    ).toEqual({ ok: true, clinicId: "clinic_a" });
  });

  it("rejects staff, operator support, and another clinic", () => {
    expect(
      assertClinicCheckoutActor({
        role: "STAFF",
        membershipSource: "membership",
        sessionClinicId: "clinic_a",
      }).ok
    ).toBe(false);
    expect(
      assertClinicCheckoutActor({
        role: "ADMIN",
        membershipSource: "operator_support",
        sessionClinicId: "clinic_a",
      })
    ).toMatchObject({ ok: false, code: "operator_forbidden" });
    expect(
      assertClinicCheckoutActor({
        role: "ADMIN",
        membershipSource: "membership",
        sessionClinicId: "clinic_a",
        submittedClinicId: "clinic_b",
      })
    ).toMatchObject({ ok: false, code: "tenancy" });
  });

  it("does not read a browser plan, price, or amount in the customer action", () => {
    const source = readFileSync(
      "app/(staff)/account/billing/actions.ts",
      "utf8"
    );
    expect(source).toContain("requireClinicAdmin");
    expect(source).not.toContain('formData.get("commercialPlan")');
    expect(source).not.toContain('formData.get("billingInterval")');
    expect(source).not.toContain('formData.get("price")');
    expect(source).not.toContain("unit_amount");
    expect(source).not.toContain("GROUP");
  });
});

describe("checkout session creation", () => {
  it("selects the server price, stamps clinic metadata, and limits payment methods", async () => {
    const stripe = fakeStripe();
    const result = await executeClinicCheckout({
      state: readyState(),
      env: BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/account/billing/complete",
      cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
      persist: async () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(stripe.customers.created[0]).toMatchObject({
      email: "accounts@example.com",
      name: "Harbour Dental Pty Ltd",
      metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: "clinic_a" },
    });
    expect(stripe.sessions.created[0]).toMatchObject({
      mode: "subscription",
      customer: "cus_test",
      client_reference_id: "clinic_a",
      line_items: [{ price: PRACTICE_YEARLY, quantity: 1 }],
      metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: "clinic_a" },
      subscription_data: {
        metadata: { [RIVER_CLINIC_ID_METADATA_KEY]: "clinic_a" },
      },
      payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
      allow_promotion_codes: false,
    });
    expect(stripe.sessions.created[0]).not.toHaveProperty("automatic_tax");
    expect(JSON.stringify(stripe.sessions.created[0])).not.toContain(
      "afterpay"
    );
    expect(JSON.stringify(stripe.sessions.created[0])).not.toContain(
      "unit_amount"
    );
  });

  it("reuses one customer and one open session when the request is repeated", async () => {
    const stripe = fakeStripe();
    const saved: { customerId?: string; sessionId?: string } = {};
    const persist = async (update: {
      stripeCustomerId?: string;
      stripeCheckoutSessionId?: string | null;
    }) => {
      if (update.stripeCustomerId) {
        saved.customerId = update.stripeCustomerId;
      }
      if (update.stripeCheckoutSessionId) {
        saved.sessionId = update.stripeCheckoutSessionId;
      }
    };

    await executeClinicCheckout({
      state: readyState(),
      env: BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist,
    });
    const second = await executeClinicCheckout({
      state: readyState({
        stripeCustomerId: saved.customerId ?? null,
        stripeCheckoutSessionId: saved.sessionId ?? null,
      }),
      env: BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist,
    });

    expect(second).toMatchObject({ ok: true, reusedSession: true });
    expect(stripe.customers.created).toHaveLength(1);
    expect(stripe.sessions.created).toHaveLength(1);
    expect(stripe.customers.updated).toHaveLength(1);
  });

  it("rejects an unprepared clinic, Group, an unknown price, and an active subscription", async () => {
    const stripe = fakeStripe();
    const base = {
      env: BILLING_TEST_ENV,
      stripe: stripe.port,
      successUrl: "https://app.example/complete",
      cancelUrl: "https://app.example/cancel",
      persist: async () => undefined,
    };

    await expect(
      executeClinicCheckout({
        ...base,
        state: readyState({
          billingStatus: null,
          entitlementStatus: null,
          commercialPlan: null,
        }),
      })
    ).resolves.toMatchObject({ ok: false, code: "not_prepared" });

    await expect(
      executeClinicCheckout({
        ...base,
        state: readyState({ commercialPlan: "GROUP" }),
      })
    ).resolves.toMatchObject({ ok: false, code: "group_unavailable" });

    await expect(
      executeClinicCheckout({
        ...base,
        env: {},
        state: readyState(),
      })
    ).resolves.toMatchObject({ ok: false, code: "price_not_configured" });

    await expect(
      executeClinicCheckout({
        ...base,
        state: readyState({
          entitlementStatus: EntitlementStatus.ACTIVE,
          billingStatus: BillingStatus.ACTIVE,
        }),
      })
    ).resolves.toMatchObject({ ok: false, code: "already_active" });

    expect(stripe.sessions.created).toHaveLength(0);
    expect(stripe.customers.created).toHaveLength(0);
  });

  it("does not open checkout when terms have not been accepted", async () => {
    const stripe = fakeStripe();
    await expect(
      executeClinicCheckout({
        state: readyState({ termsAccepted: false }),
        env: BILLING_TEST_ENV,
        stripe: stripe.port,
        successUrl: "https://app.example/complete",
        cancelUrl: "https://app.example/cancel",
        persist: async () => undefined,
      })
    ).resolves.toMatchObject({ ok: false, code: "terms_required" });
    expect(stripe.sessions.created).toHaveLength(0);
  });
});

function readyState(
  overrides: Partial<LockedCheckoutState> = {}
): LockedCheckoutState {
  return {
    clinicId: "clinic_a",
    userId: "user_a",
    commercialPlan: "PRACTICE",
    billingInterval: "YEARLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
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
  const customers: { created: unknown[]; updated: unknown[] } = {
    created: [],
    updated: [],
  };
  const sessions: { created: unknown[] } = { created: [] };
  let sessionSeq = 0;
  const port: CheckoutStripePort = {
    customers: {
      async create(params) {
        customers.created.push(params);
        return { id: "cus_test" };
      },
      async update(id, params) {
        customers.updated.push({ id, ...params });
        return { id };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          sessions.created.push(params);
          sessionSeq += 1;
          return {
            id: `cs_test_${sessionSeq}`,
            url: `https://checkout.stripe.com/c/pay/cs_test_${sessionSeq}`,
            status: "open",
          };
        },
        async retrieve(id) {
          const created = sessions.created[0] as
            { line_items?: Array<{ price: string }> } | undefined;
          return {
            id,
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
            status: "open",
            line_items: {
              data: [{ price: { id: created?.line_items?.[0]?.price } }],
            },
          };
        },
        async expire() {
          return {};
        },
      },
    },
  };
  return { port, customers, sessions };
}
