/**
 * Login input bounds.
 *
 * `PASSWORD_MAX_LENGTH` is a resource-safety maximum so attacker-controlled
 * strings cannot be sent to scrypt. It is not a password-complexity policy.
 *
 * Login continues to accept any existing non-empty password up to this length.
 * The future set / change / reset policy (12–256) is a separate PR and must
 * not be applied to login.
 */
export const LOGIN_EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 256;
export const LOGIN_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}
