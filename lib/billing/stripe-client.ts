import "server-only";

import Stripe from "stripe";

import {
  readTrimmedEnv,
  STRIPE_SECRET_KEY_ENV,
  STRIPE_WEBHOOK_SECRET_ENV,
  type Env,
} from "@/lib/billing/env";

export const STRIPE_TEST_MODE_ONLY = true;

export type StripeClientConfig =
  | {
      ready: true;
      secretKey: string;
      webhookSecret: string;
      apiVersion: string;
    }
  | {
      ready: false;
      reason: string;
    };

function isLiveStripeSecret(secretKey: string): boolean {
  return secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_");
}

function isTestStripeSecret(secretKey: string): boolean {
  return secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_");
}

export function getStripeClientConfig(
  env: Env = process.env
): StripeClientConfig {
  const secretKey = readTrimmedEnv(STRIPE_SECRET_KEY_ENV, env);
  const webhookSecret = readTrimmedEnv(STRIPE_WEBHOOK_SECRET_ENV, env);

  if (!secretKey || !webhookSecret) {
    return {
      ready: false,
      reason: "Stripe billing is not configured.",
    };
  }

  if (isLiveStripeSecret(secretKey)) {
    return {
      ready: false,
      reason: "Live Stripe keys are not permitted.",
    };
  }

  if (!isTestStripeSecret(secretKey)) {
    return {
      ready: false,
      reason: "Stripe secret key must be a test-mode sk_test_ or rk_test_ key.",
    };
  }

  if (!webhookSecret.startsWith("whsec_")) {
    return {
      ready: false,
      reason: "Stripe webhook secret is malformed.",
    };
  }

  return {
    ready: true,
    secretKey,
    webhookSecret,
    apiVersion: Stripe.API_VERSION,
  };
}

let stripeClient: Stripe | undefined;

export function getStripeClient(env: Env = process.env): Stripe {
  const config = getStripeClientConfig(env);
  if (!config.ready) {
    throw new Error(config.reason);
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.secretKey);
  }
  return stripeClient;
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

export function resetStripeClientForTests(): void {
  stripeClient = undefined;
}
