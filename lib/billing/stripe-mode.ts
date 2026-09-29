import "server-only";

import type { Env } from "@/lib/billing/env";

export const STRIPE_NOT_CONFIGURED_REASON = "Stripe billing is not configured.";

export const STRIPE_WEBHOOK_MALFORMED_REASON =
  "Stripe webhook secret is malformed.";

export const STRIPE_SECRET_MALFORMED_LIVE_REASON =
  "Stripe secret key must be a live-mode sk_live_ or rk_live_ key.";

export const STRIPE_SECRET_MALFORMED_TEST_REASON =
  "Stripe secret key must be a test-mode sk_test_ or rk_test_ key.";

export const STRIPE_TEST_KEY_IN_PRODUCTION_REASON =
  "Test-mode Stripe keys are not permitted in production.";

export const STRIPE_LIVE_KEY_OUTSIDE_PRODUCTION_REASON =
  "Live Stripe keys are not permitted outside production.";

export type StripeDeployment = "production" | "preview" | "local";

export type StripeSecretMode = "live" | "test";

export type StripeSecretDecision =
  { ok: true; mode: StripeSecretMode } | { ok: false; reason: string };

const LIVE_SECRET_KEY = /^(?:sk|rk)_live_\S+$/;
const TEST_SECRET_KEY = /^(?:sk|rk)_test_\S+$/;

export function stripeDeployment(env: Env = process.env): StripeDeployment {
  if (env.VERCEL_ENV === "production") {
    return "production";
  }
  if (env.VERCEL_ENV === "preview") {
    return "preview";
  }
  return "local";
}

export function expectedStripeSecretMode(
  deployment: StripeDeployment
): StripeSecretMode {
  return deployment === "production" ? "live" : "test";
}

export function classifyStripeSecretKey(
  secretKey: string
): StripeSecretMode | null {
  if (LIVE_SECRET_KEY.test(secretKey)) {
    return "live";
  }
  if (TEST_SECRET_KEY.test(secretKey)) {
    return "test";
  }
  return null;
}

export function evaluateStripeSecretKey(
  secretKey: string,
  deployment: StripeDeployment
): StripeSecretDecision {
  const mode = classifyStripeSecretKey(secretKey);
  const expected = expectedStripeSecretMode(deployment);
  if (!mode) {
    return {
      ok: false,
      reason:
        expected === "live"
          ? STRIPE_SECRET_MALFORMED_LIVE_REASON
          : STRIPE_SECRET_MALFORMED_TEST_REASON,
    };
  }
  if (mode !== expected) {
    return {
      ok: false,
      reason:
        expected === "live"
          ? STRIPE_TEST_KEY_IN_PRODUCTION_REASON
          : STRIPE_LIVE_KEY_OUTSIDE_PRODUCTION_REASON,
    };
  }
  return { ok: true, mode };
}

export function isStripeWebhookSecret(value: string): boolean {
  return /^whsec_\S+$/.test(value);
}

export function isStripePortalConfigurationId(value: string): boolean {
  return /^bpc_\S+$/.test(value);
}

export function isStripePriceId(value: string): boolean {
  return /^price_\S+$/.test(value);
}
