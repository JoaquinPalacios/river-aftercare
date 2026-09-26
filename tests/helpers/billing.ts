import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

export const BILLING_TEST_ENV = {
  STRIPE_SECRET_KEY: "sk_test_billing_phase1_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_billing_phase1_dummy",
  STRIPE_ESSENTIAL_MONTHLY_PRICE_ID: "price_test_essential_monthly",
  STRIPE_ESSENTIAL_YEARLY_PRICE_ID: "price_test_essential_yearly",
  STRIPE_PRACTICE_MONTHLY_PRICE_ID: "price_test_practice_monthly",
  STRIPE_PRACTICE_YEARLY_PRICE_ID: "price_test_practice_yearly",
} as const;

export const GROUP_BILLING_TEST_ENV = {
  ...BILLING_TEST_ENV,
  STRIPE_GROUP_MONTHLY_PRICE_ID: "price_test_group_monthly",
  STRIPE_GROUP_YEARLY_PRICE_ID: "price_test_group_yearly",
  STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID:
    "price_test_group_site_monthly",
  STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID: "price_test_group_site_yearly",
} as const;

export function uniqueP2002(target: string[] = ["stripeCustomerId"]) {
  return { code: "P2002", meta: { target } };
}

export function emptyEntitlement(
  overrides: {
    commercialPlan?: CommercialPlan | null;
    billingInterval?: BillingInterval | null;
    billingStatus?: BillingStatus;
    entitlementStatus?: EntitlementStatus;
    stripePriceId?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    paidThrough?: Date | null;
    cancelAtPeriodEnd?: boolean;
    subscriptionEndedAt?: Date | null;
    publicGuideRetentionUntil?: Date | null;
  } = {}
) {
  return {
    commercialPlan: null,
    billingInterval: null,
    billingStatus: BillingStatus.PAYMENT_PENDING,
    entitlementStatus: EntitlementStatus.PENDING,
    stripePriceId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    paidThrough: null,
    cancelAtPeriodEnd: false,
    subscriptionEndedAt: null,
    publicGuideRetentionUntil: null,
    ...overrides,
  };
}
