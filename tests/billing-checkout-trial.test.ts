import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  CHECKOUT_PAYMENT_METHOD_TYPES,
  checkoutIdempotencyKey,
  executeClinicCheckout,
  type CheckoutStripePort,
  type LockedCheckoutState,
} from "@/lib/billing/checkout";
import { RIVER_CLINIC_ID_METADATA_KEY } from "@/lib/billing/identity";
import {
  CATALOGUE_TRIAL_PERIOD_DAYS,
  RIVER_TRIAL_DAYS_METADATA_KEY,
} from "@/lib/billing/trial";
import {
  BILLING_TEST_ENV,
  conformingCataloguePrices,
  GROUP_BILLING_TEST_ENV,
} from "@/tests/helpers/billing";

const ESSENTIAL_MONTHLY = BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID;
const PRACTICE_YEARLY = BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID;

function readyState(
  overrides: Partial<LockedCheckoutState> = {}
): LockedCheckoutState {
  return {
    clinicId: "clinic_trial",
    userId: "user_trial",
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    commercialArrangement: "PAID",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
    trialEndsAt: null,
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

function fakeStripe(options?: {
  subscriptions?: Array<{ id: string }> | "missing" | "throws";
}) {
  const sessions: {
    created: Array<Record<string, unknown>>;
    idempotencyKeys: string[];
    expired: string[];
  } = { created: [], idempotencyKeys: [], expired: [] };
  let sessionSeq = 0;
  const port: CheckoutStripePort = {
    prices: conformingCataloguePrices,
    customers: {
      async create() {
        return { id: "cus_trial" };
      },
      async update(id) {
        return { id };
      },
    },
    checkout: {
      sessions: {
        async create(params, request) {
          sessions.created.push(params);
          sessions.idempotencyKeys.push(request?.idempotencyKey ?? "");
          sessionSeq += 1;
          return {
            id: `cs_trial_${sessionSeq}`,
            url: `https://checkout.stripe.com/c/pay/cs_trial_${sessionSeq}`,
            status: "open",
          };
        },
        async retrieve(id) {
          const created = sessions.created.at(-1);
          const lineItems = created?.line_items as
            Array<{ price: string }> | undefined;
          return {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            status: "open",
            metadata: (created?.metadata as Record<string, string>) ?? null,
            line_items: {
              data: [{ price: { id: lineItems?.[0]?.price } }],
            },
          };
        },
        async expire(id) {
          sessions.expired.push(id);
          return {};
        },
      },
    },
    ...(options?.subscriptions === "missing"
      ? {}
      : {
          subscriptions: {
            async list() {
              if (options?.subscriptions === "throws") {
                throw new Error("stripe unavailable");
              }
              return {
                data: Array.isArray(options?.subscriptions)
                  ? options.subscriptions
                  : [],
              };
            },
          },
        }),
  };
  return { port, sessions };
}

async function checkout(
  stripe: ReturnType<typeof fakeStripe>,
  state: LockedCheckoutState,
  env: Record<string, string> = BILLING_TEST_ENV
) {
  return executeClinicCheckout({
    state,
    env,
    stripe: stripe.port,
    successUrl: "https://app.example/account/billing/complete",
    cancelUrl: "https://app.example/account/billing/setup?checkout=cancelled",
    persist: async () => undefined,
  });
}

describe("catalogue checkout trial", () => {
  it("adds a 14-day trial to new Essential monthly and Practice yearly Checkout", async () => {
    for (const [plan, interval, price] of [
      ["ESSENTIAL", "MONTHLY", ESSENTIAL_MONTHLY],
      ["PRACTICE", "YEARLY", PRACTICE_YEARLY],
    ] as const) {
      const stripe = fakeStripe();
      const result = await checkout(
        stripe,
        readyState({ commercialPlan: plan, billingInterval: interval })
      );
      expect(result.ok).toBe(true);
      expect(stripe.sessions.created[0]).toMatchObject({
        line_items: [{ price, quantity: 1 }],
        payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
        payment_method_collection: "always",
        allow_promotion_codes: false,
        metadata: {
          [RIVER_CLINIC_ID_METADATA_KEY]: "clinic_trial",
          [RIVER_TRIAL_DAYS_METADATA_KEY]: "14",
        },
        subscription_data: {
          trial_period_days: CATALOGUE_TRIAL_PERIOD_DAYS,
          metadata: { [RIVER_TRIAL_DAYS_METADATA_KEY]: "14" },
        },
      });
      expect(stripe.sessions.created[0]).not.toHaveProperty("discounts");
      expect(stripe.sessions.idempotencyKeys[0]).toBe(
        checkoutIdempotencyKey(
          "clinic_trial",
          [{ price, quantity: 1 }],
          null,
          0,
          14
        )
      );
      expect(stripe.sessions.idempotencyKeys[0]).toContain("-trial-14-");
    }
  });

  it("reuses an open trial session and replaces an open session that has no trial", async () => {
    const stripe = fakeStripe();
    const first = await checkout(stripe, readyState());
    expect(first).toMatchObject({ ok: true, reusedSession: false });
    const second = await checkout(
      stripe,
      readyState({
        stripeCustomerId: "cus_trial",
        stripeCheckoutSessionId: "cs_trial_1",
      })
    );
    expect(second).toMatchObject({ ok: true, reusedSession: true });
    expect(stripe.sessions.created).toHaveLength(1);
    expect(stripe.sessions.expired).toHaveLength(0);

    const plain = fakeStripe();
    await checkout(
      plain,
      readyState({ trialEndsAt: new Date("2026-01-01T00:00:00.000Z") })
    );
    expect(plain.sessions.created[0]?.subscription_data).not.toHaveProperty(
      "trial_period_days"
    );
    const eligible = fakeStripe();
    eligible.sessions.created.push(plain.sessions.created[0]!);
    const replaced = await checkout(
      eligible,
      readyState({
        stripeCustomerId: "cus_trial",
        stripeCheckoutSessionId: "cs_plain",
      })
    );
    expect(replaced).toMatchObject({ ok: true, reusedSession: false });
    expect(eligible.sessions.expired).toEqual(["cs_plain"]);
    expect(eligible.sessions.created.at(-1)?.subscription_data).toMatchObject({
      trial_period_days: 14,
    });
  });

  it("withholds the trial for ineligible clinics and still opens Checkout", async () => {
    const group = fakeStripe();
    const groupResult = await checkout(
      group,
      readyState({
        commercialPlan: "GROUP",
        billingInterval: "MONTHLY",
        offeredAdditionalSiteQuantity: 0,
      }),
      GROUP_BILLING_TEST_ENV
    );
    expect(groupResult.ok).toBe(true);
    expect(group.sessions.created[0]?.subscription_data).not.toHaveProperty(
      "trial_period_days"
    );
    expect(group.sessions.idempotencyKeys[0]).not.toContain("trial-14");

    const repeat = fakeStripe();
    const repeatResult = await checkout(
      repeat,
      readyState({ trialEndsAt: new Date("2026-01-01T00:00:00.000Z") })
    );
    expect(repeatResult.ok).toBe(true);
    expect(repeat.sessions.created[0]?.subscription_data).not.toHaveProperty(
      "trial_period_days"
    );

    const prior = fakeStripe({ subscriptions: [{ id: "sub_old" }] });
    const priorResult = await checkout(prior, readyState());
    expect(priorResult.ok).toBe(true);
    expect(prior.sessions.created[0]?.subscription_data).not.toHaveProperty(
      "trial_period_days"
    );

    const unavailable = fakeStripe({ subscriptions: "throws" });
    const missing = fakeStripe({ subscriptions: "missing" });
    expect(await checkout(unavailable, readyState())).toEqual({
      ok: false,
      code: "trial_eligibility_unavailable",
    });
    expect(await checkout(missing, readyState())).toEqual({
      ok: false,
      code: "trial_eligibility_unavailable",
    });
    expect(unavailable.sessions.created).toHaveLength(0);
    expect(missing.sessions.created).toHaveLength(0);

    const subscribed = fakeStripe();
    expect(
      (
        await checkout(
          subscribed,
          readyState({ stripeSubscriptionId: "sub_existing" })
        )
      ).ok
    ).toBe(false);
    expect(subscribed.sessions.created).toHaveLength(0);

    const complimentary = fakeStripe();
    expect(
      (
        await checkout(
          complimentary,
          readyState({ commercialArrangement: "COMPLIMENTARY" })
        )
      ).ok
    ).toBe(false);
    expect(complimentary.sessions.created).toHaveLength(0);
  });
});
