import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());
const logMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/account-token-service", () => ({
  completePasswordReset: completeMock,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/auth/password-lifecycle-log", () => ({
  logPasswordLifecycle: logMock,
}));

import { resetPasswordWithToken } from "@/lib/auth/reset-password";
import {
  NEW_PASSWORD_MAX_MESSAGE,
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORDS_DO_NOT_MATCH_MESSAGE,
} from "@/lib/auth/password-policy";

describe("resetPasswordWithToken", () => {
  beforeEach(() => {
    completeMock.mockReset();
    hashPasswordMock.mockReset();
    logMock.mockReset();
  });

  it("rejects 11-character passwords before hashing", async () => {
    const result = await resetPasswordWithToken({
      rawToken: "token",
      newPassword: "abcdefghijk",
      confirmPassword: "abcdefghijk",
    });
    expect(result).toMatchObject({
      ok: false,
      error: NEW_PASSWORD_MIN_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("rejects 257-character passwords before hashing", async () => {
    const result = await resetPasswordWithToken({
      rawToken: "token",
      newPassword: "p".repeat(257),
      confirmPassword: "p".repeat(257),
    });
    expect(result).toMatchObject({
      ok: false,
      error: NEW_PASSWORD_MAX_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("accepts 12 and 256 character passwords", async () => {
    completeMock.mockResolvedValue({
      ok: true,
      userId: "user_1",
      tokenId: "tok_1",
    });
    hashPasswordMock.mockReturnValue("new-hash");

    await expect(
      resetPasswordWithToken({
        rawToken: "token",
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkl",
      })
    ).resolves.toEqual({ ok: true });

    const long = "p".repeat(256);
    await resetPasswordWithToken({
      rawToken: "token",
      newPassword: long,
      confirmPassword: long,
    });
    expect(hashPasswordMock).toHaveBeenCalledWith("abcdefghijkl");
    expect(hashPasswordMock).toHaveBeenCalledWith(long);
  });

  it("rejects confirmation mismatch", async () => {
    const result = await resetPasswordWithToken({
      rawToken: "token",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkm",
    });
    expect(result).toMatchObject({
      ok: false,
      error: PASSWORDS_DO_NOT_MATCH_MESSAGE,
    });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("maps invalid tokens generically and does not auto-login", async () => {
    hashPasswordMock.mockReturnValue("new-hash");
    completeMock.mockResolvedValue({ ok: false, reason: "expired" });
    const result = await resetPasswordWithToken({
      rawToken: "token",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_token");
    }
    expect(logMock).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens before hashing", async () => {
    const result = await resetPasswordWithToken({
      rawToken: "not a token",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_token");
    }
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });
});
