import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assessOperatorDowngradeReversal,
  assessOperatorPlanDowngrade,
  buildCancellationSupersedeUpdate,
  buildPracticeToEssentialScheduleUpdate,
  decideSubscriptionScheduleEvent,
  executeOperatorDowngradeReversal,
  executeOperatorPlanDowngrade,
  PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR,
  PLAN_DOWNGRADE_END_BEHAVIOR,
  PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
  planDowngradeIdempotencyKey,
  releaseSchedulePreservingCancellation,
  shouldReleaseScheduleAfterCancellationReversed,
  type DowngradeScheduleSnapshot,
  type DowngradeSubscriptionSnapshot,
  type PlanDowngradeState,
  type PlanDowngradeStripePort,
} from "@/lib/billing/plan-downgrade";
import { presentScheduledPlanChange } from "@/lib/billing/billing-presentation";
import { assessEssentialDowngradeReadiness } from "@/lib/entitlements/downgrade-readiness";
import { BILLING_TEST_ENV } from "@/tests/helpers/billing";

const PERIOD_END = 1_792_647_594;
const PHASE_START = 1_761_169_194;

function readiness(input: {
  team?: number;
  custom?: number;
  adapted?: number;
  extraTeam?: number;
  extraCustom?: number;
  extraAdapted?: number;
}) {
  return assessEssentialDowngradeReadiness({
    occupiedTeamPlaces: input.team ?? 2,
    customGuideCount: input.custom ?? 1,
    adaptedTemplateCount: input.adapted ?? 1,
    extras: {
      teamMembers: input.extraTeam ?? 0,
      customGuides: input.extraCustom ?? 0,
      templateAdaptations: input.extraAdapted ?? 0,
    },
  });
}

function state(
  overrides: Partial<PlanDowngradeState> = {}
): PlanDowngradeState {
  return {
    clinicId: "clinic_a",
    commercialPlan: "PRACTICE",
    billingInterval: "MONTHLY",
    entitlementStatus: EntitlementStatus.ACTIVE,
    billingStatus: BillingStatus.ACTIVE,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: "sub_clinic_a",
    stripeSubscriptionScheduleId: null,
    stripeCheckoutSessionId: null,
    scheduledCommercialPlan: null,
    scheduledPlanEffectiveAt: null,
    ...overrides,
  };
}

function subscription(
  overrides: Partial<DowngradeSubscriptionSnapshot> = {}
): DowngradeSubscriptionSnapshot {
  return {
    id: "sub_clinic_a",
    scheduleId: null,
    cancelAtPeriodEnd: false,
    itemCount: 1,
    itemId: "si_clinic_a",
    priceId: "price_test_practice_monthly",
    quantity: 1,
    periodEnd: PERIOD_END,
    discountsPresent: false,
    trialPresent: false,
    taxRatesPresent: false,
    ...overrides,
  };
}

function phase(input: {
  priceId: string;
  startDate?: number;
  endDate?: number;
  prorationBehavior?: string | null;
  hasExtras?: boolean;
}) {
  return {
    priceId: input.priceId,
    quantity: 1,
    startDate: input.startDate ?? PHASE_START,
    endDate: input.endDate ?? PERIOD_END,
    prorationBehavior: input.prorationBehavior ?? "none",
    hasExtras: input.hasExtras ?? false,
  };
}

function schedule(
  overrides: Partial<DowngradeScheduleSnapshot> = {}
): DowngradeScheduleSnapshot {
  return {
    id: "sub_sched_a",
    status: "active",
    endBehavior: "release",
    subscriptionId: "sub_clinic_a",
    releasedSubscriptionId: null,
    metadataClinicId: "clinic_a",
    metadataPurpose: "practice_to_essential",
    phases: [phase({ priceId: "price_test_practice_monthly" })],
    ...overrides,
  };
}

