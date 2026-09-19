import "server-only";

import { PASSWORD_RESET_TOKEN_TTL_MINUTES } from "@/lib/auth/account-token";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { escapeHtml } from "@/lib/email/html-escape";

export const PASSWORD_RESET_EMAIL_SUBJECT = `Reset your ${PRODUCT_NAME} password`;

export function composePasswordResetEmail(input: {
  resetUrl: string;
  replyTo?: string;
}): { subject: string; text: string; html: string } {
  const productName = PRODUCT_NAME;
  const minutes = String(PASSWORD_RESET_TOKEN_TTL_MINUTES);
  const paragraphs = [
    `Reset your ${productName} password`,
    `We received a request to reset the password for this ${productName} account.`,
    `This link expires in ${minutes} minutes and can only be used once:`,
    input.resetUrl,
    "If you didn't request this, you can ignore this email.",
    input.replyTo ? "If you need help, reply to this email." : null,
  ].filter((line): line is string => Boolean(line));

  const html = [
    `<p>We received a request to reset the password for this ${escapeHtml(productName)} account.</p>`,
    `<p>This link expires in ${escapeHtml(minutes)} minutes and can only be used once:</p>`,
    `<p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>`,
    `<p>If you didn't request this, you can ignore this email.</p>`,
    input.replyTo ? "<p>If you need help, reply to this email.</p>" : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    text: paragraphs.join("\n\n"),
    html,
  };
}
