import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { PRACTICE_LOCATION_BILLING_TEST_ENV } from "@/tests/helpers/billing";
import { createPrismaBillingNoticeStore } from "@/lib/billing/notices/prisma-store";
import {
  evaluateCandidate,
  findBillingNoticeCandidates,
  loadBillingNoticeCandidate,
} from "@/lib/billing/notices/load";
import { renewalEventKey } from "@/lib/billing/notices/evaluate";
import { getPrisma } from "@/lib/prisma";

const NOTICE_ENV = {
  ...PRACTICE_LOCATION_BILLING_TEST_ENV,
  CARE_GUIDE_ROOT_DOMAIN: "localhost",
};

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const CLINIC = "test_billing_notice_clinic";
const SLUG = "test-billing-notice";
const SUBSCRIPTION = "sub_test_billing_notice";
const PERIOD_START = new Date("2025-12-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-12-01T00:00:00.000Z");
const NOW = new Date("2026-11-01T00:00:00.000Z");

describeDb("billing notice persistence", () => {
  function prisma() {
    return getPrisma();
  }

  async function cleanup() {
    await prisma().billingNoticeDelivery.deleteMany({
      where: { clinicId: CLINIC },
    });
    await prisma().billingPriceChange.deleteMany({
      where: { clinicId: CLINIC },
    });
    await prisma().clinicEntitlement.deleteMany({
      where: { clinicId: CLINIC },
    });
    await prisma().clinicBillingProfile.deleteMany({
      where: { clinicId: CLINIC },
    });
    await prisma().clinic.deleteMany({ where: { id: CLINIC } });
  }

  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await cleanup();
    await prisma().$disconnect();
  });

  it("loads one commercial account and deduplicates a delivery receipt", async () => {
    await cleanup();
    await prisma().clinic.create({
      data: {
        id: CLINIC,
        name: "Billing Notice Clinic",
        slug: SLUG,
        billingProfile: {
          create: {
            billingEmail: "billing@example.test",
            stripeSubscriptionId: SUBSCRIPTION,
          },
        },
        entitlement: {
          create: {
            commercialPlan: "PRACTICE",
            billingInterval: "YEARLY",
            billingStatus: "ACTIVE",
            entitlementStatus: "ACTIVE",
            stripePriceId: "price_test_practice_yearly",
            currentPeriodStart: PERIOD_START,
            currentPeriodEnd: PERIOD_END,
            paidThrough: PERIOD_END,
            purchasedAdditionalLocationQuantity: 0,
          },
        },
        billingPriceChanges: {
          create: {
            id: "bpc_test_billing_notice",
            stripeSubscriptionId: SUBSCRIPTION,
            stripeSubscriptionItemId: "si_test_billing_notice",
            affectedLabel: "Practice",
            billingInterval: "YEARLY",
            currentAmountCents: 149_000,
            newAmountCents: 169_000,
            effectiveAt: PERIOD_END,
            status: "SCHEDULED",
            createdAt: new Date("2026-10-01T00:00:00.000Z"),
          },
        },
      },
    });

    const candidate = await loadBillingNoticeCandidate(CLINIC, NOTICE_ENV);
    expect(candidate?.billingEmail).toBe("billing@example.test");
    expect(candidate?.priceChanges).toHaveLength(1);
    const evaluation = evaluateCandidate(candidate!, NOW, NOTICE_ENV);
    expect(evaluation.overview?.id).toBe("price_increase");
    expect(evaluation.emails.map((email) => email.kind)).toEqual([
      "PRICE_INCREASE_INITIAL",
    ]);

    const matches = (await findBillingNoticeCandidates(NOW, NOTICE_ENV)).filter(
      (row) => row.clinicId === CLINIC
    );
    expect(matches).toHaveLength(1);

    const store = createPrismaBillingNoticeStore();
    const claim = {
      clinicId: CLINIC,
      stripeSubscriptionId: SUBSCRIPTION,
      kind: "ANNUAL_RENEWAL_REMINDER" as const,
      eventKey: renewalEventKey(PERIOD_START),
      now: NOW,
    };
    expect(await store.claim(claim)).toBe("send");
    expect(
      await store.claim({ ...claim, now: new Date(NOW.getTime() + 1000) })
    ).toBe("skip");
    await store.complete({
      ...claim,
      result: { ok: false, failureCode: "delivery_failed" },
    });
    const failed = await prisma().billingNoticeDelivery.findFirst({
      where: { clinicId: CLINIC, eventKey: claim.eventKey },
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      sentAt: null,
      failureCode: "delivery_failed",
      attemptCount: 1,
    });
    expect(failed?.id).toBeTruthy();
    const stored = JSON.stringify(failed);
    expect(stored).not.toContain("billing@example.test");

    expect(
      await store.claim({
        ...claim,
        now: new Date(NOW.getTime() + 16 * 60 * 1000),
      })
    ).toBe("send");
    await store.complete({
      ...claim,
      now: new Date(NOW.getTime() + 16 * 60 * 1000),
      result: { ok: true },
    });
    const sent = await prisma().billingNoticeDelivery.findFirst({
      where: { clinicId: CLINIC, eventKey: claim.eventKey },
    });
    expect(sent?.status).toBe("SENT");
    expect(sent?.sentAt).not.toBeNull();
    expect(await store.claim(claim)).toBe("skip");
  });
});
