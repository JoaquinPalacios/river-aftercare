import { BillingStatus, EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PAST_DUE_BILLING_MESSAGE } from "@/lib/billing/billing-presentation";
import {
  evaluateBillingNotices,
  PAST_DUE_NOTICE_TITLE,
  UNPAID_NOTICE_TITLE,
} from "@/lib/billing/notices/evaluate";
import type { BillingNoticeSubscription } from "@/lib/billing/notices/types";
import { projectEntitlement } from "@/lib/billing/projection";
import { emptyEntitlement } from "./helpers/billing";

const PERIOD_END = new Date("2026-10-01T00:00:00.000Z");
const NOW = new Date("2026-09-21T00:00:00.000Z");

function project(overrides: Partial<Parameters<typeof projectEntitlement>[0]>) {
  return projectEntitlement({
    eventType: "invoice.paid",
    previous: null,
    clinicId: "clinic_1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_test_practice_monthly",
    mappedPrice: { plan: "PRACTICE", interval: "MONTHLY" },
    unknownPrice: false,
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
    currentPeriodEnd: PERIOD_END,
    invoiceIsPaid: false,
    now: NOW,
    ...overrides,
  });
}

function noticesFor(input: {
  billingStatus: BillingNoticeSubscription["billingStatus"];
  entitlementStatus: BillingNoticeSubscription["entitlementStatus"];
}) {
  const subscription: BillingNoticeSubscription = {
    entitlementStatus: input.entitlementStatus,
    billingStatus: input.billingStatus,
    commercialPlan: "PRACTICE",
    billingInterval: "MONTHLY",
    stripePriceId: null,
    stripeSubscriptionId: "sub_1",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    paidThrough: null,
    cancelAtPeriodEnd: false,
    scheduledCommercialPlan: null,
    scheduledAdditionalSiteQuantity: null,
    stripeSubscriptionScheduleId: null,
    purchasedAdditionalLocationQuantity: 0,
    purchasedAdditionalSiteQuantity: null,
    catalogueBasePriceId: null,
    catalogueAddonPriceId: null,
  };
  return evaluateBillingNotices({
    subscription,
    priceChanges: [],
    deliveries: [],
    now: NOW,
    billingUrl: "http://app.localhost:3000/account/billing",
    contactUrl: "http://localhost:3000/contact",
  });
}

function applied(
  result: ReturnType<typeof projectEntitlement>
): Extract<ReturnType<typeof projectEntitlement>, { kind: "apply" }> {
  expect(result.kind).toBe("apply");
  if (result.kind !== "apply") {
    throw new Error(result.kind);
  }
  return result;
}

describe("past-due notice follows the billing projection", () => {
  it("shows one past-due notice after a failed payment and removes it only after invoice.paid", () => {
    const active = emptyEntitlement({
      commercialPlan: "PRACTICE",
      billingInterval: "MONTHLY",
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
      paidThrough: PERIOD_END,
    });
    expect(
      noticesFor({
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
      }).page.paymentRecovery
    ).toBeNull();

    const failed = applied(
      project({
        eventType: "invoice.payment_failed",
        subscriptionStatus: "past_due",
        previous: active,
      })
    );
    expect(failed.entitlement).toMatchObject({
      billingStatus: BillingStatus.PAST_DUE,
      entitlementStatus: EntitlementStatus.ACTIVE,
    });
    const pastDue = noticesFor({
      billingStatus: failed.entitlement.billingStatus,
      entitlementStatus: failed.entitlement.entitlementStatus,
    });
    expect(pastDue.overviewNotices).toHaveLength(1);
    expect(pastDue.overview).toMatchObject({
      title: PAST_DUE_NOTICE_TITLE,
      body: PAST_DUE_BILLING_MESSAGE,
      actionLabel: "Manage billing",
      severity: "past_due",
    });
    expect(pastDue.emails).toEqual([]);
    expect(pastDue.page.paymentRecovery).toMatchObject({
      outstandingAmountLabel: null,
      failedPaymentLabel: null,
      planLabel: "Practice",
      stateLabel: "Payment issue",
    });

    const methodOnly = applied(
      project({
        eventType: "payment_method.attached",
        subscriptionStatus: "past_due",
        previous: failed.entitlement,
      })
    );
    expect(methodOnly.entitlement.billingStatus).toBe(BillingStatus.PAST_DUE);
    expect(
      noticesFor({
        billingStatus: methodOnly.entitlement.billingStatus,
        entitlementStatus: methodOnly.entitlement.entitlementStatus,
      }).overview?.severity
    ).toBe("past_due");

    const duplicate = applied(
      project({
        eventType: "invoice.payment_failed",
        subscriptionStatus: "past_due",
        previous: methodOnly.entitlement,
      })
    );
    const stillDue = noticesFor({
      billingStatus: duplicate.entitlement.billingStatus,
      entitlementStatus: duplicate.entitlement.entitlementStatus,
    });
    expect(
      stillDue.overviewNotices.filter((notice) => notice.id === "payment_issue")
    ).toHaveLength(1);

    const paid = applied(
      project({
        eventType: "invoice.paid",
        invoiceIsPaid: true,
        subscriptionStatus: "active",
        previous: duplicate.entitlement,
      })
    );
    expect(paid.entitlement).toMatchObject({
      billingStatus: BillingStatus.ACTIVE,
      entitlementStatus: EntitlementStatus.ACTIVE,
    });
    expect(
      noticesFor({
        billingStatus: paid.entitlement.billingStatus,
        entitlementStatus: paid.entitlement.entitlementStatus,
      }).page.paymentRecovery
    ).toBeNull();
  });

  it("switches the notice to the unpaid restriction without ending published-guide retention", () => {
    const unpaid = applied(
      project({
        eventType: "customer.subscription.updated",
        subscriptionStatus: "unpaid",
        previous: emptyEntitlement({
          billingStatus: BillingStatus.PAST_DUE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          paidThrough: PERIOD_END,
        }),
      })
    );
    expect(unpaid.entitlement).toMatchObject({
      billingStatus: BillingStatus.UNPAID,
      entitlementStatus: EntitlementStatus.RESTRICTED,
      publicGuideRetentionUntil: null,
    });
    const notice = noticesFor({
      billingStatus: "UNPAID",
      entitlementStatus: "RESTRICTED",
    });
    expect(notice.overview).toMatchObject({
      title: UNPAID_NOTICE_TITLE,
      severity: "unpaid",
    });
    expect(notice.overview?.body).toContain(
      "Published patient guides stay available"
    );
    expect(notice.overview?.body).not.toMatch(/suspend/i);
    expect(notice.emails).toEqual([]);
  });
});
