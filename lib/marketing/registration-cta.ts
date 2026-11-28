/**
 * Public copy and pure link decisions for self-service registration.
 * This module must not import `server-only`: the marketing header imports the label.
 * The flag itself is read in `registration-offer.ts`.
 */

export const START_FREE_TRIAL_LABEL = "Start free trial";
export const REGISTRATION_PAGE_PATH = "/register";

const SELF_SERVE_PLAN_IDS = new Set(["essential", "practice"]);

export type MarketingRegistrationOffer =
  | { enabled: false }
  | {
      enabled: true;
      href: string;
      label: typeof START_FREE_TRIAL_LABEL;
    };

export type CataloguePlanLink = {
  id: string;
  ctaLabel: string;
  ctaHref: string;
};

export type CataloguePlanCta = {
  label: string;
  href: string;
  assisted: { label: string; href: string } | null;
};

/**
 * Essential and Practice can point at the existing registration form.
 * Group, and every plan while registration is off, keep the plan's own link.
 * The href is the form itself. The register page does not accept a plan or
 * interval, and this helper does not add one. Prices stay on the server.
 */
export function cataloguePlanCta(
  plan: CataloguePlanLink,
  offer: MarketingRegistrationOffer
): CataloguePlanCta {
  if (!offer.enabled || !SELF_SERVE_PLAN_IDS.has(plan.id)) {
    return {
      label: plan.ctaLabel,
      href: plan.ctaHref,
      assisted: null,
    };
  }

  return {
    label: offer.label,
    href: offer.href,
    assisted: {
      label: plan.ctaLabel,
      href: plan.ctaHref,
    },
  };
}
