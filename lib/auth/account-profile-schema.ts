import "server-only";

import { z } from "zod";

import {
  EMAIL_CHANGE_CONFIRMED_MESSAGE,
  EMAIL_CHANGE_INVALID_LINK_GUIDANCE,
  EMAIL_CHANGE_INVALID_LINK_MESSAGE,
  EMAIL_VERIFICATION_SENT_MESSAGE,
  PROFILE_CURRENT_PASSWORD_HINT,
  PROFILE_EMAIL_INVALID_MESSAGE,
  PROFILE_EMAIL_MAX_MESSAGE,
  PROFILE_EMAIL_REQUIRED_MESSAGE,
  PROFILE_EMAIL_TAKEN_MESSAGE,
  PROFILE_NAME_HTML_MESSAGE,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_NAME_MAX_MESSAGE,
  PROFILE_NAME_REQUIRED_MESSAGE,
  PROFILE_UPDATED_MESSAGE,
} from "@/lib/auth/account-profile-fields";
import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
} from "@/lib/auth/login-input";
import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CURRENT_PASSWORD_TOO_LONG_MESSAGE,
} from "@/lib/auth/password-policy";

export {
  EMAIL_CHANGE_CONFIRMED_MESSAGE,
  EMAIL_CHANGE_INVALID_LINK_GUIDANCE,
  EMAIL_CHANGE_INVALID_LINK_MESSAGE,
  EMAIL_VERIFICATION_SENT_MESSAGE,
  PROFILE_CURRENT_PASSWORD_HINT,
  PROFILE_EMAIL_INVALID_MESSAGE,
  PROFILE_EMAIL_MAX_MESSAGE,
  PROFILE_EMAIL_REQUIRED_MESSAGE,
  PROFILE_EMAIL_TAKEN_MESSAGE,
  PROFILE_NAME_HTML_MESSAGE,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_NAME_MAX_MESSAGE,
  PROFILE_NAME_REQUIRED_MESSAGE,
  PROFILE_UPDATED_MESSAGE,
};

export { CURRENT_PASSWORD_REQUIRED_MESSAGE };

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
