export const RAW_ACCOUNT_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
export const RAW_ACCOUNT_TOKEN_MAX_LENGTH = 128;
export const ACCOUNT_TOKEN_URL_KEY = "token";
export const PASSWORD_RESET_URL_TOKEN_KEY = ACCOUNT_TOKEN_URL_KEY;

export function isWellFormedRawAccountToken(rawToken: string): boolean {
  return (
    typeof rawToken === "string" &&
    rawToken.length > 0 &&
    rawToken.length <= RAW_ACCOUNT_TOKEN_MAX_LENGTH &&
    !/[\r\n\s]/.test(rawToken) &&
    RAW_ACCOUNT_TOKEN_PATTERN.test(rawToken)
  );
}

export function readAccountTokenFromHash(hash: string): string | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed || trimmed.startsWith("?")) {
    return null;
  }

  const params = new URLSearchParams(trimmed);
  const token = params.get(ACCOUNT_TOKEN_URL_KEY);
  if (!token || !isWellFormedRawAccountToken(token)) {
    return null;
  }
  return token;
}

export function readPasswordResetTokenFromHash(hash: string): string | null {
  return readAccountTokenFromHash(hash);
}
