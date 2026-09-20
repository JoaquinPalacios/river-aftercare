import { z } from "zod";

import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
} from "@/lib/auth/login-input";
import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CURRENT_PASSWORD_TOO_LONG_MESSAGE,
} from "@/lib/auth/password-policy";

export const PROFILE_NAME_MAX_LENGTH = 80;
export const PROFILE_NAME_REQUIRED_MESSAGE = "Enter your name.";
export const PROFILE_NAME_MAX_MESSAGE = `Name must be ${PROFILE_NAME_MAX_LENGTH} characters or fewer.`;
export const PROFILE_NAME_HTML_MESSAGE = "Name cannot include HTML.";
export const PROFILE_EMAIL_REQUIRED_MESSAGE = "Enter an email address.";
export const PROFILE_EMAIL_INVALID_MESSAGE = "Enter a valid email address.";
export const PROFILE_EMAIL_MAX_MESSAGE = `Email must be ${LOGIN_EMAIL_MAX_LENGTH} characters or fewer.`;
export const PROFILE_EMAIL_TAKEN_MESSAGE = "That email is already in use.";
export const PROFILE_UPDATED_MESSAGE = "Profile updated.";
export const EMAIL_VERIFICATION_SENT_MESSAGE =
  "Check the new address to confirm this change. Your current email stays active until then.";
export const EMAIL_CHANGE_CONFIRMED_MESSAGE =
  "Your email has been updated. Sign in with the new address.";
export const EMAIL_CHANGE_INVALID_LINK_MESSAGE =
  "This email confirmation link is invalid or has expired.";
export const EMAIL_CHANGE_INVALID_LINK_GUIDANCE =
  "Sign in and request a new email change from Account.";
export const PROFILE_CURRENT_PASSWORD_HINT =
  "Required only when you change your email.";

export const updateOwnProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  currentPassword: z
    .string()
    .max(LOGIN_PASSWORD_MAX_LENGTH, CURRENT_PASSWORD_TOO_LONG_MESSAGE),
});

export function normalizeProfileName(name: string): string | null {
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
  if (normalized.length > PROFILE_NAME_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

export function profileNameError(name: string): string | null {
  const trimmed = name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return PROFILE_NAME_REQUIRED_MESSAGE;
  }
  if (/[<>]/.test(trimmed)) {
    return PROFILE_NAME_HTML_MESSAGE;
  }
  if (trimmed.length > PROFILE_NAME_MAX_LENGTH) {
    return PROFILE_NAME_MAX_MESSAGE;
  }
  return null;
}

export function profileEmailError(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return PROFILE_EMAIL_REQUIRED_MESSAGE;
  }
  if (trimmed.length > LOGIN_EMAIL_MAX_LENGTH) {
    return PROFILE_EMAIL_MAX_MESSAGE;
  }
  return null;
}

export { CURRENT_PASSWORD_REQUIRED_MESSAGE };
