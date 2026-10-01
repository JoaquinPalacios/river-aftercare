import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { formatBillingDate } from "@/lib/billing/billing-presentation";
import {
  ANNUAL_RENEWAL_NOTICE_DAYS,
  BILLING_NOTICE_CLAIM_STALE_MS,
  BILLING_NOTICE_DAY_MS,
} from "@/lib/billing/notices/constants";
import {
  billingNoticeCronAuthorized,
  billingNoticeCronHostAllowed,
} from "@/lib/billing/notices/cron-auth";
import { deliverPlannedBillingEmails } from "@/lib/billing/notices/deliver";
import {
  assessScheduledPriceChange,
  billingNoticeIdempotencyKey,
  evaluateBillingNotices,
  PAST_DUE_NOTICE_TITLE,
  priceIncreaseMayTakeEffect,
  renewalEventKey,
  UNPAID_NOTICE_TITLE,
} from "@/lib/billing/notices/evaluate";
import { loadOverviewBillingNotices } from "@/lib/billing/notices/load";
import { canViewCommercialBillingNotices } from "@/lib/billing/notices/permissions";
import { runBillingNoticeJob } from "@/lib/billing/notices/run";
import { createMemoryBillingNoticeStore } from "@/lib/billing/notices/store";
import type {
  BillingNoticeDeliveryState,
  BillingNoticeSubscription,
  BillingPriceChangeRecord,
} from "@/lib/billing/notices/types";
import {
  PAST_DUE_BILLING_MESSAGE,
  RESTRICTED_BILLING_MESSAGE,
} from "@/lib/billing/billing-presentation";
import {
  composeAnnualRenewalEmail,
  composePriceIncreaseEmail,
  getBillingNoticeMailConfig,
} from "@/lib/email/billing-notice-mail";
import { GROUP_BASE_YEARLY_CENTS } from "@/lib/clinics/group-commercial";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

const NOW = new Date("2026-11-01T00:00:00.000Z");
const PERIOD_START = new Date("2025-12-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-12-01T00:00:00.000Z");
const RENEWAL_LABEL = formatBillingDate(PERIOD_END);
const LINKS = {
  billingUrl: "http://app.localhost:3000/account/billing",
  contactUrl: "http://localhost:3000/contact",
};

function subscription(
  overrides: Partial<BillingNoticeSubscription> = {}
): BillingNoticeSubscription {
  return {
    entitlementStatus: "ACTIVE",
    billingStatus: "ACTIVE",
    commercialPlan: "PRACTICE",
    billingInterval: "YEARLY",
    stripePriceId: "price_test_practice_yearly",
    stripeSubscriptionId: "sub_notice",
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    paidThrough: PERIOD_END,
    cancelAtPeriodEnd: false,
    scheduledCommercialPlan: null,
    scheduledAdditionalSiteQuantity: null,
    stripeSubscriptionScheduleId: null,
    purchasedAdditionalLocationQuantity: 0,
    purchasedAdditionalSiteQuantity: null,
    catalogueBasePriceId: "price_test_practice_yearly",
    catalogueAddonPriceId: "price_test_practice_location_yearly",
    ...overrides,
  };
}

