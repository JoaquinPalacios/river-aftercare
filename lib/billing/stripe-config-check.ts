import "server-only";

import {
  STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV,
  STRIPE_ESSENTIAL_MONTHLY_PRICE_ID_ENV,
  STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV,
  STRIPE_GROUP_MONTHLY_PRICE_ID_ENV,
  STRIPE_GROUP_YEARLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV,
  STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV,
  STRIPE_SECRET_KEY_ENV,
  STRIPE_WEBHOOK_SECRET_ENV,
  readTrimmedEnv,
  type Env,
} from "@/lib/billing/env";
import { inspectStripeCatalogue } from "@/lib/billing/price-map";
import {
  evaluateStripeSecretKey,
  isStripePortalConfigurationId,
  isStripePriceId,
  isStripeWebhookSecret,
  stripeDeployment,
  type StripeDeployment,
} from "@/lib/billing/stripe-mode";

const CATALOGUE_LABELS: Record<string, string> = {
  [STRIPE_ESSENTIAL_MONTHLY_PRICE_ID_ENV]: "Essential monthly",
  [STRIPE_ESSENTIAL_YEARLY_PRICE_ID_ENV]: "Essential yearly",
  [STRIPE_PRACTICE_MONTHLY_PRICE_ID_ENV]: "Practice monthly",
  [STRIPE_PRACTICE_YEARLY_PRICE_ID_ENV]: "Practice yearly",
  [STRIPE_PRACTICE_ADDITIONAL_LOCATION_MONTHLY_PRICE_ID_ENV]:
    "Practice additional location monthly",
  [STRIPE_PRACTICE_ADDITIONAL_LOCATION_YEARLY_PRICE_ID_ENV]:
    "Practice additional location yearly",
  [STRIPE_GROUP_MONTHLY_PRICE_ID_ENV]: "Group monthly",
  [STRIPE_GROUP_YEARLY_PRICE_ID_ENV]: "Group yearly",
  [STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID_ENV]:
    "Group additional site monthly",
  [STRIPE_GROUP_ADDITIONAL_SITE_YEARLY_PRICE_ID_ENV]:
    "Group additional site yearly",
};

export type StripeConfigAssessment = {
  ok: boolean;
  deployment: StripeDeployment;
  lines: string[];
  failures: string[];
};

function credentialPairRequired(
  deployment: StripeDeployment,
  anyBillingValue: boolean
): boolean {
  return deployment !== "local" || anyBillingValue;
}

export function assessStripeConfiguration(
  env: Env = process.env
): StripeConfigAssessment {
  const deployment = stripeDeployment(env);
  const remote = deployment !== "local";
  const secretKey = readTrimmedEnv(STRIPE_SECRET_KEY_ENV, env);
  const webhookSecret = readTrimmedEnv(STRIPE_WEBHOOK_SECRET_ENV, env);
  const portalId = readTrimmedEnv(
    STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV,
    env
  );
  const catalogue = inspectStripeCatalogue(env);
  const anyPrice = catalogue.slots.some((slot) => slot.priceId);
  const anyBillingValue = Boolean(
    secretKey || webhookSecret || portalId || anyPrice
  );
  const credentialsRequired = credentialPairRequired(
    deployment,
    anyBillingValue
  );
  const portalRequired = remote;
  const catalogueRequired = remote;

  const failures: string[] = [];
  const lines: string[] = [`Stripe deployment: ${deployment}`];

  let modeLine = "Stripe mode: not configured";
  let secretLine = `${STRIPE_SECRET_KEY_ENV}: not configured`;
  if (!secretKey) {
    if (credentialsRequired) {
      secretLine = `${STRIPE_SECRET_KEY_ENV}: missing`;
      failures.push(`${STRIPE_SECRET_KEY_ENV} is required.`);
    }
  } else {
    const decision = evaluateStripeSecretKey(secretKey, deployment);
    if (!decision.ok) {
      modeLine = "Stripe mode: rejected";
      secretLine = `${STRIPE_SECRET_KEY_ENV}: rejected`;
      failures.push(decision.reason);
    } else {
      modeLine = `Stripe mode: ${decision.mode}`;
      secretLine = `${STRIPE_SECRET_KEY_ENV}: configured (${decision.mode})`;
    }
  }
  lines.push(modeLine, secretLine);

  if (!webhookSecret) {
    lines.push(
      `${STRIPE_WEBHOOK_SECRET_ENV}: ${credentialsRequired ? "missing" : "not configured"}`
    );
    if (credentialsRequired) {
      failures.push(`${STRIPE_WEBHOOK_SECRET_ENV} is required.`);
    }
  } else if (!isStripeWebhookSecret(webhookSecret)) {
    lines.push(`${STRIPE_WEBHOOK_SECRET_ENV}: rejected`);
    failures.push("Stripe webhook secret is malformed.");
  } else {
    lines.push(`${STRIPE_WEBHOOK_SECRET_ENV}: configured`);
  }

  if (!portalId) {
    lines.push(
      `${STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV}: ${portalRequired ? "missing" : "not configured"}`
    );
    if (portalRequired) {
      failures.push(
        `${STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV} is required.`
      );
    }
  } else if (!isStripePortalConfigurationId(portalId)) {
    lines.push(`${STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV}: rejected`);
    failures.push("Customer Portal configuration id must be a bpc_ id.");
  } else {
    lines.push(`${STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID_ENV}: configured`);
  }

  for (const slot of catalogue.slots) {
    const label = CATALOGUE_LABELS[slot.envKey] ?? slot.envKey;
    if (!slot.priceId) {
      lines.push(
        `${label}: ${catalogueRequired ? "missing" : "not configured"}`
      );
      if (catalogueRequired) {
        failures.push(`${label} is required in ${deployment}.`);
      }
      continue;
    }
    if (!isStripePriceId(slot.priceId)) {
      lines.push(`${label}: rejected`);
      failures.push(`${label} must be a price_ id.`);
      continue;
    }
    lines.push(`${label}: configured`);
  }

  lines.push(`Catalogue unique: ${catalogue.duplicate ? "no" : "yes"}`);
  if (catalogue.duplicate) {
    failures.push(
      "Stripe Price IDs must be unique across every configured base plan and add-on price."
    );
  }

  const ok = failures.length === 0;
  lines.push(`Stripe configuration: ${ok ? "ok" : "failed"}`);
  for (const failure of failures) {
    lines.push(`Failure: ${failure}`);
  }
  return { ok, deployment, lines, failures };
}

export function formatStripeConfigReport(
  assessment: StripeConfigAssessment
): string {
  return `${assessment.lines.join("\n")}\n`;
}

export function runStripeConfigCheck(env: Env = process.env): {
  exitCode: number;
  report: string;
} {
  const assessment = assessStripeConfiguration(env);
  return {
    exitCode: assessment.ok ? 0 : 1,
    report: formatStripeConfigReport(assessment),
  };
}
