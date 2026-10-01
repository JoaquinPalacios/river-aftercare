import "server-only";

export type BillingNoticePlan = "ESSENTIAL" | "PRACTICE" | "GROUP";

export type BillingNoticeInterval = "MONTHLY" | "YEARLY";

export type BillingNoticeEntitlementStatus =
  "PENDING" | "ACTIVE" | "RESTRICTED" | "ENDED";

export type BillingNoticeBillingStatus =
  | "OFFER_PREPARED"
  | "PAYMENT_PENDING"
  | "ACTIVE"
  | "PAST_DUE"
  | "UNPAID"
  | "CANCEL_AT_PERIOD_END"
  | "ENDED";

/**
 * Local subscription facts. Dates come from the Stripe projection.
 * They are not reconstructed from the signup date or the billing interval.
 */
export type BillingNoticeSubscription = {
  entitlementStatus: BillingNoticeEntitlementStatus | null;
  billingStatus: BillingNoticeBillingStatus | null;
  commercialPlan: BillingNoticePlan | null;
  billingInterval: BillingNoticeInterval | null;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  paidThrough: Date | null;
  cancelAtPeriodEnd: boolean;
  scheduledCommercialPlan: BillingNoticePlan | null;
  scheduledAdditionalSiteQuantity: number | null;
  stripeSubscriptionScheduleId: string | null;
  purchasedAdditionalLocationQuantity: number | null;
  purchasedAdditionalSiteQuantity: number | null;
  /**
   * Configured catalogue Price id for this plan and interval.
   * Null when it is missing or the catalogue is ambiguous.
   * A match is evidence the stored subscription price is the catalogue base.
   * It is not evidence of a future increase.
   */
  catalogueBasePriceId: string | null;
  /** Configured add-on Price id for the same interval. Null when unset. */
  catalogueAddonPriceId: string | null;
};

export type BillingPriceChangeStatus = "SCHEDULED" | "CANCELLED" | "SUPERSEDED";

export type BillingPriceChangeRecord = {
  id: string;
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
  affectedLabel: string;
  billingInterval: BillingNoticeInterval;
  currentAmountCents: number;
  newAmountCents: number;
  effectiveAt: Date;
  status: BillingPriceChangeStatus;
  individuallyAgreed: boolean;
  createdAt: Date;
};

export type BillingNoticeDeliveryState = {
  kind:
    | "ANNUAL_RENEWAL_REMINDER"
    | "PRICE_INCREASE_INITIAL"
    | "PRICE_INCREASE_REMINDER";
  eventKey: string;
  status: "PENDING" | "SENT" | "FAILED";
  sentAt: Date | null;
};

export type OverviewBillingNotice = {
  id: "payment_issue" | "cancellation" | "price_increase" | "annual_renewal";
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  /**
   * Payment problems only. Past due keeps product access.
   * Unpaid is the existing authoring restriction.
   */
  severity?: "past_due" | "unpaid";
};

/**
 * Billing-page facts for a payment problem.
 * Amount and failed-payment date stay null: the local projection does not store them.
 */
export type PaymentRecoveryDetail = {
  severity: "past_due" | "unpaid";
  title: string;
  body: string;
  planLabel: string | null;
  intervalLabel: "Monthly" | "Annual" | null;
  stateLabel: string;
  outstandingAmountLabel: null;
  failedPaymentLabel: null;
  instructions: string;
};

export type BillingPriceChangePresentation = {
  title: string;
  body: string;
  affectedLabel: string;
  currentPriceLabel: string;
  newPriceLabel: string;
  effectiveLabel: string;
  intervalLabel: string;
  actionHref: string;
};

export type BillingPageCommercialDetail = {
  currentPriceLabel: string | null;
  /** Reliable period end, including when cancellation uses it as access-until. */
  periodEndLabel: string | null;
  nextRenewalLabel: string | null;
  annualReminder: { title: string; body: string } | null;
  priceChange: BillingPriceChangePresentation | null;
  paymentRecovery: PaymentRecoveryDetail | null;
};

export type PlannedBillingEmail = {
  kind: BillingNoticeDeliveryState["kind"];
  eventKey: string;
  subject: string;
  text: string;
  html: string;
};

export type BillingNoticeCandidate = {
  clinicId: string;
  billingEmail: string | null;
  subscription: BillingNoticeSubscription;
  priceChanges: BillingPriceChangeRecord[];
  deliveries: BillingNoticeDeliveryState[];
};

export type BillingNoticeEvaluation = {
  /** Highest-priority notice. The full ordered list is `overviewNotices`. */
  overview: OverviewBillingNotice | null;
  /** Payment issue, price increase, annual renewal, then informational notices. */
  overviewNotices: OverviewBillingNotice[];
  page: BillingPageCommercialDetail;
  emails: PlannedBillingEmail[];
  priceChangeAmbiguous: boolean;
  /** False unless a timely initial notice was confirmed sent. */
  priceIncreaseMayTakeEffect: boolean;
};
