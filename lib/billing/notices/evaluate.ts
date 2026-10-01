import "server-only";

import {
  formatAudCents,
  groupOfferQuote,
} from "@/lib/clinics/group-commercial";
import {
  PAST_DUE_BILLING_MESSAGE,
  RESTRICTED_BILLING_MESSAGE,
  formatBillingDate,
} from "@/lib/billing/billing-presentation";
import { PLAN_PRICES } from "@/lib/marketing/plans";
import {
  composeAnnualRenewalEmail,
  composePriceIncreaseEmail,
} from "@/lib/email/billing-notice-mail";
import {
  ANNUAL_RENEWAL_NOTICE_DAYS,
  BILLING_NOTICE_DAY_MS,
  BILLING_NOTICE_PAGE_PATH,
  BILLING_PRICE_CHANGE_ANCHOR,
  PRICE_INCREASE_NOTICE_DAYS,
  PRICE_INCREASE_REMINDER_DAYS,
} from "@/lib/billing/notices/constants";
import type {
  BillingNoticeEvaluation,
  BillingNoticeInterval,
  BillingNoticePlan,
  BillingNoticeSubscription,
  BillingPriceChangePresentation,
  BillingPriceChangeRecord,
  BillingNoticeDeliveryState,
  OverviewBillingNotice,
  PlannedBillingEmail,
} from "@/lib/billing/notices/types";

const PRICE_CHANGE_HREF = `${BILLING_NOTICE_PAGE_PATH}#${BILLING_PRICE_CHANGE_ANCHOR}`;
const MAX_AMOUNT_CENTS = 100_000_000;

export function billingPlanName(plan: BillingNoticePlan | null): string {
  if (plan === "ESSENTIAL") {
    return "Essential";
  }
  if (plan === "PRACTICE") {
    return "Practice";
  }
  if (plan === "GROUP") {
    return "Group";
  }
  return "subscription";
}

export function billingIntervalName(
  interval: BillingNoticeInterval | null
): "Monthly" | "Annual" | null {
  if (interval === "MONTHLY") {
    return "Monthly";
  }
  if (interval === "YEARLY") {
    return "Annual";
  }
  return null;
}

function cadenceWord(interval: BillingNoticeInterval): "month" | "year" {
  return interval === "YEARLY" ? "year" : "month";
}

export function formatRecurringPrice(
  amountCents: number,
  interval: BillingNoticeInterval
): string {
  return `${formatAudCents(amountCents)} per ${cadenceWord(interval)}`;
}

/**
 * The next billing instant is reliable only when Stripe's period end and the
 * paid-through projection are the same instant, and the period start is earlier.
 * A missing date is not invented from the interval or the signup date.
 */
export function reliableRenewalInstant(
  subscription: Pick<
    BillingNoticeSubscription,
    "currentPeriodStart" | "currentPeriodEnd" | "paidThrough"
  >
): Date | null {
  const start = subscription.currentPeriodStart;
  const end = subscription.currentPeriodEnd;
  const paidThrough = subscription.paidThrough;
  if (!start || !end || !paidThrough) {
    return null;
  }
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    Number.isNaN(paidThrough.getTime())
  ) {
    return null;
  }
  if (end.getTime() !== paidThrough.getTime()) {
    return null;
  }
  if (start.getTime() >= end.getTime()) {
    return null;
  }
  return end;
}

export function renewalEventKey(periodStart: Date): string {
  return `period:${periodStart.toISOString()}`;
}

export function priceChangeEventKey(priceChangeId: string): string {
  return `price:${priceChangeId}`;
}

export function cancellationScheduled(
  subscription: Pick<
    BillingNoticeSubscription,
    "cancelAtPeriodEnd" | "billingStatus"
  >
): boolean {
  return (
    subscription.cancelAtPeriodEnd ||
    subscription.billingStatus === "CANCEL_AT_PERIOD_END"
  );
}

