import "server-only";

import Stripe from "stripe";

import {
  readTrimmedEnv,
  STRIPE_SECRET_KEY_ENV,
  STRIPE_WEBHOOK_SECRET_ENV,
  type Env,
} from "@/lib/billing/env";
import {
  evaluateStripeSecretKey,
  isStripeWebhookSecret,
  STRIPE_NOT_CONFIGURED_REASON,
  STRIPE_WEBHOOK_MALFORMED_REASON,
  stripeDeployment,
} from "@/lib/billing/stripe-mode";

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

export function getStripeClientConfig(
  env: Env = process.env
): StripeClientConfig {
  const secretKey = readTrimmedEnv(STRIPE_SECRET_KEY_ENV, env);
  const webhookSecret = readTrimmedEnv(STRIPE_WEBHOOK_SECRET_ENV, env);

  if (!secretKey || !webhookSecret) {
    return {
      ready: false,
      reason: STRIPE_NOT_CONFIGURED_REASON,
    };
  }

  const secret = evaluateStripeSecretKey(secretKey, stripeDeployment(env));
  if (!secret.ok) {
    return {
      ready: false,
      reason: secret.reason,
    };
  }

  if (!isStripeWebhookSecret(webhookSecret)) {
    return {
      ready: false,
      reason: STRIPE_WEBHOOK_MALFORMED_REASON,
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
