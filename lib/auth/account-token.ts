import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const ACCOUNT_TOKEN_BYTE_LENGTH = 32;
export const ACCOUNT_TOKEN_ENTROPY_BITS = ACCOUNT_TOKEN_BYTE_LENGTH * 8;
export const ACCOUNT_TOKEN_HASH_ALGORITHM = "sha256";
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
export const INVITATION_TOKEN_TTL_DAYS = 7;

const MINUTES_IN_MS = 60 * 1000;
const DAYS_IN_MS = 24 * 60 * MINUTES_IN_MS;
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const RAW_TOKEN_MAX_LENGTH = 128;

export function generateAccountToken(): string {
  return randomBytes(ACCOUNT_TOKEN_BYTE_LENGTH).toString("base64url");
}

export function hashAccountToken(rawToken: string): string {
  if (typeof rawToken !== "string" || rawToken.length === 0) {
    throw new Error("Account token is required.");
  }
  if (
    rawToken.length > RAW_TOKEN_MAX_LENGTH ||
    /[\r\n\s]/.test(rawToken) ||
    !RAW_TOKEN_PATTERN.test(rawToken)
  ) {
    throw new Error("Account token is malformed.");
  }

  return createHash(ACCOUNT_TOKEN_HASH_ALGORITHM)
    .update(rawToken, "utf8")
    .digest("hex");
}

export function passwordResetExpiresAt(now: Date): Date {
  return new Date(
    now.getTime() + PASSWORD_RESET_TOKEN_TTL_MINUTES * MINUTES_IN_MS
  );
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TOKEN_TTL_DAYS * DAYS_IN_MS);
}