export function competingSubscriptionChange(
  subscription: Pick<
    BillingNoticeSubscription,
    | "scheduledCommercialPlan"
    | "scheduledAdditionalSiteQuantity"
    | "stripeSubscriptionScheduleId"
  >
): boolean {
  return Boolean(
    subscription.scheduledCommercialPlan ||
    subscription.scheduledAdditionalSiteQuantity != null ||
    subscription.stripeSubscriptionScheduleId
  );
}

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function wholeQuantity(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function practiceRecurringCents(
  interval: BillingNoticeInterval,
  additionalLocations: number
): number {
  const prices = PLAN_PRICES.practice;
  const yearly = interval === "YEARLY";
  const base = yearly ? prices.annualAudInclGst : prices.monthlyAudInclGst;
  if (additionalLocations <= 0) {
    return dollarsToCents(base);
  }
  const first = yearly
    ? prices.secondLocation.annualAudInclGst
    : prices.secondLocation.monthlyAudInclGst;
  const later = yearly
    ? prices.additionalLocation.annualAudInclGst
    : prices.additionalLocation.monthlyAudInclGst;
  return dollarsToCents(base + first + (additionalLocations - 1) * later);
}

/**
 * Current recurring amount when the stored base Price id matches the catalogue
 * and purchased add-on quantity is a recorded integer. Complimentary extras
 * are not part of the charge. A future increase is never inferred from this.
 */
export function catalogueRecurringAmountCents(
  subscription: BillingNoticeSubscription
): number | null {
  const plan = subscription.commercialPlan;
  const interval = subscription.billingInterval;
  const priceId = subscription.stripePriceId?.trim() ?? "";
  const basePriceId = subscription.catalogueBasePriceId?.trim() ?? "";
  if (!plan || !interval || !priceId || priceId !== basePriceId) {
    return null;
  }

  if (plan === "ESSENTIAL") {
    const locations = subscription.purchasedAdditionalLocationQuantity;
    const sites = subscription.purchasedAdditionalSiteQuantity;
    if (
      (locations != null && locations !== 0) ||
      (sites != null && sites !== 0)
    ) {
      return null;
    }
    const prices = PLAN_PRICES.essential;
    return dollarsToCents(
      interval === "YEARLY" ? prices.annualAudInclGst : prices.monthlyAudInclGst
    );
  }

  if (plan === "PRACTICE") {
    const quantity = wholeQuantity(
      subscription.purchasedAdditionalLocationQuantity
    );
    if (quantity == null) {
      return null;
    }
    if (quantity > 0 && !subscription.catalogueAddonPriceId?.trim()) {
      return null;
    }
    return practiceRecurringCents(interval, quantity);
  }

  const quantity = wholeQuantity(subscription.purchasedAdditionalSiteQuantity);
  if (quantity == null) {
    return null;
  }
  if (quantity > 0 && !subscription.catalogueAddonPriceId?.trim()) {
    return null;
  }
  return groupOfferQuote({
    interval,
    additionalSiteQuantity: quantity,
  }).totalCents;
}

function sydneyDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function sameSydneyCalendarDate(left: Date, right: Date): boolean {
  return sydneyDateKey(left) === sydneyDateKey(right);
}

function cleanLabel(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /[\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function cleanReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 255 && !/\s/.test(trimmed);
}

function positiveCents(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT_CENTS;
}

export type AssessedPriceChange = {
  change: BillingPriceChangeRecord;
  affectedLabel: string;
  currentPriceLabel: string;
  newPriceLabel: string;
  effectiveLabel: string;
  intervalLabel: "Monthly" | "Annual";
};

export function assessScheduledPriceChange(input: {
  change: BillingPriceChangeRecord;
  subscription: BillingNoticeSubscription;
  now: Date;
}): AssessedPriceChange | null {
  const change = input.change;
  const subscription = input.subscription;
  if (change.status !== "SCHEDULED" || change.individuallyAgreed) {
    return null;
  }
  const affectedLabel = cleanLabel(change.affectedLabel);
  if (
    !affectedLabel ||
    !cleanReference(change.id) ||
    !cleanReference(change.stripeSubscriptionId) ||
    !cleanReference(change.stripeSubscriptionItemId)
  ) {
    return null;
  }
  if (
    !subscription.stripeSubscriptionId ||
    change.stripeSubscriptionId !== subscription.stripeSubscriptionId
  ) {
    return null;
  }
  if (
    !subscription.billingInterval ||
    change.billingInterval !== subscription.billingInterval
  ) {
    return null;
  }
  if (
    !positiveCents(change.currentAmountCents) ||
    !positiveCents(change.newAmountCents) ||
    change.newAmountCents <= change.currentAmountCents
  ) {
    return null;
  }
  if (
    Number.isNaN(change.effectiveAt.getTime()) ||
    Number.isNaN(change.createdAt.getTime())
  ) {
    return null;
  }
  const noticeLead = PRICE_INCREASE_NOTICE_DAYS * BILLING_NOTICE_DAY_MS;
  if (change.effectiveAt.getTime() < change.createdAt.getTime() + noticeLead) {
    return null;
  }
  if (change.effectiveAt.getTime() <= input.now.getTime()) {
    return null;
  }
  if (subscription.entitlementStatus !== "ACTIVE") {
    return null;
  }
  if (
    cancellationScheduled(subscription) ||
    competingSubscriptionChange(subscription)
  ) {
    return null;
  }
  const renewal = reliableRenewalInstant(subscription);
  if (!renewal || change.effectiveAt.getTime() < renewal.getTime()) {
    return null;
  }
  const intervalLabel = billingIntervalName(change.billingInterval);
  if (!intervalLabel) {
    return null;
  }
  return {
    change,
    affectedLabel,
    currentPriceLabel: formatRecurringPrice(
      change.currentAmountCents,
      change.billingInterval
    ),
    newPriceLabel: formatRecurringPrice(
      change.newAmountCents,
      change.billingInterval
    ),
    effectiveLabel: formatBillingDate(change.effectiveAt),
    intervalLabel,
  };
}

export function selectScheduledPriceChange(
  rows: readonly BillingPriceChangeRecord[],
  subscriptionId: string | null
):
  | { kind: "none" }
  | { kind: "ambiguous" }
  | { kind: "one"; change: BillingPriceChangeRecord } {
  if (!subscriptionId) {
    return { kind: "none" };
  }
  const scheduled = rows.filter(
    (row) =>
      row.status === "SCHEDULED" &&
      !row.individuallyAgreed &&
      row.stripeSubscriptionId === subscriptionId
  );
  if (scheduled.length === 0) {
    return { kind: "none" };
  }
  if (scheduled.length > 1) {
    return { kind: "ambiguous" };
  }
  return { kind: "one", change: scheduled[0]! };
}

function deliveryFor(
  deliveries: readonly BillingNoticeDeliveryState[],
  kind: BillingNoticeDeliveryState["kind"],
  eventKey: string
): BillingNoticeDeliveryState | null {
  return (
    deliveries.find((row) => row.kind === kind && row.eventKey === eventKey) ??
    null
  );
}

function timelyInitialSent(
  delivery: BillingNoticeDeliveryState | null,
  effectiveAt: Date
): boolean {
  if (!delivery || delivery.status !== "SENT" || !delivery.sentAt) {
    return false;
  }
  if (Number.isNaN(delivery.sentAt.getTime())) {
    return false;
  }
  return (
    delivery.sentAt.getTime() <=
    effectiveAt.getTime() - PRICE_INCREASE_NOTICE_DAYS * BILLING_NOTICE_DAY_MS
  );
}

/**
 * A future automated price change must call this before it changes a charge.
 * A failed, pending, or late send does not count. The reminder does not count
 * as the initial notice. This function does not call Stripe.
 */
export function priceIncreaseMayTakeEffect(input: {
  change: BillingPriceChangeRecord;
  subscription: BillingNoticeSubscription;
  now: Date;
  initialDelivery: BillingNoticeDeliveryState | null;
}): boolean {
  const assessed = assessScheduledPriceChange(input);
  if (!assessed) {
    return false;
  }
  return timelyInitialSent(input.initialDelivery, assessed.change.effectiveAt);
}

function paymentIssue(
  subscription: BillingNoticeSubscription
): OverviewBillingNotice | null {
  const pastDue = subscription.billingStatus === "PAST_DUE";
  const restricted =
    subscription.entitlementStatus === "RESTRICTED" ||
    subscription.billingStatus === "UNPAID";
  if (!pastDue && !restricted) {
    return null;
  }
  return {
    id: "payment_issue",
    title: "There’s a payment issue.",
    body: pastDue ? PAST_DUE_BILLING_MESSAGE : RESTRICTED_BILLING_MESSAGE,
    actionLabel: "View billing",
    actionHref: BILLING_NOTICE_PAGE_PATH,
  };
}

function cancellationNotice(
  subscription: BillingNoticeSubscription
): OverviewBillingNotice | null {
  if (!cancellationScheduled(subscription)) {
    return null;
  }
  if (
    subscription.entitlementStatus !== "ACTIVE" &&
    subscription.billingStatus !== "CANCEL_AT_PERIOD_END"
  ) {
    return null;
  }
  const renewal = reliableRenewalInstant(subscription);
  return {
    id: "cancellation",
    title: renewal
      ? `Your subscription is scheduled to end on ${formatBillingDate(renewal)}.`
      : "Your subscription is scheduled to end at the close of the current paid period.",
    body: "You can review billing details before that date.",
    actionLabel: "View billing",
    actionHref: BILLING_NOTICE_PAGE_PATH,
  };
}

function priceChangePresentation(
  assessed: AssessedPriceChange
): BillingPriceChangePresentation {
  const current = formatAudCents(assessed.change.currentAmountCents);
  return {
    title: `Your ${assessed.affectedLabel} subscription will change from ${current} to ${assessed.newPriceLabel} on ${assessed.effectiveLabel}.`,
    body: "You can cancel before this change takes effect. There is no cancellation penalty.",
    affectedLabel: assessed.affectedLabel,
    currentPriceLabel: assessed.currentPriceLabel,
    newPriceLabel: assessed.newPriceLabel,
    effectiveLabel: assessed.effectiveLabel,
    intervalLabel: assessed.intervalLabel,
    actionHref: PRICE_CHANGE_HREF,
  };
}

type AnnouncedPriceChange = {
  assessed: AssessedPriceChange;
  presentation: BillingPriceChangePresentation;
  mayTakeEffect: boolean;
  sendInitial: boolean;
  sendReminder: boolean;
};

function announcePriceChange(input: {
  subscription: BillingNoticeSubscription;
  rows: readonly BillingPriceChangeRecord[];
  deliveries: readonly BillingNoticeDeliveryState[];
  now: Date;
}): {
  announced: AnnouncedPriceChange | null;
  ambiguous: boolean;
} {
  const selected = selectScheduledPriceChange(
    input.rows,
    input.subscription.stripeSubscriptionId
  );
  if (selected.kind === "ambiguous") {
    return { announced: null, ambiguous: true };
  }
  if (selected.kind === "none") {
    return { announced: null, ambiguous: false };
  }
  const assessed = assessScheduledPriceChange({
    change: selected.change,
    subscription: input.subscription,
    now: input.now,
  });
  if (!assessed) {
    return { announced: null, ambiguous: false };
  }
  const eventKey = priceChangeEventKey(assessed.change.id);
  const initial = deliveryFor(
    input.deliveries,
    "PRICE_INCREASE_INITIAL",
    eventKey
  );
  const reminder = deliveryFor(
    input.deliveries,
    "PRICE_INCREASE_REMINDER",
    eventKey
  );
  const deadline =
    assessed.change.effectiveAt.getTime() -
    PRICE_INCREASE_NOTICE_DAYS * BILLING_NOTICE_DAY_MS;
  const stillTimeToNotify = input.now.getTime() <= deadline;
  const notified = timelyInitialSent(initial, assessed.change.effectiveAt);
  if (!stillTimeToNotify && !notified) {
    return { announced: null, ambiguous: false };
  }
  const reminderStart =
    assessed.change.effectiveAt.getTime() -
    PRICE_INCREASE_REMINDER_DAYS * BILLING_NOTICE_DAY_MS;
  const presentation = priceChangePresentation(assessed);
  return {
    ambiguous: false,
    announced: {
      assessed,
      presentation,
      mayTakeEffect:
        notified && assessed.change.effectiveAt.getTime() > input.now.getTime(),
      sendInitial: stillTimeToNotify && initial?.status !== "SENT",
      sendReminder:
        notified &&
        input.now.getTime() >= reminderStart &&
        reminder?.status !== "SENT",
    },
  };
}

function annualRenewalReady(input: {
  subscription: BillingNoticeSubscription;
  now: Date;
  priceChange: AnnouncedPriceChange | null;
}): {
  renewal: Date;
  eventKey: string;
  amountLabel: string | null;
  title: string;
  body: string;
} | null {
  const subscription = input.subscription;
  if (
    subscription.entitlementStatus !== "ACTIVE" ||
    subscription.billingStatus !== "ACTIVE" ||
    subscription.billingInterval !== "YEARLY" ||
    !subscription.commercialPlan ||
    !subscription.stripeSubscriptionId ||
    !subscription.currentPeriodStart
  ) {
    return null;
  }
  if (
    cancellationScheduled(subscription) ||
    competingSubscriptionChange(subscription)
  ) {
    return null;
  }
  const renewal = reliableRenewalInstant(subscription);
  if (!renewal) {
    return null;
  }
  const windowEnd =
    input.now.getTime() + ANNUAL_RENEWAL_NOTICE_DAYS * BILLING_NOTICE_DAY_MS;
  if (
    renewal.getTime() <= input.now.getTime() ||
    renewal.getTime() > windowEnd
  ) {
    return null;
  }
  if (
    input.priceChange &&
    sameSydneyCalendarDate(
      input.priceChange.assessed.change.effectiveAt,
      renewal
    )
  ) {
    return null;
  }
  const amountCents = catalogueRecurringAmountCents(subscription);
  const amountLabel = amountCents == null ? null : formatAudCents(amountCents);
  const dateLabel = formatBillingDate(renewal);
  const plan = billingPlanName(subscription.commercialPlan);
  return {
    renewal,
    eventKey: renewalEventKey(subscription.currentPeriodStart),
    amountLabel,
    title: `Your ${plan} subscription renews on ${dateLabel}.`,
    body: amountLabel
      ? `Your next payment is ${amountLabel}. Review your billing details or manage your subscription before renewal.`
      : "Review your billing details or manage your subscription before renewal.",
  };
}

function selectOverview(
  notices: Array<OverviewBillingNotice | null>
): OverviewBillingNotice | null {
  const priority: OverviewBillingNotice["id"][] = [
    "payment_issue",
    "cancellation",
    "price_increase",
    "annual_renewal",
  ];
  for (const id of priority) {
    const notice = notices.find((entry) => entry?.id === id);
    if (notice) {
      return notice;
    }
  }
  return null;
}

export function evaluateBillingNotices(input: {
  subscription: BillingNoticeSubscription;
  priceChanges: readonly BillingPriceChangeRecord[];
  deliveries: readonly BillingNoticeDeliveryState[];
  now: Date;
  billingUrl: string;
  contactUrl: string;
}): BillingNoticeEvaluation {
  const price = announcePriceChange({
    subscription: input.subscription,
    rows: input.priceChanges,
    deliveries: input.deliveries,
    now: input.now,
  });
  const annual = annualRenewalReady({
    subscription: input.subscription,
    now: input.now,
    priceChange: price.announced,
  });
  const renewal = reliableRenewalInstant(input.subscription);
  const currentCents = catalogueRecurringAmountCents(input.subscription);
  const interval = input.subscription.billingInterval;
  const emails: PlannedBillingEmail[] = [];

  if (price.announced?.sendInitial) {
    const composed = composePriceIncreaseEmail({
      phase: "initial",
      affectedLabel: price.announced.assessed.affectedLabel,
      currentPriceLabel: price.announced.assessed.currentPriceLabel,
      newPriceLabel: price.announced.assessed.newPriceLabel,
      effectiveLabel: price.announced.assessed.effectiveLabel,
      intervalLabel: price.announced.assessed.intervalLabel,
      billingUrl: input.billingUrl,
      contactUrl: input.contactUrl,
    });
    emails.push({
      kind: "PRICE_INCREASE_INITIAL",
      eventKey: priceChangeEventKey(price.announced.assessed.change.id),
      ...composed,
    });
  }
  if (price.announced?.sendReminder) {
    const composed = composePriceIncreaseEmail({
      phase: "reminder",
      affectedLabel: price.announced.assessed.affectedLabel,
      currentPriceLabel: price.announced.assessed.currentPriceLabel,
      newPriceLabel: price.announced.assessed.newPriceLabel,
      effectiveLabel: price.announced.assessed.effectiveLabel,
      intervalLabel: price.announced.assessed.intervalLabel,
      billingUrl: input.billingUrl,
      contactUrl: input.contactUrl,
    });
    emails.push({
      kind: "PRICE_INCREASE_REMINDER",
      eventKey: priceChangeEventKey(price.announced.assessed.change.id),
      ...composed,
    });
  }
  if (annual && input.subscription.billingStatus === "ACTIVE") {
    const composed = composeAnnualRenewalEmail({
      planLabel: billingPlanName(input.subscription.commercialPlan),
      renewalLabel: formatBillingDate(annual.renewal),
      intervalLabel: "Annual",
      amountLabel: annual.amountLabel,
      billingUrl: input.billingUrl,
      contactUrl: input.contactUrl,
    });
    emails.push({
      kind: "ANNUAL_RENEWAL_REMINDER",
      eventKey: annual.eventKey,
      ...composed,
    });
  }

  const annualNotice: OverviewBillingNotice | null = annual
    ? {
        id: "annual_renewal",
        title: annual.title,
        body: annual.body,
        actionLabel: "View billing",
        actionHref: BILLING_NOTICE_PAGE_PATH,
      }
    : null;
  const priceNotice: OverviewBillingNotice | null = price.announced
    ? {
        id: "price_increase",
        title: price.announced.presentation.title,
        body: price.announced.presentation.body,
        actionLabel: "Review price change",
        actionHref: PRICE_CHANGE_HREF,
      }
    : null;

  const showRenewalDate =
    renewal != null &&
    !cancellationScheduled(input.subscription) &&
    input.subscription.entitlementStatus === "ACTIVE" &&
    (input.subscription.billingStatus === "ACTIVE" ||
      input.subscription.billingStatus === "PAST_DUE");
  const periodEndLabel = renewal ? formatBillingDate(renewal) : null;

  return {
    overview: selectOverview([
      paymentIssue(input.subscription),
      cancellationNotice(input.subscription),
      priceNotice,
      annualNotice,
    ]),
    page: {
      currentPriceLabel:
        currentCents != null && interval
          ? formatRecurringPrice(currentCents, interval)
          : null,
      periodEndLabel,
      nextRenewalLabel: showRenewalDate ? periodEndLabel : null,
      annualReminder: annual
        ? { title: annual.title, body: annual.body }
        : null,
      priceChange: price.announced?.presentation ?? null,
    },
    emails,
    priceChangeAmbiguous: price.ambiguous,
    priceIncreaseMayTakeEffect: price.announced?.mayTakeEffect ?? false,
  };
}

export function billingNoticeIdempotencyKey(input: {
  clinicId: string;
  stripeSubscriptionId: string;
  kind: PlannedBillingEmail["kind"];
  eventKey: string;
}): string {
  const raw = `billing-notice_${input.clinicId}_${input.stripeSubscriptionId}_${input.kind}_${input.eventKey}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}
