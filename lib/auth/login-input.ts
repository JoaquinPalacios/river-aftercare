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

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}