function port(options: {
  subscription?: DowngradeSubscriptionSnapshot;
  created?: DowngradeScheduleSnapshot;
  existing?: DowngradeScheduleSnapshot;
  updated?: DowngradeScheduleSnapshot;
  released?: DowngradeScheduleSnapshot;
}) {
  const calls = {
    retrieveSubscription: 0,
    create: [] as Array<{ from_subscription: string; idempotencyKey?: string }>,
    update: [] as Array<{
      id: string;
      params: unknown;
      idempotencyKey?: string;
    }>,
    release: [] as Array<{
      id: string;
      params: { preserve_cancel_date?: boolean };
      idempotencyKey?: string;
    }>,
    checkout: 0,
    subscriptionCreate: 0,
    subscriptionUpdate: 0,
    invoice: 0,
    refund: 0,
  };
  const stripe = {
    subscriptions: {
      async retrieve() {
        calls.retrieveSubscription += 1;
        return options.subscription ?? subscription();
      },
      async create() {
        calls.subscriptionCreate += 1;
        throw new Error("second subscription");
      },
      async update() {
        calls.subscriptionUpdate += 1;
        throw new Error("immediate price change");
      },
    },
    subscriptionSchedules: {
      async create(
        params: { from_subscription: string },
        request?: { idempotencyKey?: string }
      ) {
        calls.create.push({
          ...params,
          idempotencyKey: request?.idempotencyKey,
        });
        return (
          options.created ??
          schedule({
            phases: [phase({ priceId: "price_test_practice_monthly" })],
          })
        );
      },
      async retrieve() {
        return options.existing ?? schedule();
      },
      async update(
        id: string,
        params: unknown,
        request?: { idempotencyKey?: string }
      ) {
        calls.update.push({
          id,
          params,
          idempotencyKey: request?.idempotencyKey,
        });
        return options.updated ?? schedule({ id });
      },
      async release(
        id: string,
        params: { preserve_cancel_date?: boolean },
        request?: { idempotencyKey?: string }
      ) {
        calls.release.push({
          id,
          params,
          idempotencyKey: request?.idempotencyKey,
        });
        return (
          options.released ??
          schedule({
            id,
            status: "released",
            subscriptionId: null,
            releasedSubscriptionId: "sub_clinic_a",
          })
        );
      },
    },
    checkout: {
      async create() {
        calls.checkout += 1;
      },
    },
    invoices: {
      async create() {
        calls.invoice += 1;
      },
    },
    refunds: {
      async create() {
        calls.refund += 1;
      },
    },
  };
  return { calls, stripe: stripe as PlanDowngradeStripePort & typeof stripe };
}

describe("Practice to Essential downgrade readiness", () => {
  it("allows scheduling when usage fits Essential", async () => {
    const fake = port({});
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(fake.calls.create).toHaveLength(1);
  });

  it.each([
    ["TEAM_MEMBERS", { team: 3 }, "not_ready"],
    ["CUSTOM_GUIDES", { custom: 3, adapted: 0 }, "selection_required"],
    ["TEMPLATE_ADAPTATIONS", { custom: 0, adapted: 3 }, "selection_required"],
    ["COMBINED_GUIDES", { custom: 3, adapted: 2 }, "selection_required"],
  ] as const)(
    "does not call Stripe for a %s conflict",
    async (_conflict, usage, code) => {
      const assessed = readiness(usage);
      expect(assessed.conflicts).toContain(_conflict);
      const fake = port({});
      const result = await executeOperatorPlanDowngrade({
        state: state(),
        readiness: assessed,
        env: BILLING_TEST_ENV,
        stripe: fake.stripe,
        persist: async () => undefined,
      });
      expect(result).toMatchObject({ ok: false, code });
      expect(fake.calls.retrieveSubscription).toBe(0);
      expect(fake.calls.create).toHaveLength(0);
      expect(fake.calls.update).toHaveLength(0);
    }
  );

  it("schedules when guide usage is over Essential but a confirmed keep-set fits", async () => {
    const assessed = readiness({ custom: 30, adapted: 10 });
    expect(assessed.ready).toBe(false);
    const fake = port({});
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: assessed,
      guideSelection: {
        confirmed: true,
        customCount: 2,
        adaptedCount: 2,
        combinedCount: 4,
      },
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(fake.calls.create).toHaveLength(1);
  });

  it("still blocks scheduling when team usage is over even with a valid guide selection", async () => {
    const assessed = readiness({ team: 3, custom: 30, adapted: 10 });
    const fake = port({});
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: assessed,
      guideSelection: {
        confirmed: true,
        customCount: 2,
        adaptedCount: 2,
        combinedCount: 4,
      },
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
    });
    expect(result).toMatchObject({ ok: false, code: "not_ready" });
    expect(fake.calls.create).toHaveLength(0);
  });

  it("treats persistent extras as part of the Essential allowance", async () => {
    const withinExtras = readiness({
      team: 3,
      custom: 3,
      adapted: 2,
      extraTeam: 1,
      extraCustom: 1,
    });
    expect(withinExtras.ready).toBe(true);
    expect(withinExtras.team).toEqual({ current: 3, limit: 3 });
    expect(withinExtras.combinedGuides).toEqual({ current: 5, limit: 5 });
    const fake = port({});
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: withinExtras,
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
    });
    expect(result.ok).toBe(true);
  });
});