function priceChange(
  overrides: Partial<BillingPriceChangeRecord> = {}
): BillingPriceChangeRecord {
  return {
    id: "bpc_practice",
    stripeSubscriptionId: "sub_notice",
    stripeSubscriptionItemId: "si_notice",
    affectedLabel: "Practice",
    billingInterval: "YEARLY",
    currentAmountCents: 149_000,
    newAmountCents: 169_000,
    effectiveAt: PERIOD_END,
    status: "SCHEDULED",
    individuallyAgreed: false,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function evaluate(
  overrides: {
    subscription?: Partial<BillingNoticeSubscription>;
    priceChanges?: BillingPriceChangeRecord[];
    deliveries?: BillingNoticeDeliveryState[];
    now?: Date;
  } = {}
) {
  return evaluateBillingNotices({
    subscription: subscription(overrides.subscription),
    priceChanges: overrides.priceChanges ?? [],
    deliveries: overrides.deliveries ?? [],
    now: overrides.now ?? NOW,
    ...LINKS,
  });
}

describe("billing notice decisions", () => {
  it("reminds an active annual subscription inside the final 30 days", () => {
    const result = evaluate();

    expect(result.overview).toMatchObject({
      id: "annual_renewal",
      title: `Your Practice subscription renews on ${RENEWAL_LABEL}.`,
      body: "Your next payment is A$1,490. Review your billing details or manage your subscription before renewal.",
      actionLabel: "View billing",
      actionHref: "/account/billing",
    });
    expect(result.page.nextRenewalLabel).toBe(RENEWAL_LABEL);
    expect(result.page.currentPriceLabel).toBe("A$1,490 per year");
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]).toMatchObject({
      kind: "ANNUAL_RENEWAL_REMINDER",
      eventKey: renewalEventKey(PERIOD_START),
    });
    expect(result.emails[0]?.text).toContain("Practice");
    expect(result.emails[0]?.text).toContain(RENEWAL_LABEL);
    expect(result.emails[0]?.text).toContain("Annual");
    expect(result.emails[0]?.text).toContain("A$1,490");
    expect(result.emails[0]?.text).toContain(LINKS.billingUrl);
    expect(result.emails[0]?.text).toContain("no cancellation fee");
    expect(result.priceIncreaseMayTakeEffect).toBe(false);
  });

  it("keeps a reliable renewal date on the billing page when the annual date is more than 30 days away", () => {
    const result = evaluate({
      now: new Date(
        PERIOD_END.getTime() -
          (ANNUAL_RENEWAL_NOTICE_DAYS + 1) * BILLING_NOTICE_DAY_MS
      ),
    });

    expect(result.overview).toBeNull();
    expect(result.emails).toEqual([]);
    expect(result.page.nextRenewalLabel).toBe(RENEWAL_LABEL);
    expect(result.page.annualReminder).toBeNull();
  });

  it("does not plan another annual email when that period reminder is already sent", () => {
    const result = evaluate({
      deliveries: [
        {
          kind: "ANNUAL_RENEWAL_REMINDER",
          eventKey: renewalEventKey(PERIOD_START),
          status: "SENT",
          sentAt: NOW,
        },
      ],
    });

    expect(result.emails).toHaveLength(1);
    expect(result.overview?.id).toBe("annual_renewal");
  });

  it("shows a scheduled cancellation and does not remind about renewal", () => {
    const result = evaluate({
      subscription: {
        cancelAtPeriodEnd: true,
        billingStatus: "CANCEL_AT_PERIOD_END",
      },
    });

    expect(result.overview?.id).toBe("cancellation");
    expect(result.overview?.title).toContain(RENEWAL_LABEL);
    expect(result.emails).toEqual([]);
    expect(result.page.nextRenewalLabel).toBeNull();
    expect(result.page.periodEndLabel).toBe(RENEWAL_LABEL);
    expect(result.page.annualReminder).toBeNull();
  });

  it("does not add a reminder for an ordinary monthly renewal", () => {
    const result = evaluate({
      subscription: {
        billingInterval: "MONTHLY",
        stripePriceId: "price_test_practice_monthly",
        catalogueBasePriceId: "price_test_practice_monthly",
        catalogueAddonPriceId: "price_test_practice_location_monthly",
        currentPeriodStart: new Date("2026-11-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
        paidThrough: new Date("2026-12-01T00:00:00.000Z"),
      },
    });

    expect(result.emails).toEqual([]);
    expect(result.overview).toBeNull();
    expect(result.page.nextRenewalLabel).toBe(RENEWAL_LABEL);
    expect(result.page.currentPriceLabel).toBe("A$149 per month");
  });

  it("omits the renewal date when the persisted period is missing or inconsistent", () => {
    const missing = evaluate({
      subscription: { currentPeriodEnd: null, paidThrough: null },
    });
    const mismatched = evaluate({
      subscription: { paidThrough: new Date("2026-11-15T00:00:00.000Z") },
    });

    expect(missing.page.periodEndLabel).toBeNull();
    expect(missing.emails).toEqual([]);
    expect(mismatched.page.nextRenewalLabel).toBeNull();
    expect(mismatched.emails).toEqual([]);
  });

  it("does not quote a renewal amount when the stored price is not the catalogue base", () => {
    const result = evaluate({
      subscription: { stripePriceId: "price_custom_agreement" },
    });

    expect(result.emails[0]?.text).not.toContain("expected renewal amount");
    expect(result.page.currentPriceLabel).toBeNull();
    expect(result.overview?.body).not.toContain("A$");
  });

  it("does not remind a pending or unpaid subscription", () => {
    const pending = evaluate({
      subscription: {
        entitlementStatus: "PENDING",
        billingStatus: "PAYMENT_PENDING",
      },
    });
    const unpaid = evaluate({
      subscription: {
        entitlementStatus: "RESTRICTED",
        billingStatus: "UNPAID",
      },
    });

    expect(pending.overview).toBeNull();
    expect(pending.emails).toEqual([]);
    expect(unpaid.overview?.severity).toBe("unpaid");
    expect(unpaid.emails).toEqual([]);
  });

  it("lets a payment issue take precedence over an annual reminder", () => {
    const result = evaluate({
      subscription: { billingStatus: "PAST_DUE" },
    });

    expect(result.overviewNotices.map((notice) => notice.id)).toEqual([
      "payment_issue",
      "annual_renewal",
    ]);
    expect(result.overview?.severity).toBe("past_due");
    expect(result.overview?.title).toBe(PAST_DUE_NOTICE_TITLE);
    expect(result.overview?.body).toBe(PAST_DUE_BILLING_MESSAGE);
    expect(result.overview?.actionLabel).toBe("Manage billing");
    expect(result.overview?.body).not.toMatch(/suspend/i);
    expect(result.emails).toEqual([]);
    expect(result.page.annualReminder?.title).toContain(RENEWAL_LABEL);
    expect(result.page.nextRenewalLabel).toBe(RENEWAL_LABEL);
    expect(result.page.paymentRecovery).toMatchObject({
      severity: "past_due",
      planLabel: "Practice",
      intervalLabel: "Annual",
      stateLabel: "Payment issue",
      outstandingAmountLabel: null,
      failedPaymentLabel: null,
    });
  });

  it("keeps a price increase visible beside a past-due notice and does not email the failure", () => {
    const later = new Date("2027-01-01T00:00:00.000Z");
    const result = evaluate({
      subscription: { billingStatus: "PAST_DUE" },
      priceChanges: [priceChange({ effectiveAt: later })],
    });

    expect(result.overviewNotices.map((notice) => notice.id)).toEqual([
      "payment_issue",
      "price_increase",
      "annual_renewal",
    ]);
    expect(result.emails.map((email) => email.kind)).toEqual([
      "PRICE_INCREASE_INITIAL",
    ]);
    expect(result.page.paymentRecovery?.outstandingAmountLabel).toBeNull();
    expect(result.page.paymentRecovery?.failedPaymentLabel).toBeNull();
  });

  it("uses unpaid wording when authoring is restricted and omits an invented amount", () => {
    const result = evaluate({
      subscription: {
        entitlementStatus: "RESTRICTED",
        billingStatus: "UNPAID",
      },
    });

    expect(result.overviewNotices).toHaveLength(1);
    expect(result.overview).toMatchObject({
      id: "payment_issue",
      severity: "unpaid",
      title: UNPAID_NOTICE_TITLE,
      body: RESTRICTED_BILLING_MESSAGE,
      actionLabel: "Manage billing",
    });
    expect(result.overview?.body).not.toMatch(/suspend/i);
    expect(result.overview?.body).not.toBe(PAST_DUE_BILLING_MESSAGE);
    expect(result.emails).toEqual([]);
    expect(result.page.annualReminder).toBeNull();
    expect(result.page.paymentRecovery).toMatchObject({
      severity: "unpaid",
      stateLabel: "Unpaid",
      outstandingAmountLabel: null,
      failedPaymentLabel: null,
    });
  });

  it("drops the past-due notice when the projected status is active again", () => {
    const resolved = evaluate();
    expect(resolved.page.paymentRecovery).toBeNull();
    expect(resolved.overviewNotices.map((notice) => notice.id)).toEqual([
      "annual_renewal",
    ]);
  });

  it("shows one past-due notice for a Group account", () => {
    const result = evaluate({
      subscription: {
        commercialPlan: "GROUP",
        billingStatus: "PAST_DUE",
        stripePriceId: "price_test_group_yearly",
        catalogueBasePriceId: "price_test_group_yearly",
        catalogueAddonPriceId: "price_test_group_site_yearly",
        purchasedAdditionalLocationQuantity: null,
        purchasedAdditionalSiteQuantity: 0,
      },
    });

    expect(
      result.overviewNotices.filter((notice) => notice.id === "payment_issue")
    ).toHaveLength(1);
    expect(result.page.paymentRecovery?.planLabel).toBe("Group");
    expect(result.emails).toEqual([]);
  });

  it("announces a valid persisted price increase and sends the initial notice", () => {
    const later = new Date("2026-12-15T00:00:00.000Z");
    const result = evaluate({
      subscription: {
        billingInterval: "MONTHLY",
        stripePriceId: "price_test_practice_monthly",
        catalogueBasePriceId: "price_test_practice_monthly",
        catalogueAddonPriceId: "price_test_practice_location_monthly",
        currentPeriodStart: new Date("2026-11-15T00:00:00.000Z"),
        currentPeriodEnd: later,
        paidThrough: later,
      },
      priceChanges: [
        priceChange({
          billingInterval: "MONTHLY",
          currentAmountCents: 14_900,
          newAmountCents: 16_900,
          effectiveAt: later,
        }),
      ],
    });

    expect(result.overview).toMatchObject({
      id: "price_increase",
      title: `Your Practice subscription will change from A$149 to A$169 per month on ${formatBillingDate(later)}.`,
      actionLabel: "Review price change",
      actionHref: "/account/billing#price-change",
    });
    expect(result.page.priceChange?.currentPriceLabel).toBe("A$149 per month");
    expect(result.page.priceChange?.newPriceLabel).toBe("A$169 per month");
    expect(result.emails.map((email) => email.kind)).toEqual([
      "PRICE_INCREASE_INITIAL",
    ]);
    expect(result.emails[0]?.text).toContain("Current price: A$149 per month.");
    expect(result.emails[0]?.text).toContain("New price: A$169 per month.");
    expect(result.emails[0]?.text).toContain("no cancellation penalty");
    expect(result.emails[0]?.text).toContain(LINKS.contactUrl);
    expect(result.priceIncreaseMayTakeEffect).toBe(false);
  });

  it("stays quiet when no valid price-change schedule exists", () => {
    expect(evaluate().page.priceChange).toBeNull();
    expect(
      evaluate({
        priceChanges: [priceChange({ status: "CANCELLED" })],
      }).page.priceChange
    ).toBeNull();
    expect(
      evaluate({
        priceChanges: [priceChange({ status: "SUPERSEDED" })],
      }).emails
    ).toEqual([expect.objectContaining({ kind: "ANNUAL_RENEWAL_REMINDER" })]);
    expect(
      evaluate({
        priceChanges: [priceChange({ individuallyAgreed: true })],
      }).page.priceChange
    ).toBeNull();
  });

  it("does not announce an increase that would land inside the current paid period", () => {
    const assessed = assessScheduledPriceChange({
      change: priceChange({
        effectiveAt: new Date("2026-11-20T00:00:00.000Z"),
      }),
      subscription: subscription(),
      now: NOW,
    });
    expect(assessed).toBeNull();
    expect(
      evaluate({
        priceChanges: [
          priceChange({ effectiveAt: new Date("2026-11-20T00:00:00.000Z") }),
        ],
      }).page.priceChange
    ).toBeNull();
  });

  it("hides an ambiguous, late, or competing price change", () => {
    const ambiguous = evaluate({
      priceChanges: [
        priceChange({ id: "bpc_a" }),
        priceChange({ id: "bpc_b" }),
      ],
    });
    expect(ambiguous.priceChangeAmbiguous).toBe(true);
    expect(ambiguous.page.priceChange).toBeNull();
    expect(ambiguous.emails.map((email) => email.kind)).toEqual([
      "ANNUAL_RENEWAL_REMINDER",
    ]);

    const late = evaluate({
      now: new Date("2026-11-20T00:00:00.000Z"),
      priceChanges: [priceChange()],
    });
    expect(late.page.priceChange).toBeNull();
    expect(late.priceIncreaseMayTakeEffect).toBe(false);

    const competing = evaluate({
      subscription: { scheduledCommercialPlan: "ESSENTIAL" },
      priceChanges: [priceChange()],
    });
    expect(competing.page.priceChange).toBeNull();
    expect(competing.emails).toEqual([]);
  });

  it("uses the price-increase email when the increase falls on the annual renewal date", () => {
    const result = evaluate({ priceChanges: [priceChange()] });

    expect(result.emails.map((email) => email.kind)).toEqual([
      "PRICE_INCREASE_INITIAL",
    ]);
    expect(result.overview?.id).toBe("price_increase");
    expect(result.page.annualReminder).toBeNull();
  });

  it("sends the seven-day reminder only after a timely initial notice, and only once", () => {
    const effectiveAt = new Date("2026-12-20T00:00:00.000Z");
    const change = priceChange({
      billingInterval: "MONTHLY",
      effectiveAt,
      currentAmountCents: 14_900,
      newAmountCents: 16_900,
    });
    const monthly = {
      billingInterval: "MONTHLY" as const,
      stripePriceId: "price_test_practice_monthly",
      catalogueBasePriceId: "price_test_practice_monthly",
      catalogueAddonPriceId: "price_test_practice_location_monthly",
      currentPeriodStart: new Date("2026-11-20T00:00:00.000Z"),
      currentPeriodEnd: effectiveAt,
      paidThrough: effectiveAt,
    };
    const timely: BillingNoticeDeliveryState = {
      kind: "PRICE_INCREASE_INITIAL",
      eventKey: "price:bpc_practice",
      status: "SENT",
      sentAt: new Date("2026-11-01T00:00:00.000Z"),
    };
    const reminderDay = new Date(
      effectiveAt.getTime() - 7 * BILLING_NOTICE_DAY_MS
    );
    const open = evaluate({
      now: reminderDay,
      subscription: monthly,
      priceChanges: [change],
      deliveries: [timely],
    });
    expect(open.emails.map((email) => email.kind)).toEqual([
      "PRICE_INCREASE_REMINDER",
    ]);
    expect(open.priceIncreaseMayTakeEffect).toBe(true);
    expect(
      priceIncreaseMayTakeEffect({
        change,
        subscription: subscription(monthly),
        now: reminderDay,
        initialDelivery: timely,
      })
    ).toBe(true);

    const already = evaluate({
      now: reminderDay,
      subscription: monthly,
      priceChanges: [change],
      deliveries: [
        timely,
        {
          kind: "PRICE_INCREASE_REMINDER",
          eventKey: "price:bpc_practice",
          status: "SENT",
          sentAt: reminderDay,
        },
      ],
    });
    expect(already.emails).toEqual([]);
    expect(already.page.priceChange).not.toBeNull();

    const failedOnly = evaluate({
      now: reminderDay,
      subscription: monthly,
      priceChanges: [change],
      deliveries: [{ ...timely, status: "FAILED", sentAt: null }],
    });
    expect(failedOnly.page.priceChange).toBeNull();
    expect(failedOnly.priceIncreaseMayTakeEffect).toBe(false);
  });

  it("does not send both the initial notice and the reminder in one pass", () => {
    const result = evaluate({ priceChanges: [priceChange()] });
    const kinds = result.emails.map((email) => email.kind);
    expect(kinds.includes("PRICE_INCREASE_INITIAL")).toBe(true);
    expect(kinds.includes("PRICE_INCREASE_REMINDER")).toBe(false);
  });

  it("produces one commercial notice for a Group account", () => {
    const result = evaluate({
      subscription: {
        commercialPlan: "GROUP",
        stripePriceId: "price_test_group_yearly",
        catalogueBasePriceId: "price_test_group_yearly",
        catalogueAddonPriceId: "price_test_group_site_yearly",
        purchasedAdditionalLocationQuantity: null,
        purchasedAdditionalSiteQuantity: 0,
      },
    });

    expect(result.overview?.title).toContain("Group");
    expect(result.overview?.body).toContain("A$4,490");
    expect(GROUP_BASE_YEARLY_CENTS).toBe(449_000);
    expect(result.emails).toHaveLength(1);
  });
});

describe("billing notice permissions", () => {
  it("allows the account administrator and operator support", () => {
    expect(
      canViewCommercialBillingNotices({ role: "ADMIN", source: "membership" })
    ).toBe(true);
    expect(
      canViewCommercialBillingNotices({
        role: "ADMIN",
        source: "operator_support",
      })
    ).toBe(true);
  });

  it("denies ordinary clinic staff before any billing read", async () => {
    expect(canViewCommercialBillingNotices({ role: "STAFF" })).toBe(false);
    await expect(
      loadOverviewBillingNotices({ clinicId: "clinic_staff", role: "STAFF" })
    ).resolves.toEqual([]);
  });

  it("loads notices for the commercial clinic account", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib", "billing", "notices", "load.ts"),
      "utf8"
    );
    expect(source).not.toContain("clinicSite");
    expect(source).not.toContain("ClinicSite");
  });

  it("does not place commercial notices on public patient pages", () => {
    const root = path.join(process.cwd(), "app", "(aftercare)");
    const files = walk(root).filter((file) => /\.(ts|tsx)$/.test(file));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("billing-notice");
      expect(source).not.toContain("BillingNotice");
    }
  });
});

