import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";

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
