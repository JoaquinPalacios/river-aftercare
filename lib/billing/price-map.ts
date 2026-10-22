import "server-only";

import {
  STRIPE_ESSENTIAL_MONTHLY_LEGACY_PRICE_IDS_ENV,
  STRIPE_ESSENTIAL_MONTHLY_PRICE_ID_ENV,
  STRIPE_ESSENTIAL_YEARLY_LEGACY_PRICE_IDS_ENV,
  STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_YEARLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_MONTHLY_LEGACY_PRICE_IDS_ENV,
  STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_YEARLY_LEGACY_PRICE_IDS_ENV,
  STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV,
} from "@/lib/billing/env";
import { isStripePriceId } from "@/lib/billing/stripe-mode";

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
      generation: "current" | "legacy";
    }
  | {
      role: "PRACTICE_LOCATION_ADDON";
      interval: BillingIntervalCode;
      envKey: string;
      generation: "current";
    }
  | {
      role: "GROUP_SITE_ADDON";
      interval: BillingIntervalCode;
      envKey: string;
      generation: "current";
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
    generation: "current",
  },
  {
    role: "BASE_PLAN",
    plan: "ESSENTIAL",
    interval: "YEARLY",
    envKey: STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "BASE_PLAN",
    plan: "PRACTICE",
    interval: "MONTHLY",
    envKey: STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "BASE_PLAN",
    plan: "PRACTICE",
    interval: "YEARLY",
    envKey: STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "PRACTICE_LOCATION_ADDON",
    interval: "MONTHLY",
    envKey: STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "PRACTICE_LOCATION_ADDON",
    interval: "YEARLY",
    envKey: STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "BASE_PLAN",
    plan: "GROUP",
    interval: "MONTHLY",
    envKey: STRIPE_GROUP_MONTHLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "BASE_PLAN",
    plan: "GROUP",
    interval: "YEARLY",
    envKey: STRIPE_GROUP_YEARLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "GROUP_SITE_ADDON",
    interval: "MONTHLY",
    envKey: STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV,
    generation: "current",
  },
  {
    role: "GROUP_SITE_ADDON",
    interval: "YEARLY",
    envKey: STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV,
    generation: "current",
  },
] as const;

const LEGACY_BASE_PRICE_ENV = [
  {
    plan: "ESSENTIAL",
    interval: "MONTHLY",
    envKey: STRIPE_ESSENTIAL_MONTHLY_LEGACY_PRICE_IDS_ENV,
  },
  {
    plan: "ESSENTIAL",
    interval: "YEARLY",
    envKey: STRIPE_ESSENTIAL_YEARLY_LEGACY_PRICE_IDS_ENV,
  },
  {
    plan: "PRACTICE",
    interval: "MONTHLY",
    envKey: STRIPE_PRACTICE_MONTHLY_LEGACY_PRICE_IDS_ENV,
  },
  {
    plan: "PRACTICE",
    interval: "YEARLY",
    envKey: STRIPE_PRACTICE_YEARLY_LEGACY_PRICE_IDS_ENV,
  },
] as const satisfies ReadonlyArray<{
  plan: SelfServeCommercialPlan;
  interval: BillingIntervalCode;
  envKey: string;
}>;

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
      role: "PRACTICE_LOCATION_ADDON";
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

function readLegacyPriceIds(
  env: Record<string, string | undefined>,
  envKey: string
): { ids: string[]; invalid: boolean } {
  const raw = env[envKey]?.trim() ?? "";
  if (!raw) {
    return { ids: [], invalid: false };
  }
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (ids.length === 0 || ids.some((id) => !isStripePriceId(id))) {
    return { ids: [], invalid: true };
  }
  return { ids, invalid: false };
}

export const STRIPE_PRICE_IDS_MUST_BE_UNIQUE =
  "Stripe Price IDs must be unique across every configured base plan and add-on price.";

export type StripeCatalogueInspectionSlot = CatalogueSlot & {
  priceId: string | null;
};

