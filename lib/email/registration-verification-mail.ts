import "server-only";

import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { escapeHtml } from "@/lib/email/html-escape";

export function registrationVerificationSubject(): string {
  return `Confirm your ${PRODUCT_NAME} registration`;
}

export function composeRegistrationVerificationEmail(input: {
  practiceName: string;
  verificationUrl: string;
  replyTo?: string;
}): { subject: string; text: string; html: string } {
  const productName = PRODUCT_NAME;
  const practice = input.practiceName.trim();
  const paragraphs = [
    `Confirm your email for ${productName}`,
    `We received a request to register ${practice} on ${productName}.`,
    "This link expires in 24 hours. Opening it confirms this email address and creates the clinic. It does not start a subscription or a charge:",
    input.verificationUrl,
    "If you ask for another verification email, this link stops working.",
    `If you didn't ask to register ${practice}, you can ignore this email.`,
    input.replyTo ? "If you need help, reply to this email." : null,
  ].filter((line): line is string => Boolean(line));

  const html = [
    `<p>We received a request to register ${escapeHtml(practice)} on ${escapeHtml(productName)}.</p>`,
    "<p>This link expires in 24 hours. Opening it confirms this email address and creates the clinic. It does not start a subscription or a charge:</p>",
    `<p><a href="${escapeHtml(input.verificationUrl)}">Confirm your email</a></p>`,
    "<p>If you ask for another verification email, this link stops working.</p>",
    `<p>If you didn't ask to register ${escapeHtml(practice)}, you can ignore this email.</p>`,
    input.replyTo ? "<p>If you need help, reply to this email.</p>" : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    subject: registrationVerificationSubject(),
    text: paragraphs.join("\n\n"),
    html,
  };
}
