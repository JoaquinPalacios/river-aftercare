import {
  BillingStatus,
  EntitlementStatus,
  type BillingInterval,
  type CommercialPlan,
} from "@prisma/client";

import type { RetrievedCataloguePrice } from "@/lib/billing/catalogue-price";
import {
  ESSENTIAL_MONTHLY_CENTS,
  ESSENTIAL_YEARLY_CENTS,
  PRACTICE_MONTHLY_CENTS,
  PRACTICE_YEARLY_CENTS,
} from "@/lib/billing/catalogue-price";
import {
  GROUP_ADDITIONAL_SITE_MONTHLY_CENTS,
  GROUP_ADDITIONAL_SITE_YEARLY_CENTS,
  GROUP_BASE_MONTHLY_CENTS,
  GROUP_BASE_YEARLY_CENTS,
} from "@/lib/clinics/group-commercial";

export const BILLING_TEST_ENV = {
  STRIPE_SECRET_KEY: "sk_test_billing_phase1_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_billing_phase1_dummy",
  STRIPE_ESSENTIAL_MONTHLY_PRICE_ID: "price_test_essential_monthly",
  STRIPE_ESSENTIAL_YEARLY_PRICE_ID: "price_test_essential_yearly",
  STRIPE_PRACTICE_MONTHLY_PRICE_ID: "price_test_practice_monthly",
  STRIPE_PRACTICE_YEARLY_PRICE_ID: "price_test_practice_yearly",
} as const;

export const PRACTICE_LOCATION_BILLING_TEST_ENV = {
  ...BILLING_TEST_ENV,
  STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID:
    "price_test_practice_location_monthly",
  STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID:
    "price_test_practice_location_yearly",
} as const;

export const GROUP_BILLING_TEST_ENV = {
  ...PRACTICE_LOCATION_BILLING_TEST_ENV,
  STRIPE_GROUP_MONTHLY_PRICE_ID: "price_test_group_monthly",
  STRIPE_GROUP_YEARLY_PRICE_ID: "price_test_group_yearly",
  STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID:
    "price_test_group_site_monthly",
  STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID: "price_test_group_site_yearly",
} as const;

const CATALOGUE_PRICE_FIXTURES: Record<
  string,
  { cents: number; interval: "month" | "year" }
> = {
  [BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID]: {
    cents: ESSENTIAL_MONTHLY_CENTS,
    interval: "month",
  },
  [BILLING_TEST_ENV.STRIPE_ESSENTIAL_YEARLY_PRICE_ID]: {
    cents: ESSENTIAL_YEARLY_CENTS,
    interval: "year",
  },
  [BILLING_TEST_ENV.STRIPE_PRACTICE_MONTHLY_PRICE_ID]: {
    cents: PRACTICE_MONTHLY_CENTS,
    interval: "month",
  },
  [BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID]: {
    cents: PRACTICE_YEARLY_CENTS,
    interval: "year",
  },
  [GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID]: {
    cents: GROUP_BASE_MONTHLY_CENTS,
    interval: "month",
  },
  [GROUP_BILLING_TEST_ENV.STRIPE_GROUP_YEARLY_PRICE_ID]: {
    cents: GROUP_BASE_YEARLY_CENTS,
    interval: "year",
  },
  [GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID]: {
    cents: GROUP_ADDITIONAL_SITE_MONTHLY_CENTS,
    interval: "month",
  },
  [GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID]: {
    cents: GROUP_ADDITIONAL_SITE_YEARLY_CENTS,
    interval: "year",
  },
};

export function conformingCataloguePrice(
  priceId: string,
  overrides: Partial<RetrievedCataloguePrice> = {}
): RetrievedCataloguePrice {
  const fixture = CATALOGUE_PRICE_FIXTURES[priceId];
  return {
    active: true,
    currency: "aud",
    type: "recurring",
    billing_scheme: "per_unit",
    tax_behavior: "exclusive",
    unit_amount: fixture?.cents ?? null,
    unit_amount_decimal: fixture ? String(fixture.cents) : null,
    recurring: fixture
      ? { interval: fixture.interval, interval_count: 1 }
      : null,
    ...overrides,
  };
}

export const conformingCataloguePrices = {
  async retrieve(id: string) {
    return conformingCataloguePrice(id);
  },
};

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
