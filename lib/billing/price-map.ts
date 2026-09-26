import "server-only";

import {
  STRIPE_ESSENTIAL_MONTHLY_PRICE_ID_ENV,
  STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_YEARLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV,
} from "@/lib/billing/env";

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

type CatalogueSlot =
  | {
      role: "BASE_PLAN";
      plan: CommercialPlanCode;
      interval: BillingIntervalCode;
      envKey: string;
    }
  | {
      role: "GROUP_SITE_ADDON";
      interval: BillingIntervalCode;
      envKey: string;
    };

export const STRIPE_CATALOG_SLOTS: readonly StripeCatalogSlot[] = [
  {
    plan: "ESSENTIAL",
    interval: "MONTHLY",
    envKey: STRIPE_ESSENTIAL_MONTHLY_PRICE_ID_ENV,
  },
  {
    plan: "ESSENTIAL",
    interval: "YEARLY",
    envKey: STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV,
  },
  {
    plan: "PRACTICE",
    interval: "MONTHLY",
    envKey: STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV,
  },
  {
    plan: "PRACTICE",
    interval: "YEARLY",
    envKey: STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV,
  },
] as const;

const STRIPE_CATALOGUE_SLOTS: readonly CatalogueSlot[] = [
  {
    role: "BASE_PLAN",
    plan: "ESSENTIAL",
    interval: "MONTHLY",
    envKey: STRIPE_ESSENTIAL_MONTHLY_PRICE_ID_ENV,
  },
  {
    role: "BASE_PLAN",
    plan: "ESSENTIAL",
    interval: "YEARLY",
    envKey: STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV,
  },
  {
    role: "BASE_PLAN",
    plan: "PRACTICE",
    interval: "MONTHLY",
    envKey: STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV,
  },
  {
    role: "BASE_PLAN",
    plan: "PRACTICE",
    interval: "YEARLY",
    envKey: STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV,
  },
  {
    role: "BASE_PLAN",
    plan: "GROUP",
    interval: "MONTHLY",
    envKey: STRIPE_GROUP_MONTHLY_PRICE_ID_ENV,
  },
  {
    role: "BASE_PLAN",
    plan: "GROUP",
    interval: "YEARLY",
    envKey: STRIPE_GROUP_YEARLY_PRICE_ID_ENV,
  },
  {
    role: "GROUP_SITE_ADDON",
    interval: "MONTHLY",
    envKey: STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV,
  },
  {
    role: "GROUP_SITE_ADDON",
    interval: "YEARLY",
    envKey: STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV,
  },
] as const;

const GROUP_PRICE_ENV_KEYS = [
  STRIPE_GROUP_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV,
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

export type ClassifiedStripePrice =
  | {
      role: "BASE_PLAN";
      plan: CommercialPlanCode;
      interval: BillingIntervalCode;
      priceId: string;
    }
  | {
      role: "GROUP_SITE_ADDON";
      interval: BillingIntervalCode;
      priceId: string;
    };

type ConfiguredCatalogueSlot = CatalogueSlot & { priceId: string };

function readPriceId(
  env: Record<string, string | undefined>,
  envKey: string
): string | null {
  const value = env[envKey]?.trim() ?? "";
  return value ? value : null;
}

function readConfiguredCatalogue(
  env: Record<string, string | undefined>
): ConfiguredCatalogueSlot[] {
  const configured: ConfiguredCatalogueSlot[] = [];
  const seen = new Map<string, string>();

  for (const slot of STRIPE_CATALOGUE_SLOTS) {
    const priceId = readPriceId(env, slot.envKey);
    if (!priceId) {
      continue;
    }
    const previous = seen.get(priceId);
    if (previous) {
      throw new StripePriceMappingError(
        "Stripe Price IDs must be unique across every configured base plan and Group add-on price."
      );
    }
    seen.set(priceId, slot.envKey);
    configured.push({ ...slot, priceId });
  }

  return configured;
}

export function groupBillingAvailable(
  env: Record<string, string | undefined> = process.env
): boolean {
  readConfiguredCatalogue(env);
  return GROUP_PRICE_ENV_KEYS.every((envKey) => readPriceId(env, envKey));
}

export function classifyConfiguredStripePrice(
  stripePriceId: string,
  env: Record<string, string | undefined> = process.env
): ClassifiedStripePrice {
  const trimmed = stripePriceId.trim();
  if (!trimmed) {
    throw new UnknownStripePriceError(stripePriceId);
  }
  const slot = readConfiguredCatalogue(env).find(
    (candidate) => candidate.priceId === trimmed
  );
  if (!slot) {
    throw new UnknownStripePriceError(trimmed);
  }
  if (slot.role === "GROUP_SITE_ADDON") {
    return {
      role: "GROUP_SITE_ADDON",
      interval: slot.interval,
      priceId: slot.priceId,
    };
  }
  return {
    role: "BASE_PLAN",
    plan: slot.plan,
    interval: slot.interval,
    priceId: slot.priceId,
  };
}

export function buildStripePriceMap(
  env: Record<string, string | undefined> = process.env
): StripePriceMap {
  const bySlot = {} as StripePriceMap["bySlot"];
  const byPriceId: StripePriceMap["byPriceId"] = {};

  for (const slot of readConfiguredCatalogue(env)) {
    if (slot.role !== "BASE_PLAN" || slot.plan === "GROUP") {
      continue;
    }
    bySlot[`${slot.plan}:${slot.interval}`] = slot.priceId;
    byPriceId[slot.priceId] = { plan: slot.plan, interval: slot.interval };
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