export function inspectStripeCatalogue(
  env: Record<string, string | undefined>
): {
  slots: StripeCatalogueInspectionSlot[];
  duplicate: boolean;
  legacyInvalid: boolean;
} {
  const slots: StripeCatalogueInspectionSlot[] = [];
  const seen = new Set<string>();
  let duplicate = false;
  let legacyInvalid = false;

  for (const slot of STRIPE_CATALOGUE_SLOTS) {
    const priceId = readPriceId(env, slot.envKey);
    if (priceId) {
      if (seen.has(priceId)) {
        duplicate = true;
      } else {
        seen.add(priceId);
      }
    }
    slots.push({ ...slot, priceId });
  }

  for (const slot of LEGACY_BASE_PRICE_ENV) {
    const legacy = readLegacyPriceIds(env, slot.envKey);
    if (legacy.invalid) {
      legacyInvalid = true;
      continue;
    }
    for (const priceId of legacy.ids) {
      if (seen.has(priceId)) {
        duplicate = true;
      } else {
        seen.add(priceId);
      }
      slots.push({
        role: "BASE_PLAN",
        plan: slot.plan,
        interval: slot.interval,
        envKey: slot.envKey,
        generation: "legacy",
        priceId,
      });
    }
  }

  return { slots, duplicate, legacyInvalid };
}

function readConfiguredCatalogue(
  env: Record<string, string | undefined>
): ConfiguredCatalogueSlot[] {
  const inspection = inspectStripeCatalogue(env);
  if (inspection.legacyInvalid) {
    throw new StripePriceMappingError(
      "Legacy Stripe Price IDs must be a comma-separated list of price_ ids."
    );
  }
  if (inspection.duplicate) {
    throw new StripePriceMappingError(STRIPE_PRICE_IDS_MUST_BE_UNIQUE);
  }
  return inspection.slots.filter(
    (slot): slot is ConfiguredCatalogueSlot => slot.priceId !== null
  );
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
  if (
    slot.role === "GROUP_SITE_ADDON" ||
    slot.role === "PRACTICE_LOCATION_ADDON"
  ) {
    return {
      role: slot.role,
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
    if (slot.generation === "legacy") {
      byPriceId[slot.priceId] = { plan: slot.plan, interval: slot.interval };
      continue;
    }
    bySlot[`${slot.plan}:${slot.interval}`] = slot.priceId;
    byPriceId[slot.priceId] = { plan: slot.plan, interval: slot.interval };
  }

  return { bySlot, byPriceId };
}

/**
 * Current catalogue Price first, then retired Prices for the same plan and
 * interval. Retired Prices stay recognisable for existing subscriptions.
 * New Checkout uses `stripePriceIdForPlan`, which returns only the current Price.
 */
export function recognizedBasePriceIds(
  plan: SelfServeCommercialPlan,
  interval: BillingIntervalCode,
  env: Record<string, string | undefined> = process.env
): string[] {
  const inspection = inspectStripeCatalogue(env);
  if (inspection.duplicate || inspection.legacyInvalid) {
    return [];
  }
  return inspection.slots.flatMap((slot) => {
    if (
      slot.priceId &&
      slot.role === "BASE_PLAN" &&
      slot.plan === plan &&
      slot.interval === interval
    ) {
      return [slot.priceId];
    }
    return [];
  });
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

export function stripeGroupBasePriceId(
  interval: BillingIntervalCode,
  env: Record<string, string | undefined> = process.env
): string {
  return configuredCataloguePriceId(
    (slot) =>
      slot.role === "BASE_PLAN" &&
      slot.plan === "GROUP" &&
      slot.interval === interval,
    env
  );
}

export function stripeGroupSiteAddonPriceId(
  interval: BillingIntervalCode,
  env: Record<string, string | undefined> = process.env
): string {
  return configuredCataloguePriceId(
    (slot) => slot.role === "GROUP_SITE_ADDON" && slot.interval === interval,
    env
  );
}

function configuredCataloguePriceId(
  match: (slot: ConfiguredCatalogueSlot) => boolean,
  env: Record<string, string | undefined>
): string {
  const priceId = readConfiguredCatalogue(env).find(match)?.priceId;
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