describe("Practice to Essential schedule request", () => {
  it("keeps Practice through the paid period and switches to Essential monthly", async () => {
    const persisted: Array<{ scheduleId: string; effectiveAt: Date }> = [];
    const fake = port({});
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row);
      },
    });
    expect(result).toMatchObject({
      ok: true,
      alreadyScheduled: false,
      scheduleId: "sub_sched_a",
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.subscriptionCreate).toBe(0);
    expect(fake.calls.subscriptionUpdate).toBe(0);
    expect(fake.calls.checkout).toBe(0);
    expect(fake.calls.invoice).toBe(0);
    expect(fake.calls.refund).toBe(0);
    expect(fake.calls.create[0]).toEqual({
      from_subscription: "sub_clinic_a",
      idempotencyKey: planDowngradeIdempotencyKey({
        clinicId: "clinic_a",
        stripeSubscriptionId: "sub_clinic_a",
        targetPriceId: "price_test_essential_monthly",
        periodEnd: PERIOD_END,
        step: "create",
      }),
    });
    expect(fake.calls.update[0]?.params).toEqual(
      buildPracticeToEssentialScheduleUpdate({
        clinicId: "clinic_a",
        currentPriceId: "price_test_practice_monthly",
        essentialPriceId: "price_test_essential_monthly",
        quantity: 1,
        phaseStart: PHASE_START,
        periodEnd: PERIOD_END,
        interval: "MONTHLY",
      })
    );
    expect(fake.calls.update[0]?.params).toMatchObject({
      end_behavior: PLAN_DOWNGRADE_END_BEHAVIOR,
      proration_behavior: PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
      phases: [
        {
          items: [{ price: "price_test_practice_monthly", quantity: 1 }],
          proration_behavior: "none",
        },
        {
          items: [{ price: "price_test_essential_monthly", quantity: 1 }],
          duration: { interval: "month", interval_count: 1 },
          proration_behavior: "none",
          billing_cycle_anchor: PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR,
        },
      ],
    });
    expect(JSON.stringify(fake.calls.update[0]?.params)).not.toContain(
      "phase_start"
    );
    expect(JSON.stringify(fake.calls.update[0]?.params)).not.toContain(
      "iterations"
    );
    expect(persisted[0]?.effectiveAt).toEqual(new Date(PERIOD_END * 1000));
  });

  it("maps Practice annual to Essential annual on the same subscription", async () => {
    const fake = port({
      subscription: subscription({
        priceId: "price_test_practice_yearly",
      }),
      created: schedule({
        phases: [phase({ priceId: "price_test_practice_yearly" })],
      }),
    });
    const result = await executeOperatorPlanDowngrade({
      state: state({ billingInterval: "YEARLY" }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
    });
    expect(result).toMatchObject({
      ok: true,
      stripeSubscriptionId: "sub_clinic_a",
    });
    const params = fake.calls.update[0]?.params as {
      phases: Array<{
        items: Array<{ price: string }>;
        duration?: { interval: string };
      }>;
    };
    expect(params.phases[0]?.items[0]?.price).toBe(
      "price_test_practice_yearly"
    );
    expect(params.phases[1]?.items[0]?.price).toBe(
      "price_test_essential_yearly"
    );
    expect(params.phases[1]?.duration).toEqual({
      interval: "year",
      interval_count: 1,
    });
    expect(params.phases[0]?.items[0]?.price).not.toBe(
      "price_test_essential_monthly"
    );
  });

  it("fails closed for an unmapped price or a mismatched interval", async () => {
    const unknown = port({
      subscription: subscription({ priceId: "price_unknown" }),
    });
    const unknownResult = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: unknown.stripe,
      persist: async () => undefined,
    });
    expect(unknownResult).toMatchObject({ ok: false, code: "price_mismatch" });
    expect(unknown.calls.create).toHaveLength(0);

    const yearlyOnMonthly = port({
      subscription: subscription({ priceId: "price_test_practice_yearly" }),
    });
    const mismatch = await executeOperatorPlanDowngrade({
      state: state({ billingInterval: "MONTHLY" }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: yearlyOnMonthly.stripe,
      persist: async () => undefined,
    });
    expect(mismatch).toMatchObject({ ok: false, code: "price_mismatch" });
    expect(yearlyOnMonthly.calls.create).toHaveLength(0);
  });
});

