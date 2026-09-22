import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assessOperatorPlanUpgrade,
  executeOperatorPlanUpgrade,
  PLAN_UPGRADE_BILLING_CYCLE_ANCHOR,
  PLAN_UPGRADE_PAYMENT_BEHAVIOR,
  PLAN_UPGRADE_PRORATION_BEHAVIOR,
  planUpgradeIdempotencyKey,
  type PlanChangeState,
  type PlanChangeStripePort,
} from "@/lib/billing/plan-change";
import { BILLING_TEST_ENV } from "@/tests/helpers/billing";

function state(overrides: Partial<PlanChangeState> = {}): PlanChangeState {
  return {
    clinicId: "clinic_a",
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    entitlementStatus: EntitlementStatus.ACTIVE,
    billingStatus: BillingStatus.ACTIVE,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: "sub_clinic_a",
    ...overrides,
  };
}

function stripePort(priceId = "price_test_essential_monthly"): {
  stripe: PlanChangeStripePort & { subscriptions: { create?: () => void } };
  updates: Array<{
    id: string;
    params: {
      items: Array<{ id: string; price: string }>;
      proration_behavior: string;
      payment_behavior: string;
      billing_cycle_anchor: string;
    };
    idempotencyKey?: string;
  }>;
} {
  const updates: Array<{
    id: string;
    params: {
      items: Array<{ id: string; price: string }>;
      proration_behavior: string;
      payment_behavior: string;
      billing_cycle_anchor: string;
    };
    idempotencyKey?: string;
  }> = [];
  return {
    updates,
    stripe: {
      subscriptions: {
        async retrieve(id) {
          return {
            id,
            items: {
              data: [
                { id: "si_clinic_a", quantity: 1, price: { id: priceId } },
              ],
            },
          };
        },
        async update(id, params, options) {
          updates.push({ id, params, idempotencyKey: options?.idempotencyKey });
          return { id };
        },
      },
    },
  };
}

describe("operator plan changes", () => {
  it("upgrades Essential to Practice on the same interval without a second subscription", async () => {
    const port = stripePort();
    const result = await executeOperatorPlanUpgrade({
      state: state(),
      requestedPlan: "PRACTICE",
      env: BILLING_TEST_ENV,
      stripe: port.stripe,
    });
    expect(result).toEqual({ ok: true });
    expect(port.stripe.subscriptions.create).toBeUndefined();
    expect(port.updates).toHaveLength(1);
    expect(port.updates[0]).toMatchObject({
      id: "sub_clinic_a",
      params: {
        items: [{ id: "si_clinic_a", price: "price_test_practice_monthly" }],
        proration_behavior: PLAN_UPGRADE_PRORATION_BEHAVIOR,
        payment_behavior: PLAN_UPGRADE_PAYMENT_BEHAVIOR,
        billing_cycle_anchor: PLAN_UPGRADE_BILLING_CYCLE_ANCHOR,
      },
      idempotencyKey: planUpgradeIdempotencyKey({
        clinicId: "clinic_a",
        stripeSubscriptionId: "sub_clinic_a",
        targetPriceId: "price_test_practice_monthly",
      }),
    });
    expect(port.updates[0]?.params.items[0]?.price).not.toBe(
      "price_submitted_by_browser"
    );
  });

  it("keeps the yearly price when the current interval is yearly", async () => {
    const port = stripePort("price_test_essential_yearly");
    const result = await executeOperatorPlanUpgrade({
      state: state({ billingInterval: "YEARLY" }),
      requestedPlan: "PRACTICE",
      env: BILLING_TEST_ENV,
      stripe: port.stripe,
    });
    expect(result).toEqual({ ok: true });
    expect(port.updates[0]?.params.items[0]?.price).toBe(
      "price_test_practice_yearly"
    );
  });

  it("blocks Practice to Essential until entitlement conflicts can be enforced", () => {
    const assessed = assessOperatorPlanUpgrade(
      state({ commercialPlan: "PRACTICE" }),
      "ESSENTIAL"
    );
    expect(assessed).toMatchObject({ ok: false, code: "downgrade_deferred" });
  });

  it("does not upgrade a past-due, cancelled, or group clinic", () => {
    expect(
      assessOperatorPlanUpgrade(
        state({ billingStatus: BillingStatus.PAST_DUE }),
        "PRACTICE"
      ).ok
    ).toBe(false);
    expect(
      assessOperatorPlanUpgrade(
        state({
          cancelAtPeriodEnd: true,
          billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
        }),
        "PRACTICE"
      )
    ).toMatchObject({ ok: false, code: "cancel_scheduled" });
    expect(
      assessOperatorPlanUpgrade(state({ commercialPlan: "GROUP" }), "PRACTICE")
    ).toMatchObject({ ok: false, code: "group_unavailable" });
    expect(
      assessOperatorPlanUpgrade(
        state({ stripeSubscriptionId: null }),
        "PRACTICE"
      )
    ).toMatchObject({ ok: false, code: "no_subscription" });
  });

  it("refuses a subscription that is not the mapped Essential price", async () => {
    const port = stripePort("price_unknown");
    const result = await executeOperatorPlanUpgrade({
      state: state(),
      requestedPlan: "PRACTICE",
      env: BILLING_TEST_ENV,
      stripe: port.stripe,
    });
    expect(result).toMatchObject({ ok: false, code: "price_mismatch" });
    expect(port.updates).toHaveLength(0);
  });
});
