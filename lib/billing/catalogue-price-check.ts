import "server-only";

import {
  catalogueBaseUnitAmountCents,
  catalogueGroupSiteUnitAmountCents,
  cataloguePriceMismatchReason,
  type RetrievedCataloguePrice,
} from "@/lib/billing/catalogue-price";
import type { Env } from "@/lib/billing/env";
import { classifyConfiguredStripePrice } from "@/lib/billing/price-map";

export type CataloguePriceReader = {
  retrieve(id: string): Promise<RetrievedCataloguePrice>;
};

/**
 * Refuse a charge when the configured Stripe Price does not match the
 * advertised catalogue. Callers must not fall back to another Price.
 */
export async function cataloguePriceRejection(input: {
  priceId: string;
  env?: Env;
  retrieve: (id: string) => Promise<RetrievedCataloguePrice>;
}): Promise<string | null> {
  const classified = classifyConfiguredStripePrice(input.priceId, input.env);
  const expected = expectedUnitAmount(classified);
  if (expected == null) {
    return "catalogue_price_unmapped";
  }
  const price = await input.retrieve(input.priceId);
  const reason = cataloguePriceMismatchReason(
    expected,
    classified.interval,
    price
  );
  return reason ? `catalogue_price_mismatch_${reason}` : null;
}

function expectedUnitAmount(
  classified: ReturnType<typeof classifyConfiguredStripePrice>
): number | null {
  if (classified.role === "BASE_PLAN") {
    return catalogueBaseUnitAmountCents(classified.plan, classified.interval);
  }
  if (classified.role === "GROUP_SITE_ADDON") {
    return catalogueGroupSiteUnitAmountCents(classified.interval);
  }
  return null;
}

export async function rejectMismatchedCataloguePrices(input: {
  priceIds: readonly string[];
  env?: Env;
  retrieve: (id: string) => Promise<RetrievedCataloguePrice>;
}): Promise<string | null> {
  for (const priceId of input.priceIds) {
    const rejection = await cataloguePriceRejection({
      priceId,
      env: input.env,
      retrieve: input.retrieve,
    });
    if (rejection) {
      return rejection;
    }
  }
  return null;
}
