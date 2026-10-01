import "server-only";

import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { escapeHtml } from "@/lib/email/html-escape";
import {
  getAuthEmailDeliveryConfig,
  type AuthEmailDeliveryConfig,
} from "@/lib/email/auth-email";

type Env = Record<string, string | undefined>;

export type BillingNoticeMailConfig =
  | {
      ready: true;
      from: string;
      replyTo: string;
      transport: Extract<AuthEmailDeliveryConfig, { ready: true }>["transport"];
    }
  | { ready: false; reason: "not_configured" };

export function getBillingNoticeMailConfig(
  env: Env = process.env
): BillingNoticeMailConfig {
  const auth = getAuthEmailDeliveryConfig(env);
  if (!auth.ready || !auth.replyTo) {
    return { ready: false, reason: "not_configured" };
  }
  return {
    ready: true,
    from: auth.from,
    replyTo: auth.replyTo,
    transport: auth.transport,
  };
}

function paragraphsToHtml(lines: readonly string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function linkedParagraph(label: string, href: string): string {
  return `<p><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></p>`;
}

export function composeAnnualRenewalEmail(input: {
  planLabel: string;
  renewalLabel: string;
  intervalLabel: string;
  amountLabel: string | null;
  billingUrl: string;
  contactUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `Your ${PRODUCT_NAME} subscription renews on ${input.renewalLabel}`;
  const lines = [
    "Hello,",
    `Your ${input.planLabel} subscription renews on ${input.renewalLabel}.`,
    `Billing interval: ${input.intervalLabel}.`,
    input.amountLabel
      ? `The expected renewal amount is ${input.amountLabel}.`
      : null,
    "You can review your billing details or cancel before the renewal date:",
    input.billingUrl,
    "Cancellation takes effect at the end of the current paid period. There is no cancellation fee.",
    "If you need help, reply to this email or contact River Aftercare:",
    input.contactUrl,
  ].filter((line): line is string => Boolean(line));

  const html = [
    paragraphsToHtml(
      [
        "Hello,",
        `Your ${input.planLabel} subscription renews on ${input.renewalLabel}.`,
        `Billing interval: ${input.intervalLabel}.`,
        input.amountLabel
          ? `The expected renewal amount is ${input.amountLabel}.`
          : "",
        "You can review your billing details or cancel before the renewal date.",
      ].filter(Boolean)
    ),
    linkedParagraph("View billing", input.billingUrl),
    paragraphsToHtml([
      "Cancellation takes effect at the end of the current paid period. There is no cancellation fee.",
      "If you need help, reply to this email or contact River Aftercare.",
    ]),
    linkedParagraph("Contact River Aftercare", input.contactUrl),
  ].join("");

  return { subject, text: lines.join("\n\n"), html };
}

export function composePriceIncreaseEmail(input: {
  phase: "initial" | "reminder";
  affectedLabel: string;
  currentPriceLabel: string;
  newPriceLabel: string;
  effectiveLabel: string;
  intervalLabel: string;
  billingUrl: string;
  contactUrl: string;
}): { subject: string; text: string; html: string } {
  const subject =
    input.phase === "reminder"
      ? `Reminder: your ${PRODUCT_NAME} price changes on ${input.effectiveLabel}`
      : `Your ${PRODUCT_NAME} price will change on ${input.effectiveLabel}`;
  const intro =
    input.phase === "reminder"
      ? `This is a reminder that your ${input.affectedLabel} subscription price will change on ${input.effectiveLabel}.`
      : `Your ${input.affectedLabel} subscription price will change on ${input.effectiveLabel}.`;
  const lines = [
    "Hello,",
    intro,
    `Current price: ${input.currentPriceLabel}.`,
    `New price: ${input.newPriceLabel}.`,
    `Billing interval: ${input.intervalLabel}.`,
    `The new price applies on ${input.effectiveLabel}. It does not apply before that date.`,
    "You can cancel before the new price takes effect. There is no cancellation penalty:",
    input.billingUrl,
    "If you need help, reply to this email or contact River Aftercare:",
    input.contactUrl,
  ];
  const html = [
    paragraphsToHtml([
      "Hello,",
      intro,
      `Current price: ${input.currentPriceLabel}.`,
      `New price: ${input.newPriceLabel}.`,
      `Billing interval: ${input.intervalLabel}.`,
      `The new price applies on ${input.effectiveLabel}. It does not apply before that date.`,
      "You can cancel before the new price takes effect. There is no cancellation penalty.",
    ]),
    linkedParagraph("View billing", input.billingUrl),
    paragraphsToHtml([
      "If you need help, reply to this email or contact River Aftercare.",
    ]),
    linkedParagraph("Contact River Aftercare", input.contactUrl),
  ].join("");
  return { subject, text: lines.join("\n\n"), html };
}
