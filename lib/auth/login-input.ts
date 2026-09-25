/**
 * Login input bounds.
 *
 * `PASSWORD_MAX_LENGTH` is a resource-safety maximum so attacker-controlled
 * strings cannot be sent to scrypt. It is not a password-complexity policy.
 *
 * Login continues to accept any existing non-empty password up to this length.
 * The 12–256 set / change / reset policy lives in `password-policy.ts` and must
 * not be applied when verifying an existing current password or logging in.
 */
export const LOGIN_EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 256;
export const LOGIN_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;

export const LOGIN_EMAIL_REQUIRED_MESSAGE = "Enter your email address.";
export const LOGIN_EMAIL_INVALID_MESSAGE = "Enter a valid email address.";
export const LOGIN_EMAIL_TOO_LONG_MESSAGE = "Email address is too long.";
export const LOGIN_PASSWORD_REQUIRED_MESSAGE = "Enter your password.";
export const LOGIN_PASSWORD_TOO_LONG_MESSAGE = "Password is too long.";

/**
 * Same practical email check Zod applies with `.email()`.
 * Client forms use this pattern directly. Server schemas keep `.email()`.
 */
export const STAFF_EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export type LoginFormValues = {
  email: string;
  password: string;
};

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function staffEmailFieldError(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return LOGIN_EMAIL_REQUIRED_MESSAGE;
  }
  if (trimmed.length > LOGIN_EMAIL_MAX_LENGTH) {
    return LOGIN_EMAIL_TOO_LONG_MESSAGE;
  }
  if (!STAFF_EMAIL_PATTERN.test(trimmed)) {
    return LOGIN_EMAIL_INVALID_MESSAGE;
  }
  return null;
}

export function loginPasswordFieldError(password: string): string | null {
  if (password.length === 0) {
    return LOGIN_PASSWORD_REQUIRED_MESSAGE;
  }
  if (password.length > LOGIN_PASSWORD_MAX_LENGTH) {
    return LOGIN_PASSWORD_TOO_LONG_MESSAGE;
  }
  return null;
}

export function loginClientFieldErrors(values: LoginFormValues): {
  email?: string;
  password?: string;
} {
  const email = staffEmailFieldError(values.email) ?? undefined;
  const password = loginPasswordFieldError(values.password) ?? undefined;
  return { email, password };
}