describe("billing notice delivery", () => {
  it("does not send a River email for a failed payment, including a repeated pass", async () => {
    const store = createMemoryBillingNoticeStore();
    const planned = evaluate({
      subscription: { billingStatus: "PAST_DUE" },
    }).emails;
    const sender = vi.fn(async () => ({ ok: true as const }));
    const input = {
      clinicId: "clinic_1",
      stripeSubscriptionId: "sub_notice",
      billingEmail: "billing@example.test",
      emails: planned,
      now: NOW,
      store,
      sender,
      replyTo: "hello@example.test",
    };
    await deliverPlannedBillingEmails(input);
    await deliverPlannedBillingEmails(input);
    expect(planned).toEqual([]);
    expect(sender).not.toHaveBeenCalled();
    expect(store.rows).toEqual([]);
  });

  it("records a failure and retries once without a second send after success", async () => {
    const store = createMemoryBillingNoticeStore();
    const planned = evaluate().emails;
    const calls: string[] = [];
    const sender = vi.fn(async () => {
      calls.push("send");
      if (calls.length === 1) {
        return { ok: false as const, code: "delivery_failed" as const };
      }
      return { ok: true as const };
    });

    const failed = await deliverPlannedBillingEmails({
      clinicId: "clinic_1",
      stripeSubscriptionId: "sub_notice",
      billingEmail: "billing@example.test",
      emails: planned,
      now: NOW,
      store,
      sender,
      replyTo: "hello@example.test",
    });
    expect(failed).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(store.rows[0]).toMatchObject({
      status: "FAILED",
      sentAt: null,
      failureCode: "delivery_failed",
      attemptCount: 1,
    });

    const retried = await deliverPlannedBillingEmails({
      clinicId: "clinic_1",
      stripeSubscriptionId: "sub_notice",
      billingEmail: "billing@example.test",
      emails: planned,
      now: new Date(NOW.getTime() + BILLING_NOTICE_CLAIM_STALE_MS),
      store,
      sender,
      replyTo: "hello@example.test",
    });
    expect(retried.sent).toBe(1);
    expect(store.rows[0]?.status).toBe("SENT");
    expect(store.rows[0]?.sentAt).not.toBeNull();

    const duplicate = await deliverPlannedBillingEmails({
      clinicId: "clinic_1",
      stripeSubscriptionId: "sub_notice",
      billingEmail: "billing@example.test",
      emails: planned,
      now: new Date(NOW.getTime() + BILLING_NOTICE_CLAIM_STALE_MS * 2),
      store,
      sender,
    });
    expect(duplicate.skipped).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("does not treat a fresh pending claim as delivered", async () => {
    const store = createMemoryBillingNoticeStore();
    const planned = evaluate().emails;
    await store.claim({
      clinicId: "clinic_1",
      stripeSubscriptionId: "sub_notice",
      kind: planned[0]!.kind,
      eventKey: planned[0]!.eventKey,
      now: NOW,
    });
    const sender = vi.fn(async () => ({ ok: true as const }));
    const result = await deliverPlannedBillingEmails({
      clinicId: "clinic_1",
      stripeSubscriptionId: "sub_notice",
      billingEmail: "billing@example.test",
      emails: planned,
      now: new Date(NOW.getTime() + 60_000),
      store,
      sender,
    });
    expect(result.skipped).toBe(1);
    expect(sender).not.toHaveBeenCalled();
    expect(store.rows[0]?.status).toBe("PENDING");
    expect(store.rows[0]?.sentAt).toBeNull();
  });

  it("keeps a stable idempotency key and requires reply-to", () => {
    const key = billingNoticeIdempotencyKey({
      clinicId: "clinic/1",
      stripeSubscriptionId: "sub notice",
      kind: "ANNUAL_RENEWAL_REMINDER",
      eventKey: renewalEventKey(PERIOD_START),
    });
    expect(key).toBe(
      billingNoticeIdempotencyKey({
        clinicId: "clinic/1",
        stripeSubscriptionId: "sub notice",
        kind: "ANNUAL_RENEWAL_REMINDER",
        eventKey: renewalEventKey(PERIOD_START),
      })
    );
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(
      getBillingNoticeMailConfig({
        AUTH_EMAIL_FROM: "River Aftercare <accounts@example.test>",
      }).ready
    ).toBe(false);
    expect(
      getBillingNoticeMailConfig({
        AUTH_EMAIL_FROM: "River Aftercare <accounts@example.test>",
        AUTH_EMAIL_REPLY_TO: "hello@example.test",
      }).ready
    ).toBe(true);
  });

  it("runs one account email through the job and skips a sent receipt", async () => {
    const store = createMemoryBillingNoticeStore();
    const candidate = {
      clinicId: "clinic_group",
      billingEmail: "billing@example.test",
      subscription: subscription({
        commercialPlan: "GROUP",
        stripePriceId: "price_test_group_yearly",
        catalogueBasePriceId: "price_test_group_yearly",
        catalogueAddonPriceId: "price_test_group_site_yearly",
        purchasedAdditionalSiteQuantity: 0,
      }),
      priceChanges: [],
      deliveries: [],
    };
    const sender = vi.fn(async (input: { to: string }) => {
      void input;
      return { ok: true as const };
    });
    const first = await runBillingNoticeJob({
      now: NOW,
      env: { CARE_GUIDE_ROOT_DOMAIN: "localhost" },
      sender,
      store,
      loadCandidates: async () => [candidate],
    });
    expect(first).toMatchObject({ examined: 1, sent: 1, failed: 0 });
    const second = await runBillingNoticeJob({
      now: new Date(NOW.getTime() + BILLING_NOTICE_CLAIM_STALE_MS),
      env: { CARE_GUIDE_ROOT_DOMAIN: "localhost" },
      sender,
      store,
      loadCandidates: async () => [candidate],
    });
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0]?.[0]?.to).toBe("billing@example.test");
  });
});

