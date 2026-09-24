import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  assessClinicDowngradeReversal,
  assessClinicPlanDowngrade,
  buildCancellationSupersedeUpdate,
  buildPracticeToEssentialScheduleUpdate,
  decideSubscriptionScheduleEvent,
  classifyAttachedDowngradeSchedule,
  executeClinicDowngradeReversal,
  executeClinicPlanDowngrade,
  PLAN_DOWNGRADE_BILLING_CYCLE_ANCHOR,
  PLAN_DOWNGRADE_END_BEHAVIOR,
  PLAN_DOWNGRADE_PRORATION_BEHAVIOR,
  planDowngradeIdempotencyKey,
  releaseSchedulePreservingCancellation,
  verifyLiveDowngradeSchedule,
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
    stripePlanDowngradeAttemptId: null,
    stripeCheckoutSessionId: null,
    scheduledCommercialPlan: null,
    scheduledPlanEffectiveAt: null,
    ...overrides,
  };
}

const ATTEMPT = "attempt-test";

function testAttempt(attemptId = ATTEMPT) {
  return {
    ensureAttempt: async () => ({ attemptId, created: false }),
    clearProjection: async () => undefined,
  };
}

function subscription(
  overrides: Partial<DowngradeSubscriptionSnapshot> = {}
): DowngradeSubscriptionSnapshot {
  return {
    id: "sub_clinic_a",
    status: "active",
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
  billingCycleAnchor?: string | null;
  hasExtras?: boolean;
}) {
  return {
    priceId: input.priceId,
    quantity: 1,
    startDate: input.startDate ?? PHASE_START,
    endDate: input.endDate ?? PERIOD_END,
    prorationBehavior: input.prorationBehavior ?? "none",
    billingCycleAnchor: input.billingCycleAnchor ?? null,
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
    metadataAttemptId: null,
    phases: [phase({ priceId: "price_test_practice_monthly" })],
    ...overrides,
  };
}

function verifiedSchedule(
  id: string,
  params: {
    metadata: {
      clinicId: string;
      riverSchedulePurpose: string;
      riverDowngradeAttemptId: string;
    };
    end_behavior: string;
    phases: [
      {
        items: Array<{ price: string }>;
        start_date: number;
        end_date: number;
        proration_behavior: string;
      },
      {
        items: Array<{ price: string }>;
        proration_behavior: string;
        billing_cycle_anchor: string;
      },
    ];
  }
): DowngradeScheduleSnapshot {
  const current = params.phases[0];
  const next = params.phases[1];
  return schedule({
    id,
    status: "active",
    endBehavior: params.end_behavior,
    subscriptionId: "sub_clinic_a",
    metadataClinicId: params.metadata.clinicId,
    metadataPurpose: params.metadata.riverSchedulePurpose,
    metadataAttemptId: params.metadata.riverDowngradeAttemptId,
    phases: [
      phase({
        priceId: current.items[0]?.price ?? "",
        startDate: current.start_date,
        endDate: current.end_date,
        prorationBehavior: current.proration_behavior,
      }),
      phase({
        priceId: next.items[0]?.price ?? "",
        startDate: current.end_date,
        endDate: current.end_date + 1,
        prorationBehavior: next.proration_behavior,
        billingCycleAnchor: next.billing_cycle_anchor,
      }),
    ],
  });
}

