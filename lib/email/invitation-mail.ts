import "server-only";

import { INVITATION_TOKEN_TTL_DAYS } from "@/lib/auth/account-token";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { teamMembershipRoleLabel } from "@/lib/clinic-portal/role-labels";
import { escapeHtml } from "@/lib/email/html-escape";
import type { ClinicMembershipRole } from "@prisma/client";

export const INVITATION_EMAIL_SUBJECT = `Set up your ${PRODUCT_NAME} account`;

export function composeInvitationEmail(input: {
  invitationUrl: string;
  clinicName: string;
  role: ClinicMembershipRole;
  inviteeName?: string | null;
  replyTo?: string;
}): { subject: string; text: string; html: string } {
  const productName = PRODUCT_NAME;
  const days = String(INVITATION_TOKEN_TTL_DAYS);
  const roleLabel = teamMembershipRoleLabel(input.role);
  const greeting = input.inviteeName?.trim()
    ? `Hello ${input.inviteeName.trim()},`
    : "Hello,";
  const paragraphs = [
    greeting,
    `You've been invited to ${productName} for ${input.clinicName} as ${roleLabel}.`,
    `Create a password to finish setting up your account. You choose your own password — ${productName} will not send you one.`,
    `This one-time setup link expires in ${days} days:`,
    input.invitationUrl,
    `If you were not expecting this invitation, you can ignore this email or contact ${productName}.`,
    input.replyTo ? "If you need help, reply to this email." : null,
  ].filter((line): line is string => Boolean(line));

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>You've been invited to ${escapeHtml(productName)} for ${escapeHtml(input.clinicName)} as ${escapeHtml(roleLabel)}.</p>`,
    `<p>Create a password to finish setting up your account. You choose your own password — ${escapeHtml(productName)} will not send you one.</p>`,
    `<p>This one-time setup link expires in ${escapeHtml(days)} days:</p>`,
    `<p><a href="${escapeHtml(input.invitationUrl)}">Set up your account</a></p>`,
    `<p>If you were not expecting this invitation, you can ignore this email or contact ${escapeHtml(productName)}.</p>`,
    input.replyTo ? "<p>If you need help, reply to this email.</p>" : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    subject: INVITATION_EMAIL_SUBJECT,
    text: paragraphs.join("\n\n"),
    html,
  };
}
