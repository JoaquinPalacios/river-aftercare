import { z } from "zod";

import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";

export const INVITED_NAME_MAX_LENGTH = 80;
export const INVITED_NAME_REQUIRED_MESSAGE = "Enter the person's name.";
export const INVITED_NAME_MAX_MESSAGE = `Name must be ${INVITED_NAME_MAX_LENGTH} characters or fewer.`;
export const INVITED_NAME_HTML_MESSAGE = "Name cannot include HTML.";
export const INVITED_EMAIL_REQUIRED_MESSAGE = "Enter an email address.";
export const INVITED_EMAIL_INVALID_MESSAGE = "Enter a valid email address.";
export const INVITED_EMAIL_MAX_MESSAGE = `Email must be ${LOGIN_EMAIL_MAX_LENGTH} characters or fewer.`;
export const INVITED_ROLE_INVALID_MESSAGE = "Choose Administrator or Staff.";

export const CLINIC_MEMBERSHIP_ROLES = ["ADMIN", "STAFF"] as const;
export type InvitedClinicRole = (typeof CLINIC_MEMBERSHIP_ROLES)[number];

export const inviteClinicUserFormSchema = z.object({
  name: z.string(),
  email: z.string(),
  role: z.enum(CLINIC_MEMBERSHIP_ROLES),
});

export function normalizeInvitedName(name: string): string | null {
  const normalized = name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  if (/[<>]/.test(normalized)) {
    return null;
  }
  if (normalized.length > INVITED_NAME_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

export function invitedNameError(name: string): string | null {
  const trimmed = name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return INVITED_NAME_REQUIRED_MESSAGE;
  }
  if (/[<>]/.test(trimmed)) {
    return INVITED_NAME_HTML_MESSAGE;
  }
  if (trimmed.length > INVITED_NAME_MAX_LENGTH) {
    return INVITED_NAME_MAX_MESSAGE;
  }
  return null;
}
