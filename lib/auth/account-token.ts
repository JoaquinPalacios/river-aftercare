import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";

export const ACCOUNT_TOKEN_BYTE_LENGTH = 32;
export const ACCOUNT_TOKEN_ENTROPY_BITS = ACCOUNT_TOKEN_BYTE_LENGTH * 8;
export const ACCOUNT_TOKEN_HASH_ALGORITHM = "sha256";
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
export const PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES = 10;
export const INVITATION_TOKEN_TTL_DAYS = 7;
export const EMAIL_CHANGE_TOKEN_TTL_MINUTES = 30;

const MINUTES_IN_MS = 60 * 1000;
const DAYS_IN_MS = 24 * 60 * MINUTES_IN_MS;

export function generateAccountToken(): string {
  return randomBytes(ACCOUNT_TOKEN_BYTE_LENGTH).toString("base64url");
}

export function hashAccountToken(rawToken: string): string {
  if (typeof rawToken !== "string" || rawToken.length === 0) {
    throw new Error("Account token is required.");
  }
  if (!isWellFormedRawAccountToken(rawToken)) {
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

export function emailChangeExpiresAt(now: Date): Date {
  return new Date(
    now.getTime() + EMAIL_CHANGE_TOKEN_TTL_MINUTES * MINUTES_IN_MS
  );
}

export function passwordResetCooldownSince(now: Date): Date {
  return new Date(
    now.getTime() - PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES * MINUTES_IN_MS
  );
}