describe("scheduled downgrade state", () => {
  it("is idempotent when River already stored the same downgrade", async () => {
    const fake = port({});
    const effectiveAt = new Date(PERIOD_END * 1000);
    const result = await executeOperatorPlanDowngrade({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_a",
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: effectiveAt,
      }),
      readiness: readiness({ team: 9 }),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
    });
    expect(result).toEqual({
      ok: true,
      alreadyScheduled: true,
      scheduleId: "sub_sched_a",
      effectiveAt,
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.retrieveSubscription).toBe(0);
    expect(fake.calls.create).toHaveLength(0);
  });

  it("recognises an existing River schedule and does not create another", async () => {
    const persisted: string[] = [];
    const fake = port({
      subscription: subscription({ scheduleId: "sub_sched_a" }),
      existing: schedule({
        phases: [
          phase({ priceId: "price_test_practice_monthly" }),
          phase({
            priceId: "price_test_essential_monthly",
            startDate: PERIOD_END,
            endDate: PERIOD_END + 2_592_000,
          }),
        ],
      }),
    });
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },
    });
    expect(result).toMatchObject({
      ok: true,
      alreadyScheduled: true,
      scheduleId: "sub_sched_a",
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.create).toHaveLength(0);
    expect(fake.calls.update).toHaveLength(0);
    expect(persisted).toEqual(["sub_sched_a"]);
  });

  it("does not overwrite an unrelated Stripe schedule", async () => {
    const fake = port({
      subscription: subscription({ scheduleId: "sub_sched_other" }),
      existing: schedule({
        id: "sub_sched_other",
        metadataClinicId: "clinic_other",
        metadataPurpose: "something_else",
      }),
    });
    const result = await executeOperatorPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => {
        throw new Error("must not persist");
      },
    });
    expect(result).toMatchObject({ ok: false, code: "unknown_schedule" });
    expect(fake.calls.create).toHaveLength(0);
    expect(fake.calls.update).toHaveLength(0);
    expect(fake.calls.release).toHaveLength(0);
  });

  it("keeps the local plan on Practice until Stripe changes the price", () => {
    const assessed = assessOperatorPlanDowngrade({
      state: state(),
      readiness: readiness({}),
    });
    expect(assessed.ok).toBe(true);
    const presentation = presentScheduledPlanChange({
      commercialPlan: "PRACTICE",
      scheduledCommercialPlan: "ESSENTIAL",
      effectiveAt: new Date("2026-10-22T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    });
    expect(presentation?.operatorLines.plan).toBe("Practice");
    expect(presentation?.operatorLines.scheduledChange).toContain(
      "Essential on "
    );
    expect(presentation?.operatorLines.currentAccess).toContain(
      "Practice until "
    );
    expect(presentation?.customerMessage).toContain("Practice stays active");
    expect(presentation?.operatorLines.plan).not.toBe("Essential");
  });

  it("blocks past-due, cancellation, and other ineligible billing states", async () => {
    const cases: Array<[Partial<PlanDowngradeState>, string]> = [
      [{ billingStatus: BillingStatus.PAST_DUE }, "past_due"],
      [
        {
          cancelAtPeriodEnd: true,
          billingStatus: BillingStatus.CANCEL_AT_PERIOD_END,
        },
        "cancel_scheduled",
      ],
      [{ billingStatus: BillingStatus.ENDED }, "ended"],
      [{ entitlementStatus: EntitlementStatus.ENDED }, "ended"],
      [{ stripeSubscriptionId: null }, "no_subscription"],
      [
        { stripeCheckoutSessionId: "cs_open", stripeSubscriptionId: null },
        "pending_checkout",
      ],
      [{ commercialPlan: "ESSENTIAL" }, "already_essential"],
      [
        {
          billingStatus: BillingStatus.UNPAID,
          entitlementStatus: EntitlementStatus.RESTRICTED,
        },
        "not_active",
      ],
    ];
    for (const [overrides, code] of cases) {
      const fake = port({});
      const result = await executeOperatorPlanDowngrade({
        state: state(overrides),
        readiness: readiness({}),
        env: BILLING_TEST_ENV,
        stripe: fake.stripe,
        persist: async () => undefined,
      });
      expect(result).toMatchObject({ ok: false, code });
      expect(fake.calls.retrieveSubscription).toBe(0);
    }
  });
});

describe("Keep Practice reversal", () => {
  it("releases the River schedule and clears the local projection", async () => {
    const cleared: boolean[] = [];
    const fake = port({
      subscription: subscription({ scheduleId: "sub_sched_a" }),
    });
    const result = await executeOperatorDowngradeReversal({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_a",
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date(PERIOD_END * 1000),
      }),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      clear: async () => {
        cleared.push(true);
      },
    });
    expect(result).toEqual({
      ok: true,
      alreadyReversed: false,
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.release[0]?.params).toEqual({
      preserve_cancel_date: false,
    });
    expect(fake.calls.release[0]?.id).toBe("sub_sched_a");
    expect(fake.calls.subscriptionCreate).toBe(0);
    expect(fake.calls.subscriptionUpdate).toBe(0);
    expect(fake.calls.invoice).toBe(0);
    expect(fake.calls.refund).toBe(0);
    expect(cleared).toEqual([true]);
  });

  it("is idempotent when the downgrade is already gone", async () => {
    const fake = port({});
    const result = await executeOperatorDowngradeReversal({
      state: state(),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      clear: async () => {
        throw new Error("nothing to clear");
      },
    });
    expect(result).toEqual({
      ok: true,
      alreadyReversed: true,
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.release).toHaveLength(0);
  });

  it("does not release an unrelated schedule", async () => {
    const fake = port({
      subscription: subscription({ scheduleId: "sub_sched_other" }),
      existing: schedule({
        id: "sub_sched_other",
        metadataClinicId: null,
        metadataPurpose: null,
      }),
    });
    const result = await executeOperatorDowngradeReversal({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_a",
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date(PERIOD_END * 1000),
      }),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      clear: async () => {
        throw new Error("must not clear");
      },
    });
    expect(result).toMatchObject({ ok: false, code: "unknown_schedule" });
    expect(fake.calls.release).toHaveLength(0);
  });
});

