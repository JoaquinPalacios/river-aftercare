import "server-only";

export const PUBLIC_GUIDE_RETENTION_DAYS = 60;

export const SELF_SERVE_COMMERCIAL_PLANS = ["ESSENTIAL", "PRACTICE"] as const;
export const COMMERCIAL_PLANS = ["ESSENTIAL", "PRACTICE", "GROUP"] as const;
export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;

export type SelfServeCommercialPlan =
  (typeof SELF_SERVE_COMMERCIAL_PLANS)[number];
export type CommercialPlanCode = (typeof COMMERCIAL_PLANS)[number];
export type BillingIntervalCode = (typeof BILLING_INTERVALS)[number];

export type StripeCatalogSlot = {
  plan: SelfServeCommercialPlan;
  interval: BillingIntervalCode;
  envKey: string;
};

export const STRIPE_CATALOG_SLOTS: readonly StripeCatalogSlot[] = [
  {
    plan: "ESSENTIAL",
    interval: "MONTHLY",
    envKey: "STRIPE_ESSENTIAL_MONTHLY_PRICE_ID",
  },
  {
    plan: "ESSENTIAL",
    interval: "YEARLY",
    envKey: "STRIPE_ESSENTIAL_YEARLY_PRICE_ID",
  },
  {
    plan: "PRACTICE",
    interval: "MONTHLY",
    envKey: "STRIPE_PRACTICE_MONTHLY_PRICE_ID",
  },
  {
    plan: "PRACTICE",
    interval: "YEARLY",
    envKey: "STRIPE_PRACTICE_YEARLY_PRICE_ID",
  },
] as const;

export class UnknownStripePriceError extends Error {
  readonly stripePriceId: string;

  constructor(stripePriceId: string) {
    super("Unknown Stripe Price ID.");
    this.name = "UnknownStripePriceError";
    this.stripePriceId = stripePriceId;
  }
}

export class StripePriceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripePriceMappingError";
  }
}

export type StripePriceMap = {
  bySlot: Record<`${SelfServeCommercialPlan}:${BillingIntervalCode}`, string>;
  byPriceId: Record<
    string,
    { plan: SelfServeCommercialPlan; interval: BillingIntervalCode }
  >;
};

function readPriceId(
  env: Record<string, string | undefined>,
  envKey: string
): string | null {
  const value = env[envKey]?.trim() ?? "";
  return value ? value : null;
}

export function buildStripePriceMap(
  env: Record<string, string | undefined> = process.env
): StripePriceMap {
  const bySlot = {} as StripePriceMap["bySlot"];
  const byPriceId: StripePriceMap["byPriceId"] = {};

  for (const slot of STRIPE_CATALOG_SLOTS) {
    const priceId = readPriceId(env, slot.envKey);
    if (!priceId) {
      continue;
    }
    if (byPriceId[priceId]) {
      throw new StripePriceMappingError(
        "Stripe Price IDs must be unique across Essential and Practice prices."
      );
    }
    bySlot[`${slot.plan}:${slot.interval}`] = priceId;
    byPriceId[priceId] = { plan: slot.plan, interval: slot.interval };
  }

  return { bySlot, byPriceId };
}

export function stripePriceIdForPlan(
  plan: SelfServeCommercialPlan,
  interval: BillingIntervalCode,
  env: Record<string, string | undefined> = process.env
): string {
  const map = buildStripePriceMap(env);
  const priceId = map.bySlot[`${plan}:${interval}`];
  if (!priceId) {
    throw new StripePriceMappingError(
      "Stripe Price ID is not configured for that plan and interval."
    );
  }
  return priceId;
}

export function planFromStripePriceId(
  stripePriceId: string,
  env: Record<string, string | undefined> = process.env
): { plan: SelfServeCommercialPlan; interval: BillingIntervalCode } {
  const trimmed = stripePriceId.trim();
  if (!trimmed) {
    throw new UnknownStripePriceError(stripePriceId);
  }
  const mapped = buildStripePriceMap(env).byPriceId[trimmed];
  if (!mapped) {
    throw new UnknownStripePriceError(trimmed);
  }
  return mapped;
}

export function lookupStripePriceId(
  stripePriceId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
):
  | { kind: "none" }
  | {
      kind: "mapped";
      plan: SelfServeCommercialPlan;
      interval: BillingIntervalCode;
    }
  | { kind: "unknown"; stripePriceId: string } {
  const trimmed = stripePriceId?.trim() ?? "";
  if (!trimmed) {
    return { kind: "none" };
  }
  const mapped = buildStripePriceMap(env).byPriceId[trimmed];
  if (!mapped) {
    return { kind: "unknown", stripePriceId: trimmed };
  }
  return { kind: "mapped", ...mapped };
}
