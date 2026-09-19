import "server-only";

import {
  EMAIL_PATTERN,
  parseEmailAddress,
  parseMailboxAddress,
} from "@/lib/email/mailbox";
import {
  RESEND_API_KEY_ENV,
  getResendApiKey,
} from "@/lib/email/resend-api-key";
import { TURNSTILE_DUMMY_PASS_SITE_KEY } from "@/lib/marketing/contact-turnstile-public";
import { isVercelProduction } from "@/lib/runtime/vercel-production";
import { parseHostname } from "@/lib/tenancy/parse-hostname";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export const CONTACT_EMAIL_TO_ENV = "CONTACT_EMAIL_TO";
export const CONTACT_EMAIL_FROM_ENV = "CONTACT_EMAIL_FROM";
export const CONTACT_MAILER_ENV = "CONTACT_MAILER";
export { RESEND_API_KEY_ENV, getResendApiKey };
export const TURNSTILE_SITE_KEY_ENV = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
export { EMAIL_PATTERN, parseEmailAddress, parseMailboxAddress };
export { isVercelProduction };

/** @deprecated Prefer CONTACT_EMAIL_TO. Local fallback only. */
export const MARKETING_CONTACT_TO_EMAIL_ENV = "MARKETING_CONTACT_TO_EMAIL";
/** @deprecated Prefer CONTACT_EMAIL_FROM. Local fallback only. */
export const MARKETING_CONTACT_FROM_EMAIL_ENV = "MARKETING_CONTACT_FROM_EMAIL";
/** @deprecated Prefer CONTACT_EMAIL_TO. Kept as a local fallback. */
export const MARKETING_CONTACT_EMAIL_ENV = "MARKETING_CONTACT_EMAIL";
/** @deprecated Prefer CONTACT_MAILER. Local fallback only. */
export const MARKETING_CONTACT_MAILER_ENV = "MARKETING_CONTACT_MAILER";

type Env = Record<string, string | undefined>;

export type MarketingMailerKind = "resend" | "memory";

export type MarketingContactDeliveryConfig =
  | {
      ready: true;
      kind: "memory";
      toEmail: string;
      fromEmail: string;
    }
  | {
      ready: true;
      kind: "resend";
      toEmail: string;
      fromEmail: string;
      apiKey: string;
    }
  | {
      ready: false;
      kind: MarketingMailerKind;
      reason: string;
    };

export function getMarketingContactToEmail(
  env: Env = process.env
): string | null {
  return (
    parseEmailAddress(env[CONTACT_EMAIL_TO_ENV]) ??
    parseEmailAddress(env[MARKETING_CONTACT_TO_EMAIL_ENV]) ??
    parseEmailAddress(env[MARKETING_CONTACT_EMAIL_ENV])
  );
}

export function getMarketingContactFromEmail(
  env: Env = process.env
): string | null {
  return (
    parseMailboxAddress(env[CONTACT_EMAIL_FROM_ENV]) ??
    parseMailboxAddress(env[MARKETING_CONTACT_FROM_EMAIL_ENV])
  );
}

export function getTurnstileSiteKey(env: Env = process.env): string {
  const configured = env[TURNSTILE_SITE_KEY_ENV]?.trim() ?? "";
  if (configured) {
    return configured;
  }

  if (isVercelProduction(env)) {
    return "";
  }

  return TURNSTILE_DUMMY_PASS_SITE_KEY;
}

export function getMarketingMailerKind(
  env: Env = process.env
): MarketingMailerKind {
  if (isVercelProduction(env)) {
    return "resend";
  }

  const value =
    env[CONTACT_MAILER_ENV]?.trim() ||
    env[MARKETING_CONTACT_MAILER_ENV]?.trim();
  return value === "memory" ? "memory" : "resend";
}

export function getMarketingContactDeliveryConfig(
  env: Env = process.env
): MarketingContactDeliveryConfig {
  const kind = getMarketingMailerKind(env);
  const toEmail = getMarketingContactToEmail(env);
  const fromEmail = getMarketingContactFromEmail(env);

  if (!toEmail || !fromEmail) {
    return {
      ready: false,
      kind,
      reason: "Clinic enquiry delivery is not configured.",
    };
  }

  if (kind === "memory") {
    return {
      ready: true,
      kind: "memory",
      toEmail,
      fromEmail,
    };
  }

  const apiKey = getResendApiKey(env);
  if (!apiKey) {
    return {
      ready: false,
      kind: "resend",
      reason: "Clinic enquiry delivery is not configured.",
    };
  }

  return {
    ready: true,
    kind: "resend",
    toEmail,
    fromEmail,
    apiKey,
  };
}

export function isMarketingContactHost(
  hostHeader: string | null | undefined
): boolean {
  try {
    return parseHostname(hostHeader, getRootDomain()).kind === "marketing";
  } catch {
    return false;
  }
}
