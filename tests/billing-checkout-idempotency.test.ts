import { readFileSync } from "node:fs";

import { BillingStatus, EntitlementStatus } from "@prisma/client";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  CHECKOUT_PAYMENT_METHOD_TYPES,
  checkoutAttemptFromMetadata,
  checkoutIdempotencyKey,
  executeClinicCheckout,
  type CheckoutStripePort,
  type LockedCheckoutState,
} from "@/lib/billing/checkout";
import { RIVER_CHECKOUT_ATTEMPT_METADATA_KEY } from "@/lib/billing/identity";
import { classifyStripeCheckoutFailure } from "@/lib/billing/stripe-error-log";
import {
  BILLING_TEST_ENV,
  GROUP_BILLING_TEST_ENV,
} from "@/tests/helpers/billing";

const ESSENTIAL_MONTHLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID;
const ESSENTIAL_YEARLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_YEARLY_PRICE_ID;
const PRACTICE_MONTHLY = BILLING_TEST_ENV.STRIPE_PRACTICE_MONTHLY_PRICE_ID;
const GROUP_MONTHLY = GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID;
const GROUP_SITE_MONTHLY =
  GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID;

describe("checkout idempotency keys", () => {
  it("keeps attempt 0 stable and advances only the suffix after a rejection", () => {
    const essentialMonthly = [{ price: ESSENTIAL_MONTHLY, quantity: 1 }];
    const essentialYearly = [{ price: ESSENTIAL_YEARLY, quantity: 1 }];
    const practiceMonthly = [{ price: PRACTICE_MONTHLY, quantity: 1 }];
    const groupBase = [{ price: GROUP_MONTHLY, quantity: 1 }];
    const groupSites = [
      { price: GROUP_MONTHLY, quantity: 1 },
      { price: GROUP_SITE_MONTHLY, quantity: 4 },
    ];

    expect(checkoutIdempotencyKey("clinic_a", essentialMonthly, null, 0)).toBe(
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`
    );
    expect(checkoutIdempotencyKey("clinic_a", essentialMonthly, null)).toBe(
      checkoutIdempotencyKey("clinic_a", essentialMonthly, null, 0)
    );
    expect(checkoutIdempotencyKey("clinic_a", essentialYearly, null, 0)).toBe(
      `river-checkout-clinic_a-${ESSENTIAL_YEARLY}-initial`
    );
    expect(checkoutIdempotencyKey("clinic_a", practiceMonthly, null, 0)).toBe(
      `river-checkout-clinic_a-${PRACTICE_MONTHLY}-initial`
    );
    expect(checkoutIdempotencyKey("clinic_a", groupBase, null, 0)).toBe(
      `river-checkout-clinic_a-${GROUP_MONTHLY}-initial`
    );
    expect(checkoutIdempotencyKey("clinic_a", groupSites, null, 0)).toBe(
      `river-checkout-clinic_a-${GROUP_MONTHLY}x1+${GROUP_SITE_MONTHLY}x4-initial`
    );

    const retried = checkoutIdempotencyKey(
      "clinic_a",
      essentialMonthly,
      null,
      1
    );
    expect(retried).toBe(
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-attempt-1`
    );
    expect(retried).not.toBe(
      checkoutIdempotencyKey("clinic_a", essentialMonthly, null, 0)
    );
    expect(checkoutIdempotencyKey("clinic_a", essentialMonthly, null, 1)).toBe(
      retried
    );
    expect(checkoutIdempotencyKey("clinic_a", groupSites, null, 2)).toBe(
      `river-checkout-clinic_a-${GROUP_MONTHLY}x1+${GROUP_SITE_MONTHLY}x4-attempt-2`
    );
    expect(
      checkoutIdempotencyKey("clinic_a", essentialMonthly, "cs_open", 0)
    ).toBe(`river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-cs_open`);
    expect(
      checkoutIdempotencyKey("clinic_a", essentialMonthly, "cs_open", 2)
    ).toBe(`river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-cs_open-attempt-2`);
    expect(
      checkoutIdempotencyKey("clinic_".padEnd(40, "a"), groupSites, null, 3)
        .length
    ).toBeLessThanOrEqual(255);
  });

  it("reads only a canonical attempt from Customer metadata", () => {
    expect(checkoutAttemptFromMetadata(undefined)).toBe(0);
    expect(
      checkoutAttemptFromMetadata({
        [RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]: "2",
      })
    ).toBe(2);
    expect(
      checkoutAttemptFromMetadata({
        [RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]: "00",
      })
    ).toBe(0);
  });
});

