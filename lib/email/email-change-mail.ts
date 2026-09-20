import "server-only";

import { EMAIL_CHANGE_TOKEN_TTL_MINUTES } from "@/lib/auth/account-token";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { escapeHtml } from "@/lib/email/html-escape";

export const EMAIL_CHANGE_EMAIL_SUBJECT = `Confirm your new ${PRODUCT_NAME} email`;

export function composeEmailChangeEmail(input: {
  confirmUrl: string;
  replyTo?: string;
}): { subject: string; text: string; html: string } {
  const productName = PRODUCT_NAME;
  const minutes = String(EMAIL_CHANGE_TOKEN_TTL_MINUTES);
  const paragraphs = [
    `Confirm your new ${productName} email`,
    `We received a request to use this address for a ${productName} account.`,
    `This link expires in ${minutes} minutes and can only be used once:`,
    input.confirmUrl,
    "If you didn't request this, you can ignore this email. Your current sign-in email will stay the same.",
    input.replyTo ? "If you need help, reply to this email." : null,
  ].filter((line): line is string => Boolean(line));

  const html = [
    `<p>We received a request to use this address for a ${escapeHtml(productName)} account.</p>`,
    `<p>This link expires in ${escapeHtml(minutes)} minutes and can only be used once:</p>`,
    `<p><a href="${escapeHtml(input.confirmUrl)}">Confirm your email</a></p>`,
    "<p>If you didn't request this, you can ignore this email. Your current sign-in email will stay the same.</p>",
    input.replyTo ? "<p>If you need help, reply to this email.</p>" : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    subject: EMAIL_CHANGE_EMAIL_SUBJECT,
    text: paragraphs.join("\n\n"),
    html,
  };
}