function port(options: {
  subscription?: DowngradeSubscriptionSnapshot;
  created?: DowngradeScheduleSnapshot;
  existing?: DowngradeScheduleSnapshot;
  updated?: DowngradeScheduleSnapshot;
  released?: DowngradeScheduleSnapshot;
  freezeLive?: boolean;
  updateThrows?: Error;
  freshIds?: boolean;
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
  let subscriptionState = options.subscription ?? subscription();
  let scheduleState = options.existing ?? null;
  let updateFailures = options.updateThrows ? 1 : 0;
  let createdCount = 0;
  const stripe = {
    subscriptions: {
      async retrieve() {
        calls.retrieveSubscription += 1;
        return subscriptionState;
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
        createdCount += 1;
        const created =
          options.created ??
          schedule({
            id: options.freshIds ? `sub_sched_${createdCount}` : "sub_sched_a",
            metadataClinicId: null,
            metadataPurpose: null,
            metadataAttemptId: null,
            phases: [
              phase({
                priceId:
                  subscriptionState.priceId ?? "price_test_practice_monthly",
                prorationBehavior: "create_prorations",
              }),
            ],
          });
        if (!options.freezeLive) {
          subscriptionState = { ...subscriptionState, scheduleId: created.id };
          scheduleState = {
            ...created,
            status: "active",
            subscriptionId: subscriptionState.id,
            releasedSubscriptionId: null,
          };
        }
        return created;
      },
      async retrieve(id: string) {
        if (scheduleState?.id === id) {
          return scheduleState;
        }
        return options.existing ?? schedule({ id });
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
        if (updateFailures > 0) {
          updateFailures -= 1;
          throw options.updateThrows ?? new Error("update failed");
        }
        const updated =
          options.updated ??
          verifiedSchedule(
            id,
            params as Parameters<typeof verifiedSchedule>[1]
          );
        if (!options.freezeLive) {
          scheduleState = updated;
          subscriptionState = { ...subscriptionState, scheduleId: id };
        }
        return updated;
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
        const released =
          options.released ??
          schedule({
            id,
            status: "released",
            subscriptionId: null,
            releasedSubscriptionId: subscriptionState.id,
            metadataAttemptId: scheduleState?.metadataAttemptId ?? null,
          });
        if (!options.freezeLive) {
          scheduleState = released;
          subscriptionState = { ...subscriptionState, scheduleId: null };
        }
        return released;
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
    const result = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,

      ...testAttempt(),
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
      const result = await executeClinicPlanDowngrade({
        state: state(),
        readiness: assessed,
        env: BILLING_TEST_ENV,
        stripe: fake.stripe,
        persist: async () => undefined,

        ...testAttempt(),
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
    const result = await executeClinicPlanDowngrade({
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

      ...testAttempt(),
    });
    expect(result.ok).toBe(true);
    expect(fake.calls.create).toHaveLength(1);
  });

  it("still blocks scheduling when team usage is over even with a valid guide selection", async () => {
    const assessed = readiness({ team: 3, custom: 30, adapted: 10 });
    const fake = port({});
    const result = await executeClinicPlanDowngrade({
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

      ...testAttempt(),
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
    const result = await executeClinicPlanDowngrade({
      state: state(),
      readiness: withinExtras,
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,

      ...testAttempt(),
    });
    expect(result.ok).toBe(true);
  });
});

describe("Practice to Essential schedule request", () => {
  it("keeps Practice through the paid period and switches to Essential monthly", async () => {
    const persisted: Array<{ scheduleId: string; effectiveAt: Date }> = [];
    const fake = port({});
    const result = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row);
      },

      ...testAttempt(),
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
        attemptId: ATTEMPT,
        step: "create",
      }),
    });
    expect(fake.calls.update[0]?.params).toEqual(
      buildPracticeToEssentialScheduleUpdate({
        clinicId: "clinic_a",
        attemptId: ATTEMPT,
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
    const result = await executeClinicPlanDowngrade({
      state: state({ billingInterval: "YEARLY" }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,

      ...testAttempt(),
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
    const unknownResult = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: unknown.stripe,
      persist: async () => undefined,

      ...testAttempt(),
    });
    expect(unknownResult).toMatchObject({ ok: false, code: "price_mismatch" });
    expect(unknown.calls.create).toHaveLength(0);

    const yearlyOnMonthly = port({
      subscription: subscription({ priceId: "price_test_practice_yearly" }),
    });
    const mismatch = await executeClinicPlanDowngrade({
      state: state({ billingInterval: "MONTHLY" }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: yearlyOnMonthly.stripe,
      persist: async () => undefined,

      ...testAttempt(),
    });
    expect(mismatch).toMatchObject({ ok: false, code: "price_mismatch" });
    expect(yearlyOnMonthly.calls.create).toHaveLength(0);
  });
});

describe("scheduled downgrade state", () => {
  it("is idempotent when Stripe still has the same downgrade", async () => {
    const fake = port({
      subscription: subscription({ scheduleId: "sub_sched_a" }),
      existing: schedule({
        metadataAttemptId: ATTEMPT,
        phases: [
          phase({ priceId: "price_test_practice_monthly" }),
          phase({
            priceId: "price_test_essential_monthly",
            startDate: PERIOD_END,
            endDate: PERIOD_END + 2_592_000,
            billingCycleAnchor: "automatic",
          }),
        ],
      }),
    });
    const effectiveAt = new Date(PERIOD_END * 1000);
    const result = await executeClinicPlanDowngrade({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_a",
        stripePlanDowngradeAttemptId: ATTEMPT,
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: effectiveAt,
      }),
      readiness: readiness({ team: 9 }),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,

      ...testAttempt(),
    });
    expect(result).toEqual({
      ok: true,
      alreadyScheduled: true,
      scheduleId: "sub_sched_a",
      effectiveAt,
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.retrieveSubscription).toBeGreaterThan(0);
    expect(fake.calls.create).toHaveLength(0);
  });

  it("recognises an existing River schedule and does not create another", async () => {
    const persisted: string[] = [];
    const fake = port({
      subscription: subscription({ scheduleId: "sub_sched_a" }),
      existing: schedule({
        metadataAttemptId: ATTEMPT,
        phases: [
          phase({ priceId: "price_test_practice_monthly" }),
          phase({
            priceId: "price_test_essential_monthly",
            startDate: PERIOD_END,
            endDate: PERIOD_END + 2_592_000,
            billingCycleAnchor: "automatic",
          }),
        ],
      }),
    });
    const result = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },

      ...testAttempt(),
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
    const result = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => {
        throw new Error("must not persist");
      },

      ...testAttempt(),
    });
    expect(result).toMatchObject({ ok: false, code: "unknown_schedule" });
    expect(fake.calls.create).toHaveLength(0);
    expect(fake.calls.update).toHaveLength(0);
    expect(fake.calls.release).toHaveLength(0);
  });

  it("keeps the local plan on Practice until Stripe changes the price", () => {
    const assessed = assessClinicPlanDowngrade({
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
      const result = await executeClinicPlanDowngrade({
        state: state(overrides),
        readiness: readiness({}),
        env: BILLING_TEST_ENV,
        stripe: fake.stripe,
        persist: async () => undefined,

        ...testAttempt(),
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
    const result = await executeClinicDowngradeReversal({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_a",
        stripePlanDowngradeAttemptId: ATTEMPT,
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
    const result = await executeClinicDowngradeReversal({
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
    const result = await executeClinicDowngradeReversal({
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
      assessClinicPlanDowngrade({
        state: state({ cancelAtPeriodEnd: true }),
        readiness: readiness({}),
      })
    ).toMatchObject({ ok: false, code: "cancel_scheduled" });
    expect(
      assessClinicDowngradeReversal(
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
        metadataAttemptId: ATTEMPT,
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

describe("rescheduling after Keep Practice", () => {
  function store() {
    let id: string | null = null;
    let generation = 0;
    const cleared: string[] = [];
    return {
      cleared,
      current: () => id,
      ensureAttempt: async () => {
        if (id) {
          return { attemptId: id, created: false };
        }
        generation += 1;
        id = `attempt-${generation}`;
        return { attemptId: id, created: true };
      },
      clearProjection: async (row: { retireAttempt: boolean }) => {
        cleared.push(row.retireAttempt ? "retire" : "keep-attempt");
        if (row.retireAttempt) {
          id = null;
        }
      },
      clear: async () => {
        cleared.push("intent");
        id = null;
      },
    };
  }

  it("uses a new attempt and a new schedule after Keep Practice", async () => {
    const attempts = store();
    const fake = port({ freshIds: true });
    const persisted: string[] = [];
    const first = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },
      ensureAttempt: attempts.ensureAttempt,
      clearProjection: attempts.clearProjection,
    });
    expect(first).toMatchObject({
      ok: true,
      alreadyScheduled: false,
      scheduleId: "sub_sched_1",
    });
    const createA = fake.calls.create[0]?.idempotencyKey;
    const updateA = fake.calls.update[0]?.idempotencyKey;
    expect(createA).toContain("attempt-1");
    expect(updateA).toContain("attempt-1");

    const reversed = await executeClinicDowngradeReversal({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_1",
        stripePlanDowngradeAttemptId: "attempt-1",
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date(PERIOD_END * 1000),
      }),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      clear: attempts.clear,
      clearProjection: attempts.clearProjection,
    });
    expect(reversed).toMatchObject({ ok: true, alreadyReversed: false });
    expect(fake.calls.release[0]?.idempotencyKey).toBe(
      planDowngradeIdempotencyKey({
        clinicId: "clinic_a",
        stripeSubscriptionId: "sub_clinic_a",
        attemptId: "attempt-1",
        step: "release",
      })
    );
    expect(attempts.cleared).toContain("intent");
    expect(attempts.current()).toBeNull();

    const second = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },
      ensureAttempt: attempts.ensureAttempt,
      clearProjection: attempts.clearProjection,
    });
    expect(second).toMatchObject({
      ok: true,
      scheduleId: "sub_sched_2",
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.create[1]?.idempotencyKey).toContain("attempt-2");
    expect(fake.calls.create[1]?.idempotencyKey).not.toBe(createA);
    expect(fake.calls.update[1]?.idempotencyKey).not.toBe(updateA);
    expect(persisted).toEqual(["sub_sched_1", "sub_sched_2"]);
    expect(fake.calls.subscriptionCreate).toBe(0);
    expect(fake.calls.invoice).toBe(0);
  });

  it("rejects a replayed schedule body when the live subscription has no schedule", async () => {
    const persisted: string[] = [];
    const retired: boolean[] = [];
    const fake = port({
      freezeLive: true,
      created: schedule({
        id: "sub_sched_old",
        status: "active",
        subscriptionId: "sub_clinic_a",
      }),
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = await executeClinicPlanDowngrade({
      state: state({ stripePlanDowngradeAttemptId: "attempt-stale" }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },
      ensureAttempt: async () => {
        throw new Error("attempt must stay");
      },
      clearProjection: async () => {
        retired.push(true);
      },
    });
    expect(result).toMatchObject({ ok: false, code: "schedule_failed" });
    expect(persisted).toEqual([]);
    expect(fake.calls.update).toHaveLength(0);
    expect(retired).toEqual([true]);
    expect(
      info.mock.calls.some((call) =>
        JSON.stringify(call).includes("plan_downgrade_scheduled")
      )
    ).toBe(false);
    expect(
      error.mock.calls.some((call) =>
        JSON.stringify(call).includes("plan_downgrade_verification_failed")
      )
    ).toBe(true);
    info.mockRestore();
    error.mockRestore();
  });

  it("reuses one attempt when the phase update fails and then finishes it", async () => {
    const attempts = store();
    const fake = port({
      updateThrows: new Error("transient update"),
    });
    const first = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => {
        throw new Error("must not persist");
      },
      ensureAttempt: attempts.ensureAttempt,
      clearProjection: attempts.clearProjection,
    });
    expect(first).toMatchObject({ ok: false, code: "schedule_failed" });
    expect(attempts.current()).toBe("attempt-1");
    expect(fake.calls.create).toHaveLength(1);

    const second = await executeClinicPlanDowngrade({
      state: state({ stripePlanDowngradeAttemptId: "attempt-1" }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async () => undefined,
      ensureAttempt: attempts.ensureAttempt,
      clearProjection: attempts.clearProjection,
    });
    expect(second).toMatchObject({
      ok: true,
      alreadyScheduled: false,
      scheduleId: "sub_sched_a",
    });
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.update).toHaveLength(2);
    expect(fake.calls.update[0]?.idempotencyKey).toBe(
      fake.calls.update[1]?.idempotencyKey
    );
    expect(attempts.current()).toBe("attempt-1");
  });

  it("does not treat a stale local schedule as already scheduled", async () => {
    let id: string | null = "attempt-old";
    const projection: string[] = [];
    const fake = port({ freshIds: true });
    const result = await executeClinicPlanDowngrade({
      state: state({
        stripeSubscriptionScheduleId: "sub_sched_old",
        stripePlanDowngradeAttemptId: "attempt-old",
        scheduledCommercialPlan: "ESSENTIAL",
        scheduledPlanEffectiveAt: new Date(PERIOD_END * 1000),
      }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        expect(row.scheduleId).not.toBe("sub_sched_old");
      },
      ensureAttempt: async () => {
        if (id) {
          return { attemptId: id, created: false };
        }
        id = "attempt-new";
        return { attemptId: id, created: true };
      },
      clearProjection: async () => {
        projection.push("projection");
        id = null;
      },
    });
    expect(result).toMatchObject({ ok: true, alreadyScheduled: false });
    expect(projection).toEqual(["projection"]);
    expect(fake.calls.create[0]?.idempotencyKey).toContain("attempt-new");
    expect(fake.calls.create[0]?.idempotencyKey).not.toContain("attempt-old");
  });

  it("keeps idempotency keys inside Stripe's limit", () => {
    const clinicId = `clinic_${"c".repeat(24)}`;
    const stripeSubscriptionId = `sub_${"s".repeat(24)}`;
    const targetPriceId = `price_${"p".repeat(30)}`;
    const attemptId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const shared = {
      clinicId,
      stripeSubscriptionId,
      targetPriceId,
      periodEnd: PERIOD_END,
      attemptId,
    };
    for (const step of ["create", "update", "release"] as const) {
      const key = planDowngradeIdempotencyKey({ ...shared, step });
      expect(key.length).toBeLessThanOrEqual(255);
      expect(key).toBe(planDowngradeIdempotencyKey({ ...shared, step }));
    }
    expect(
      planDowngradeIdempotencyKey({
        ...shared,
        attemptId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        step: "create",
      })
    ).not.toBe(planDowngradeIdempotencyKey({ ...shared, step: "create" }));
  });

  function copiedPracticeSchedule(
    overrides: Partial<DowngradeScheduleSnapshot> = {}
  ): DowngradeScheduleSnapshot {
    return schedule({
      metadataClinicId: null,
      metadataPurpose: null,
      metadataAttemptId: null,
      phases: [
        phase({
          priceId: "price_test_practice_monthly",
          prorationBehavior: "create_prorations",
        }),
      ],
      ...overrides,
    });
  }

  it("classifies the raw from_subscription phase as intermediate", () => {
    const subscriptionState = subscription({ scheduleId: "sub_sched_a" });
    const input = {
      subscription: subscriptionState,
      clinicId: "clinic_a",
      attemptId: ATTEMPT,
      practicePriceId: "price_test_practice_monthly",
      essentialPriceId: "price_test_essential_monthly",
      periodEnd: PERIOD_END,
    };
    expect(
      classifyAttachedDowngradeSchedule({
        ...input,
        schedule: copiedPracticeSchedule(),
      })
    ).toEqual({ kind: "intermediate" });
    expect(
      classifyAttachedDowngradeSchedule({
        ...input,
        schedule: copiedPracticeSchedule({
          phases: [
            phase({
              priceId: "price_test_practice_monthly",
              prorationBehavior: "always_invoice",
            }),
          ],
        }),
      })
    ).toEqual({ kind: "unknown", reason: "schedule_proration" });
  });

  it("updates the raw from_subscription schedule in the same request", async () => {
    const fake = port({});
    const persisted: string[] = [];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await executeClinicPlanDowngrade({
      state: state(),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },
      ...testAttempt(),
    });
    expect(result).toMatchObject({
      ok: true,
      alreadyScheduled: false,
      scheduleId: "sub_sched_a",
    });
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.update).toHaveLength(1);
    expect(persisted).toEqual(["sub_sched_a"]);
    const update = fake.calls.update[0]?.params as {
      metadata: { clinicId: string; riverDowngradeAttemptId: string };
      phases: Array<{ proration_behavior: string }>;
    };
    expect(update.metadata.clinicId).toBe("clinic_a");
    expect(update.metadata.riverDowngradeAttemptId).toBe(ATTEMPT);
    expect(
      update.phases.every((item) => item.proration_behavior === "none")
    ).toBe(true);
    expect(
      info.mock.calls.some((call) =>
        JSON.stringify(call).includes("plan_downgrade_scheduled")
      )
    ).toBe(true);
    info.mockRestore();
  });

  it("resumes the attached raw schedule without creating another", async () => {
    const attemptA = "c14dbe30-ecfe-4136-8899-a2de4179b408";
    const scheduleB = "sub_sched_1UJ119GYMJ0lopfPkhOj7nLh";
    const fake = port({
      subscription: subscription({ scheduleId: scheduleB }),
      existing: copiedPracticeSchedule({ id: scheduleB }),
    });
    const persisted: string[] = [];
    const result = await executeClinicPlanDowngrade({
      state: state({ stripePlanDowngradeAttemptId: attemptA }),
      readiness: readiness({}),
      env: BILLING_TEST_ENV,
      stripe: fake.stripe,
      persist: async (row) => {
        persisted.push(row.scheduleId);
      },
      ensureAttempt: async () => {
        throw new Error("attempt must stay");
      },
      clearProjection: async () => {
        throw new Error("projection must stay");
      },
    });
    expect(result).toMatchObject({
      ok: true,
      alreadyScheduled: false,
      scheduleId: scheduleB,
      stripeSubscriptionId: "sub_clinic_a",
    });
    expect(fake.calls.create).toHaveLength(0);
    expect(fake.calls.update).toHaveLength(1);
    expect(fake.calls.update[0]?.id).toBe(scheduleB);
    expect(fake.calls.update[0]?.idempotencyKey).toBe(
      planDowngradeIdempotencyKey({
        clinicId: "clinic_a",
        stripeSubscriptionId: "sub_clinic_a",
        targetPriceId: "price_test_essential_monthly",
        periodEnd: PERIOD_END,
        attemptId: attemptA,
        step: "update",
      })
    );
    expect(persisted).toEqual([scheduleB]);
  });

  it("rejects a finished schedule that still prorates", () => {
    const subscriptionState = subscription({ scheduleId: "sub_sched_a" });
    const finished = (
      currentProration: string,
      nextProration: string
    ): DowngradeScheduleSnapshot =>
      schedule({
        metadataAttemptId: ATTEMPT,
        phases: [
          phase({
            priceId: "price_test_practice_monthly",
            prorationBehavior: currentProration,
          }),
          phase({
            priceId: "price_test_essential_monthly",
            startDate: PERIOD_END,
            endDate: PERIOD_END + 2_592_000,
            prorationBehavior: nextProration,
            billingCycleAnchor: "automatic",
          }),
        ],
      });
    const check = (currentProration: string, nextProration: string) =>
      verifyLiveDowngradeSchedule({
        schedule: finished(currentProration, nextProration),
        subscription: subscriptionState,
        expectedScheduleId: "sub_sched_a",
        clinicId: "clinic_a",
        attemptId: ATTEMPT,
        practicePriceId: "price_test_practice_monthly",
        essentialPriceId: "price_test_essential_monthly",
        periodEnd: PERIOD_END,
      });
    expect(check("create_prorations", "none")).toEqual({
      ok: false,
      reason: "schedule_proration",
    });
    expect(check("none", "create_prorations")).toEqual({
      ok: false,
      reason: "schedule_proration",
    });
    expect(check("none", "none")).toMatchObject({ ok: true });
  });

  it("does not adopt an attached schedule with conflicting metadata", async () => {
    const conflicts = [
      {
        metadataClinicId: "clinic_other",
        reason: "schedule_metadata",
      },
      {
        metadataPurpose: "something_else",
        reason: "schedule_metadata",
      },
      {
        metadataAttemptId: "attempt-other",
        reason: "schedule_attempt",
      },
    ];
    for (const conflict of conflicts) {
      const { reason, ...metadata } = conflict;
      const fake = port({
        subscription: subscription({ scheduleId: "sub_sched_other" }),
        existing: copiedPracticeSchedule({
          id: "sub_sched_other",
          ...metadata,
        }),
      });
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const result = await executeClinicPlanDowngrade({
        state: state({ stripePlanDowngradeAttemptId: ATTEMPT }),
        readiness: readiness({}),
        env: BILLING_TEST_ENV,
        stripe: fake.stripe,
        persist: async () => {
          throw new Error("must not persist");
        },
        ensureAttempt: async () => {
          throw new Error("attempt must stay");
        },
        clearProjection: async () => {
          throw new Error("projection must stay");
        },
      });
      expect(result).toMatchObject({ ok: false, code: "unknown_schedule" });
      expect(fake.calls.create).toHaveLength(0);
      expect(fake.calls.update).toHaveLength(0);
      expect(
        error.mock.calls.some((call) => JSON.stringify(call).includes(reason))
      ).toBe(true);
      error.mockRestore();
    }
  });
});