describe("cancellation and a scheduled downgrade", () => {
  it("blocks scheduling when cancellation is already set", () => {
    expect(
      assessOperatorPlanDowngrade({
        state: state({ cancelAtPeriodEnd: true }),
        readiness: readiness({}),
      })
    ).toMatchObject({ ok: false, code: "cancel_scheduled" });
    expect(
      assessOperatorDowngradeReversal(
        state({
          cancelAtPeriodEnd: true,
          stripeSubscriptionScheduleId: "sub_sched_a",
          scheduledCommercialPlan: "ESSENTIAL",
          scheduledPlanEffectiveAt: new Date(PERIOD_END * 1000),
        })
      )
    ).toMatchObject({ ok: false, code: "cancel_scheduled" });
  });

  it("drops the Essential phase when the schedule end behavior becomes cancel", () => {
    const decision = decideSubscriptionScheduleEvent({
      notice: {
        scheduleId: "sub_sched_a",
        status: "active",
        endBehavior: "cancel",
        subscriptionId: "sub_clinic_a",
        releasedSubscriptionId: null,
        metadataClinicId: "clinic_a",
        metadataPurpose: "practice_to_essential",
        currentPriceId: "price_test_practice_monthly",
        currentQuantity: 1,
        currentStart: PHASE_START,
        currentEnd: PERIOD_END,
        futurePriceId: "price_test_essential_monthly",
      },
      clinicId: "clinic_a",
      localScheduleId: "sub_sched_a",
      practicePriceId: "price_test_practice_monthly",
      essentialPriceId: "price_test_essential_monthly",
    });
    expect(decision).toEqual({
      action: "cancellation_supersedes",
      update: buildCancellationSupersedeUpdate({
        practicePriceId: "price_test_practice_monthly",
        quantity: 1,
        phaseStart: PHASE_START,
        periodEnd: PERIOD_END,
      }),
    });
  });

  it("releases with the cancellation date when cancel is already on the subscription", async () => {
    const fake = port({});
    const released = await releaseSchedulePreservingCancellation({
      stripe: fake.stripe,
      scheduleId: "sub_sched_a",
      expectedSubscriptionId: "sub_clinic_a",
      preserveCancelDate: true,
    });
    expect(released).toEqual({
      ok: true,
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.release[0]?.params).toEqual({
      preserve_cancel_date: true,
    });
    expect(fake.calls.subscriptionUpdate).toBe(0);
  });

  it("releases a leftover schedule when cancellation is reversed and does not recreate Essential", () => {
    expect(
      shouldReleaseScheduleAfterCancellationReversed({
        scheduleId: "sub_sched_a",
        previousCancelAtPeriodEnd: true,
        cancelAtPeriodEnd: false,
      })
    ).toBe(true);
    expect(
      shouldReleaseScheduleAfterCancellationReversed({
        scheduleId: "sub_sched_a",
        previousCancelAtPeriodEnd: false,
        cancelAtPeriodEnd: false,
      })
    ).toBe(false);
    const hidden = presentScheduledPlanChange({
      commercialPlan: "PRACTICE",
      scheduledCommercialPlan: null,
      effectiveAt: null,
      cancelAtPeriodEnd: false,
    });
    expect(hidden).toBeNull();
  });
});
