import "server-only";

import type Stripe from "stripe";

import {
  clinicIdFromClientReference,
  clinicIdFromMetadata,
  firstClinicId,
  stripeObjectId,
} from "@/lib/billing/identity";

export const STRIPE_WEBHOOK_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.completed",
  "subscription_schedule.canceled",
] as const;

export type StripeWebhookEventType =
  (typeof STRIPE_WEBHOOK_EVENT_TYPES)[number];

export const STRIPE_WEBHOOK_EVENT_TYPE_SET = new Set<string>(
  STRIPE_WEBHOOK_EVENT_TYPES
);

export type StripeProjectionSnapshot = {
  eventType: string;
  stripeEventId: string;
  stripeCreatedAt: Date;
  clinicIdHint: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  invoiceIsPaid: boolean;
  checkoutPaymentStatus: string | null;
};

function unixToDate(value: number | null | undefined): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000);
}

/**
 * Portal at-period-end cancellation may set `cancel_at` to the period end
 * and leave `cancel_at_period_end` false. `canceled_at` is when the request
 * was made, not the effective end, so it is not part of this check.
 */
export function subscriptionCancellationScheduled(input: {
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
}): boolean {
  if (input.cancel_at_period_end === true) {
    return true;
  }
  return unixToDate(input.cancel_at) !== null;
}

function periodFromSubscriptionItems(
  subscription: Pick<Stripe.Subscription, "items">
): { start: Date | null; end: Date | null } {
  const items = subscription.items?.data ?? [];
  let start: number | null = null;
  let end: number | null = null;
  for (const item of items) {
    if (typeof item.current_period_start === "number") {
      start =
        start == null
          ? item.current_period_start
          : Math.min(start, item.current_period_start);
    }
    if (typeof item.current_period_end === "number") {
      end =
        end == null
          ? item.current_period_end
          : Math.max(end, item.current_period_end);
    }
  }
  return { start: unixToDate(start), end: unixToDate(end) };
}

export function priceIdFromSubscription(
  subscription: Pick<Stripe.Subscription, "items">
): string | null {
  const item = subscription.items?.data?.[0];
  return stripeObjectId(item?.price) ?? stripeObjectId(item?.plan);
}

export function priceIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const lines = invoice.lines?.data ?? [];
  for (const line of lines) {
    const price = line.pricing?.price_details?.price;
    const id = stripeObjectId(price);
    if (id) {
      return id;
    }
  }
  return null;
}

export function subscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  if (invoice.parent?.type === "subscription_details") {
    return stripeObjectId(invoice.parent.subscription_details?.subscription);
  }
  const line = invoice.lines?.data?.[0];
  return (
    stripeObjectId(line?.subscription) ??
    stripeObjectId(line?.parent?.subscription_item_details?.subscription)
  );
}

export function snapshotFromSubscription(
  subscription: Stripe.Subscription,
  eventType: string,
  stripeEventId: string,
  stripeCreated: number
): StripeProjectionSnapshot {
  const period = periodFromSubscriptionItems(subscription);
  return {
    eventType,
    stripeEventId,
    stripeCreatedAt: unixToDate(stripeCreated) ?? new Date(0),
    clinicIdHint: clinicIdFromMetadata(subscription.metadata),
    stripeCustomerId: stripeObjectId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceIdFromSubscription(subscription),
    subscriptionStatus: subscription.status,
    cancelAtPeriodEnd: subscriptionCancellationScheduled(subscription),
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    invoiceIsPaid: false,
    checkoutPaymentStatus: null,
  };
}

export function snapshotFromInvoice(
  invoice: Stripe.Invoice,
  eventType: string,
  stripeEventId: string,
  stripeCreated: number
): StripeProjectionSnapshot {
  const paid = invoice.status === "paid" || eventType === "invoice.paid";
  return {
    eventType,
    stripeEventId,
    stripeCreatedAt: unixToDate(stripeCreated) ?? new Date(0),
    clinicIdHint: clinicIdFromMetadata(
      invoice.parent?.subscription_details?.metadata ?? invoice.metadata
    ),
    stripeCustomerId: stripeObjectId(invoice.customer),
    stripeSubscriptionId: subscriptionIdFromInvoice(invoice),
    stripePriceId: priceIdFromInvoice(invoice),
    subscriptionStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodStart: unixToDate(invoice.period_start),
    currentPeriodEnd: unixToDate(invoice.period_end),
    invoiceIsPaid: paid,
    checkoutPaymentStatus: null,
  };
}

export function snapshotFromCheckoutSession(
  session: Stripe.Checkout.Session,
  eventType: string,
  stripeEventId: string,
  stripeCreated: number
): StripeProjectionSnapshot {
  return {
    eventType,
    stripeEventId,
    stripeCreatedAt: unixToDate(stripeCreated) ?? new Date(0),
    clinicIdHint: firstClinicId(
      clinicIdFromMetadata(session.metadata),
      clinicIdFromClientReference(session.client_reference_id)
    ),
    stripeCustomerId: stripeObjectId(session.customer),
    stripeSubscriptionId: stripeObjectId(session.subscription),
    stripePriceId: null,
    subscriptionStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    invoiceIsPaid: false,
    checkoutPaymentStatus: session.payment_status,
  };
}

export function mergeSubscriptionIntoSnapshot(
  snapshot: StripeProjectionSnapshot,
  subscription: Stripe.Subscription
): StripeProjectionSnapshot {
  const fromSubscription = snapshotFromSubscription(
    subscription,
    snapshot.eventType,
    snapshot.stripeEventId,
    Math.floor(snapshot.stripeCreatedAt.getTime() / 1000)
  );
  return {
    ...snapshot,
    clinicIdHint: firstClinicId(
      snapshot.clinicIdHint,
      fromSubscription.clinicIdHint
    ),
    stripeCustomerId:
      snapshot.stripeCustomerId ?? fromSubscription.stripeCustomerId,
    stripeSubscriptionId:
      snapshot.stripeSubscriptionId ?? fromSubscription.stripeSubscriptionId,
    stripePriceId: snapshot.stripePriceId ?? fromSubscription.stripePriceId,
    subscriptionStatus:
      fromSubscription.subscriptionStatus ?? snapshot.subscriptionStatus,
    cancelAtPeriodEnd: fromSubscription.cancelAtPeriodEnd,
    currentPeriodStart:
      fromSubscription.currentPeriodStart ?? snapshot.currentPeriodStart,
    currentPeriodEnd:
      fromSubscription.currentPeriodEnd ?? snapshot.currentPeriodEnd,
  };
}

export function snapshotFromStripeEvent(
  event: Stripe.Event
): StripeProjectionSnapshot | null {
  const object = event.data.object as { object?: string };

  if (object.object === "checkout.session") {
    return snapshotFromCheckoutSession(
      event.data.object as Stripe.Checkout.Session,
      event.type,
      event.id,
      event.created
    );
  }
  if (object.object === "invoice") {
    return snapshotFromInvoice(
      event.data.object as Stripe.Invoice,
      event.type,
      event.id,
      event.created
    );
  }
  if (object.object === "subscription") {
    return snapshotFromSubscription(
      event.data.object as Stripe.Subscription,
      event.type,
      event.id,
      event.created
    );
  }
  return null;
}
