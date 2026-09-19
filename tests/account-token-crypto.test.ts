import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TOKEN_BYTE_LENGTH,
  ACCOUNT_TOKEN_ENTROPY_BITS,
  ACCOUNT_TOKEN_HASH_ALGORITHM,
  generateAccountToken,
  hashAccountToken,
  invitationExpiresAt,
  INVITATION_TOKEN_TTL_DAYS,
  PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  passwordResetCooldownSince,
  passwordResetExpiresAt,
} from "@/lib/auth/account-token";

describe("account token crypto", () => {
  it("generates URL-safe 256-bit tokens that differ", () => {
    const first = generateAccountToken();
    const second = generateAccountToken();

    expect(ACCOUNT_TOKEN_BYTE_LENGTH).toBe(32);
    expect(ACCOUNT_TOKEN_ENTROPY_BITS).toBe(256);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(Buffer.from(second, "base64url")).toHaveLength(32);
  });

  it("hashes deterministically with SHA-256 hex and never equals the raw token", () => {
    const rawToken = generateAccountToken();
    const first = hashAccountToken(rawToken);
    const second = hashAccountToken(rawToken);
    const expected = createHash(ACCOUNT_TOKEN_HASH_ALGORITHM)
      .update(rawToken, "utf8")
      .digest("hex");

    expect(ACCOUNT_TOKEN_HASH_ALGORITHM).toBe("sha256");
    expect(first).toBe(second);
    expect(first).toBe(expected);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(rawToken);
    expect(first).not.toContain(rawToken);
  });

  it("rejects empty and malformed raw tokens", () => {
    expect(() => hashAccountToken("")).toThrow(/required/i);
    expect(() => hashAccountToken("abc def")).toThrow(/malformed/i);
    expect(() => hashAccountToken("abc\ndef")).toThrow(/malformed/i);
    expect(() => hashAccountToken("abc\rdef")).toThrow(/malformed/i);
    expect(() => hashAccountToken("+++not-url-safe+++")).toThrow(/malformed/i);
    expect(() => hashAccountToken("a".repeat(129))).toThrow(/malformed/i);
  });

  it("derives expiry from centralized TTL constants", () => {
    const now = new Date("2026-09-19T12:00:00.000Z");
    expect(PASSWORD_RESET_TOKEN_TTL_MINUTES).toBe(30);
    expect(INVITATION_TOKEN_TTL_DAYS).toBe(7);
    expect(passwordResetExpiresAt(now).toISOString()).toBe(
      "2026-09-19T12:30:00.000Z"
    );
    expect(invitationExpiresAt(now).toISOString()).toBe(
      "2026-09-26T12:00:00.000Z"
    );
    expect(PASSWORD_RESET_REQUEST_COOLDOWN_MINUTES).toBe(10);
    expect(passwordResetCooldownSince(now).toISOString()).toBe(
      "2026-09-19T11:50:00.000Z"
    );
  });
});