describe("checkout Stripe failure classification", () => {
  it("treats a returned 400 as definitive and a lost response as ambiguous", () => {
    expect(
      classifyStripeCheckoutFailure(
        new Stripe.errors.StripeInvalidRequestError({
          message: "au_becs_debit is invalid",
          type: "invalid_request_error",
          param: "payment_method_types[1]",
          requestId: "req_Becs400",
          statusCode: 400,
        })
      )
    ).toBe("definitive");
    expect(
      classifyStripeCheckoutFailure(
        new Stripe.errors.StripeIdempotencyError({
          message: "keys do not match",
          type: "idempotency_error",
          requestId: "req_Idem",
          statusCode: 400,
        })
      )
    ).toBe("ambiguous");
    expect(
      classifyStripeCheckoutFailure(
        new Stripe.errors.StripeAPIError({
          message: "upstream",
          type: "api_error",
          requestId: "req_Api",
          statusCode: 500,
        })
      )
    ).toBe("ambiguous");
    expect(
      classifyStripeCheckoutFailure(
        new Stripe.errors.StripeConnectionError({
          message: "socket hang up",
        })
      )
    ).toBe("ambiguous");
    expect(classifyStripeCheckoutFailure(new Error("database"))).toBeNull();
  });
});

describe("checkout attempt retry", () => {
  it("uses one stable key for a successful create and reuses an open session", async () => {
    const stripe = fakeStripe();
    const first = await executeClinicCheckout({
      ...readyCall(),
      stripe: stripe.port,
    });
    expect(first.ok).toBe(true);
    const key = stripe.sessionKeys[0];
    expect(key).toBe(`river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`);
    expect(stripe.createdSessions).toHaveLength(1);
    expect(stripe.createdSessions[0]?.payment_method_types).toEqual([
      ...CHECKOUT_PAYMENT_METHOD_TYPES,
    ]);
    expect(stripe.customerCreates).toHaveLength(1);
    expect(stripe.customerCreates[0]?.idempotencyKey).toBe(
      "river-customer-clinic_a"
    );

    const second = await executeClinicCheckout({
      ...readyCall({
        stripeCustomerId: "cus_1",
        stripeCheckoutSessionId: "cs_1",
      }),
      stripe: stripe.port,
    });
    expect(second).toMatchObject({ ok: true, reusedSession: true });
    expect(stripe.createdSessions).toHaveLength(1);
    expect(stripe.sessionKeys).toEqual([key]);
  });

  it("does not create a second session when the same attempt is submitted twice", async () => {
    const stripe = fakeStripe();
    const [first, second] = await Promise.all([
      executeClinicCheckout({ ...readyCall(), stripe: stripe.port }),
      executeClinicCheckout({ ...readyCall(), stripe: stripe.port }),
    ]);
    expect(first.ok && second.ok).toBe(true);
    expect(stripe.sessionKeys).toEqual([
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`,
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`,
    ]);
    expect(stripe.createdSessions).toHaveLength(1);
    expect(readFileSync("lib/billing/checkout.ts", "utf8")).toContain(
      "FOR UPDATE"
    );
  });

  it("advances after a definitive 400 and keeps the next attempt stable", async () => {
    const stripe = fakeStripe();
    stripe.rejectNewSessions = true;
    const failed = await executeClinicCheckout({
      ...readyCall(),
      stripe: stripe.port,
    });
    expect(failed).toEqual({ ok: false, code: "checkout_failed" });
    expect(stripe.sessionKeys).toEqual([
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`,
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-attempt-1`,
    ]);
    expect(stripe.metadata("cus_1")[RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]).toBe(
      "2"
    );
    expect(stripe.createdSessions).toHaveLength(0);

    stripe.rejectNewSessions = false;
    const [retry, duplicate] = await Promise.all([
      executeClinicCheckout({
        ...readyCall({ stripeCustomerId: "cus_1" }),
        stripe: stripe.port,
      }),
      executeClinicCheckout({
        ...readyCall({ stripeCustomerId: "cus_1" }),
        stripe: stripe.port,
      }),
    ]);
    expect(retry.ok && duplicate.ok).toBe(true);
    const retryKeys = stripe.sessionKeys.slice(2);
    expect(retryKeys).toEqual([
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-attempt-2`,
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-attempt-2`,
    ]);
    expect(stripe.createdSessions).toHaveLength(1);
    expect(stripe.customerCreates).toHaveLength(1);
  });

  it("does not advance when the create response is lost", async () => {
    const stripe = fakeStripe();
    stripe.loseNextSuccess = true;
    const lost = await executeClinicCheckout({
      ...readyCall(),
      stripe: stripe.port,
    });
    expect(lost).toEqual({ ok: false, code: "checkout_failed" });
    expect(
      stripe.metadata("cus_1")[RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]
    ).toBeUndefined();
    expect(stripe.createdSessions).toHaveLength(1);

    const recovered = await executeClinicCheckout({
      ...readyCall({ stripeCustomerId: "cus_1" }),
      stripe: stripe.port,
    });
    expect(recovered.ok).toBe(true);
    expect(stripe.sessionKeys).toEqual([
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`,
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`,
    ]);
    expect(stripe.createdSessions).toHaveLength(1);
  });

  it("does not advance on an ambiguous connection failure", async () => {
    const stripe = fakeStripe();
    stripe.dropNextResponse = true;
    const dropped = await executeClinicCheckout({
      ...readyCall(),
      stripe: stripe.port,
    });
    expect(dropped).toEqual({ ok: false, code: "checkout_failed" });
    expect(stripe.sessionKeys).toEqual([
      `river-checkout-clinic_a-${ESSENTIAL_MONTHLY}-initial`,
    ]);
    expect(stripe.createdSessions).toHaveLength(0);
    expect(
      stripe.metadata("cus_1")[RIVER_CHECKOUT_ATTEMPT_METADATA_KEY]
    ).toBeUndefined();

    const retry = await executeClinicCheckout({
      ...readyCall({ stripeCustomerId: "cus_1" }),
      stripe: stripe.port,
    });
    expect(retry.ok).toBe(true);
    expect(stripe.sessionKeys[1]).toBe(stripe.sessionKeys[0]);
    expect(stripe.createdSessions).toHaveLength(1);
  });

  it("keeps the attempt key for Practice and Group offers", async () => {
    const practice = fakeStripe();
    practice.rejectNewSessions = true;
    await executeClinicCheckout({
      ...readyCall({
        commercialPlan: "PRACTICE",
        billingInterval: "YEARLY",
      }),
      env: BILLING_TEST_ENV,
      stripe: practice.port,
    });
    expect(practice.sessionKeys[0]).toBe(
      `river-checkout-clinic_a-${BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID}-initial`
    );
    expect(practice.sessionKeys[1]).toContain("-attempt-1");

    const group = fakeStripe();
    await executeClinicCheckout({
      ...readyCall({
        commercialPlan: "GROUP",
        billingInterval: "MONTHLY",
        offeredAdditionalSiteQuantity: 0,
      }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: group.port,
    });
    expect(group.sessionKeys[0]).toBe(
      `river-checkout-clinic_a-${GROUP_MONTHLY}-initial`
    );
    expect(group.createdSessions[0]?.line_items).toEqual([
      { price: GROUP_MONTHLY, quantity: 1 },
    ]);

    const sites = fakeStripe();
    sites.seed("cus_existing", { clinicId: "clinic_a" });
    await executeClinicCheckout({
      ...readyCall({
        commercialPlan: "GROUP",
        billingInterval: "MONTHLY",
        offeredAdditionalSiteQuantity: 3,
        stripeCustomerId: "cus_existing",
      }),
      env: GROUP_BILLING_TEST_ENV,
      stripe: sites.port,
    });
    expect(sites.customerCreates).toHaveLength(0);
    expect(sites.sessionKeys[0]).toBe(
      `river-checkout-clinic_a-${GROUP_MONTHLY}x1+${GROUP_SITE_MONTHLY}x3-initial`
    );
    expect(sites.createdSessions[0]?.line_items).toEqual([
      { price: GROUP_MONTHLY, quantity: 1 },
      { price: GROUP_SITE_MONTHLY, quantity: 3 },
    ]);
  });

  it("does not open a second subscription when one is already stored", async () => {
    const stripe = fakeStripe();
    const result = await executeClinicCheckout({
      ...readyCall({ stripeSubscriptionId: "sub_existing" }),
      stripe: stripe.port,
    });
    expect(result).toEqual({ ok: false, code: "subscription_exists" });
    expect(stripe.createdSessions).toHaveLength(0);
    expect(stripe.customerCreates).toHaveLength(0);
  });
});

function readyCall(overrides: Partial<LockedCheckoutState> = {}): {
  state: LockedCheckoutState;
  env: typeof BILLING_TEST_ENV;
  successUrl: string;
  cancelUrl: string;
  persist: () => Promise<void>;
} {
  return {
    state: {
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
    },
    env: BILLING_TEST_ENV,
    successUrl: "https://app.example/account/billing/complete",
    cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
    persist: async () => undefined,
  };
}

function fakeStripe() {
  const customers = new Map<string, Record<string, string>>();
  const sessions = new Map<
    string,
    { kind: "session"; value: SessionResult } | { kind: "error"; error: Error }
  >();
  const sessionKeys: string[] = [];
  const createdSessions: Array<{
    line_items: Array<{ price: string; quantity: number }>;
    payment_method_types: string[];
  }> = [];
  const customerCreates: Array<{ idempotencyKey?: string }> = [];
  const customersByKey = new Map<
    string,
    { id: string; metadata: Record<string, string> }
  >();
  const sessionInflight = new Map<string, Promise<SessionResult>>();
  let customerSeq = 0;
  let sessionSeq = 0;
  const stripe = {
    rejectNewSessions: false,
    loseNextSuccess: false,
    dropNextResponse: false,
    sessionKeys,
    createdSessions,
    customerCreates,
    metadata(id: string) {
      return customers.get(id) ?? {};
    },
    seed(id: string, metadata: Record<string, string>) {
      customers.set(id, { ...metadata });
    },
    port: {} as CheckoutStripePort,
  };

  stripe.port = {
    customers: {
      async create(params, options) {
        const key = options?.idempotencyKey ?? "";
        const existing = customersByKey.get(key);
        if (existing) {
          return { id: existing.id, metadata: { ...existing.metadata } };
        }
        customerSeq += 1;
        const id = `cus_${customerSeq}`;
        const metadata = { ...(params.metadata ?? {}) };
        customers.set(id, metadata);
        const created = { id, metadata };
        customersByKey.set(key, created);
        customerCreates.push({ idempotencyKey: options?.idempotencyKey });
        return { id, metadata: { ...metadata } };
      },
      async update(id, params) {
        const metadata = {
          ...(customers.get(id) ?? {}),
          ...(params.metadata ?? {}),
        };
        customers.set(id, metadata);
        return { id, metadata: { ...metadata } };
      },
    },
    checkout: {
      sessions: {
        async create(params, options) {
          const key = options?.idempotencyKey ?? "";
          sessionKeys.push(key);
          const cached = sessions.get(key);
          if (cached?.kind === "error") {
            throw cached.error;
          }
          if (cached?.kind === "session") {
            return cached.value;
          }
          const pending = sessionInflight.get(key);
          if (pending) {
            return pending;
          }
          const work = (async () => {
            if (stripe.dropNextResponse) {
              stripe.dropNextResponse = false;
              throw new Stripe.errors.StripeConnectionError({
                message: "socket hang up",
              });
            }
            const session = {
              id: `cs_${(sessionSeq += 1)}`,
              url: `https://checkout.stripe.com/c/pay/cs_${sessionSeq}`,
              status: "open",
            };
            if (stripe.loseNextSuccess) {
              stripe.loseNextSuccess = false;
              sessions.set(key, { kind: "session", value: session });
              createdSessions.push({
                line_items: params.line_items,
                payment_method_types: params.payment_method_types,
              });
              throw new Stripe.errors.StripeConnectionError({
                message: "response lost",
              });
            }
            if (stripe.rejectNewSessions) {
              const error = new Stripe.errors.StripeInvalidRequestError({
                message: "au_becs_debit is invalid",
                type: "invalid_request_error",
                code: "payment_method_invalid",
                param: "payment_method_types[1]",
                requestId: "req_Becs400",
                statusCode: 400,
              });
              sessions.set(key, { kind: "error", error });
              throw error;
            }
            sessions.set(key, { kind: "session", value: session });
            createdSessions.push({
              line_items: params.line_items,
              payment_method_types: params.payment_method_types,
            });
            return session;
          })();
          sessionInflight.set(key, work);
          try {
            return await work;
          } finally {
            sessionInflight.delete(key);
          }
        },
        async retrieve(id) {
          const created = createdSessions[0];
          return {
            id,
            url: "https://checkout.stripe.com/c/pay/cs_1",
            status: "open",
            line_items: {
              data: (created?.line_items ?? []).map((item) => ({
                price: { id: item.price },
                quantity: item.quantity,
              })),
            },
          };
        },
        async expire() {
          return {};
        },
      },
    },
  };

  return stripe;
}

type SessionResult = {
  id: string;
  url: string;
  status: string;
};