describe("billing notice email copy", () => {
  it("includes the annual facts and the price-change facts", () => {
    const annual = composeAnnualRenewalEmail({
      planLabel: "Practice",
      renewalLabel: RENEWAL_LABEL,
      intervalLabel: "Annual",
      amountLabel: "A$1,490",
      ...LINKS,
    });
    expect(annual.subject).toContain(PRODUCT_NAME);
    expect(annual.html).toContain("View billing");
    expect(annual.html).not.toContain("<script");

    const increase = composePriceIncreaseEmail({
      phase: "initial",
      affectedLabel: "Practice",
      currentPriceLabel: "A$149 per month",
      newPriceLabel: "A$169 per month",
      effectiveLabel: RENEWAL_LABEL,
      intervalLabel: "Monthly",
      ...LINKS,
    });
    expect(increase.text).toContain("Current price");
    expect(increase.text).toContain("New price");
    expect(increase.html).toContain("Contact River Aftercare");
  });
});

describe("billing notice cron access", () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    CARE_GUIDE_ROOT_DOMAIN: "localhost",
  };

  it("accepts only the bearer secret", () => {
    expect(billingNoticeCronAuthorized(null, "secret")).toBe(false);
    expect(billingNoticeCronAuthorized("Bearer secret", undefined)).toBe(false);
    expect(billingNoticeCronAuthorized("Bearer wrong", "secret")).toBe(false);
    expect(billingNoticeCronAuthorized("Bearer secret", "secret")).toBe(true);
  });

  it("allows the staff host and the marketing host, and refuses a patient host", () => {
    expect(billingNoticeCronHostAllowed("app.localhost:3000", env)).toBe(true);
    expect(billingNoticeCronHostAllowed("localhost:3000", env)).toBe(true);
    expect(billingNoticeCronHostAllowed("demodental.localhost:3000", env)).toBe(
      false
    );
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}
