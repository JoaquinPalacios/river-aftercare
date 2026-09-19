import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const scryptSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  scryptSyncMock.mockImplementation(((
    password: string,
    salt: string,
    keylen: number
  ) => actual.scryptSync(password, salt, keylen)) as typeof actual.scryptSync);

  return {
    ...actual,
    scryptSync: scryptSyncMock,
  };
});

import { PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("password helper", () => {
  beforeEach(() => {
    scryptSyncMock.mockClear();
  });

  it("hashes and verifies with the existing scrypt format", () => {
    const hash = hashPassword("CareGuideDemo123!");

    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword("CareGuideDemo123!", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
    expect(hash).not.toContain("CareGuideDemo123!");
    expect(scryptSyncMock).toHaveBeenCalled();
  });

  it("fails safely for missing or malformed hashes without throwing", () => {
    expect(verifyPassword("password", null)).toBe(false);
    expect(verifyPassword("password", undefined)).toBe(false);
    expect(verifyPassword("password", "")).toBe(false);
    expect(verifyPassword("password", "bcrypt:salt:hash")).toBe(false);
    expect(verifyPassword("password", "scrypt:only-salt")).toBe(false);
    expect(verifyPassword("password", "not-a-hash")).toBe(false);
  });

  it("rejects oversized passwords in verifyPassword without scrypt", () => {
    const hash = hashPassword("ok");
    scryptSyncMock.mockClear();

    expect(verifyPassword("p".repeat(PASSWORD_MAX_LENGTH + 1), hash)).toBe(
      false
    );
    expect(verifyPassword("p".repeat(100_000), hash)).toBe(false);
    expect(scryptSyncMock).not.toHaveBeenCalled();
  });

  it("still verifies a 256-character password", () => {
    const password = "p".repeat(PASSWORD_MAX_LENGTH);
    const hash = hashPassword(password);
    scryptSyncMock.mockClear();

    expect(verifyPassword(password, hash)).toBe(true);
    expect(scryptSyncMock).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized passwords in hashPassword without scrypt", () => {
    scryptSyncMock.mockClear();

    expect(() => hashPassword("p".repeat(PASSWORD_MAX_LENGTH + 1))).toThrow(
      "resource-safety limit"
    );
    expect(scryptSyncMock).not.toHaveBeenCalled();
  });

  it("keeps the dummy hash in the current scrypt format and never treats it as a secret env value", () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword("any-login-attempt", DUMMY_PASSWORD_HASH)).toBe(
      false
    );
    expect(scryptSyncMock).toHaveBeenCalledTimes(1);

    const source = readFileSync("lib/auth/password.ts", "utf8");
    expect(source).not.toContain("process.env");
    expect(source).toContain("not a secret");
  });

  it("does not change scrypt parameters", () => {
    const source = readFileSync("lib/auth/password.ts", "utf8");
    expect(source).toContain('const SCRYPT_PREFIX = "scrypt"');
    expect(source).toContain("const SCRYPT_KEY_LENGTH = 64");
    expect(source).toContain("randomBytes(16)");
    expect(source).toContain("timingSafeEqual");
  });
});
