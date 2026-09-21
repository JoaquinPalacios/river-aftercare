import "server-only";

import type { BillingInterval, CommercialPlan } from "@prisma/client";

import {
  formatAudInclGst,
  LAUNCH_PLANS,
  PLAN_PRICES,
} from "@/lib/marketing/plans";

export type SelfServePlanCode = "ESSENTIAL" | "PRACTICE";

export type CommercialOfferSummary = {
  planName: string;
  priceLabel: string;
  annualNote: string | null;
  intervalLabel: string;
};

export function commercialOfferSummary(
  plan: SelfServePlanCode,
  interval: BillingInterval
): CommercialOfferSummary {
  const launchId = plan === "ESSENTIAL" ? "essential" : "practice";
  const launch = LAUNCH_PLANS.find((entry) => entry.id === launchId);
  const prices =
    plan === "ESSENTIAL" ? PLAN_PRICES.essential : PLAN_PRICES.practice;
  const planName =
    launch?.name ?? (plan === "ESSENTIAL" ? "Essential" : "Practice");

  if (interval === "YEARLY") {
    return {
      planName,
      priceLabel: `${formatAudInclGst(prices.annualAudInclGst)} / year`,
      annualNote: launch?.annualNote ?? "2 months free",
      intervalLabel: "Annual",
    };
  }

  return {
    planName,
    priceLabel: `${formatAudInclGst(prices.monthlyAudInclGst)} / month`,
    annualNote: null,
    intervalLabel: "Monthly",
  };
}

export function commercialPlanLabel(plan: CommercialPlan | null): string {
  if (plan === "ESSENTIAL") {
    return "Essential";
  }
  if (plan === "PRACTICE") {
    return "Practice";
  }
  if (plan === "GROUP") {
    return "Group";
  }
  return "Not selected";
}

export function billingIntervalLabel(interval: BillingInterval | null): string {
  if (interval === "MONTHLY") {
    return "Monthly";
  }
  if (interval === "YEARLY") {
    return "Annual";
  }
  return "Not selected";
}
