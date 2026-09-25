import { PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";

export const NEW_PASSWORD_MIN_LENGTH = 12;
export const NEW_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;

export const NEW_PASSWORD_MIN_MESSAGE = `Use at least ${NEW_PASSWORD_MIN_LENGTH} characters.`;
export const NEW_PASSWORD_MAX_MESSAGE = `Password must be ${NEW_PASSWORD_MAX_LENGTH} characters or fewer.`;
export const PASSWORDS_DO_NOT_MATCH_MESSAGE = "Passwords do not match.";
export const CURRENT_PASSWORD_INCORRECT_MESSAGE =
  "Current password is incorrect.";
export const CURRENT_PASSWORD_REQUIRED_MESSAGE = "Enter your current password.";
export const CURRENT_PASSWORD_TOO_LONG_MESSAGE = "Password is too long.";
export const PASSWORD_UPDATED_MESSAGE = "Password updated.";
export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Your password has been reset. Sign in with your new password.";
export const PASSWORD_RESET_INVALID_LINK_MESSAGE =
  "This password reset link is invalid or has expired.";
export const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "If an account exists for that email, we've sent password reset instructions.";
export const INVITATION_INVALID_LINK_MESSAGE =
  "This invitation is invalid or has expired.";
export const INVITATION_INVALID_LINK_GUIDANCE =
  "Contact your clinic administrator or River Aftercare for a new invitation.";
export const INVITATION_READY_MESSAGE =
  "Your account is ready. Sign in with your new password.";

export function newPasswordPolicyError(password: string): string | null {
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    return NEW_PASSWORD_MIN_MESSAGE;
  }
  if (password.length > NEW_PASSWORD_MAX_LENGTH) {
    return NEW_PASSWORD_MAX_MESSAGE;
  }
  return null;
}

export function confirmNewPasswordError(
  password: string,
  confirmation: string
): string | null {
  const policyError = newPasswordPolicyError(password);
  if (policyError) {
    return policyError;
  }
  if (password !== confirmation) {
    return PASSWORDS_DO_NOT_MATCH_MESSAGE;
  }
  return null;
}

export type NewPasswordFieldErrors = {
  newPassword?: string;
  confirmPassword?: string;
};

/** Field placement matches `resetPasswordSchema` / `acceptInvitationSchema`. */
export function newPasswordFieldErrors(
  newPassword: string,
  confirmPassword: string
): NewPasswordFieldErrors {
  const errors: NewPasswordFieldErrors = {};
  const policyError = newPasswordPolicyError(newPassword);
  if (policyError) {
    errors.newPassword = policyError;
  }
  if (newPassword !== confirmPassword) {
    errors.confirmPassword = PASSWORDS_DO_NOT_MATCH_MESSAGE;
  }
  return errors;
}
