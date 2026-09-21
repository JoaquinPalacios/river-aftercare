import "server-only";

import Stripe from "stripe";

import { getStripeClientConfig } from "@/lib/billing/stripe-client";
import type { Env } from "@/lib/billing/env";

export type StripeWebhookVerificationResult =
  | { ok: true; event: Stripe.Event }
  | {
      ok: false;
      status: 400 | 500;
      reason: "not_configured" | "missing" | "invalid" | "malformed";
      error: string;
    };

export async function verifyStripeWebhookEvent(
  payload: string,
  signature: string | null,
  env: Env = process.env
): Promise<StripeWebhookVerificationResult> {
  const config = getStripeClientConfig(env);
  if (!config.ready) {
    return {
      ok: false,
      status: 500,
      reason: "not_configured",
      error: "Stripe webhook is not configured.",
    };
  }

  if (!payload) {
    return {
      ok: false,
      status: 400,
      reason: "malformed",
      error: "Malformed Stripe webhook payload.",
    };
  }

  if (!signature) {
    return {
      ok: false,
      status: 400,
      reason: "missing",
      error: "Missing Stripe signature.",
    };
  }

  try {
    const stripe = new Stripe(config.secretKey);
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      config.webhookSecret
    );
    return { ok: true, event };
  } catch {
    return {
      ok: false,
      status: 400,
      reason: "invalid",
      error: "Invalid Stripe signature.",
    };
  }
}
