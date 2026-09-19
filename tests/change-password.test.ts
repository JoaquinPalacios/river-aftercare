import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());
const createDatabaseSessionMock = vi.hoisted(() => vi.fn());
const deleteDatabaseSessionsForUserMock = vi.hoisted(() => vi.fn());
const logMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: findUniqueMock },
    $transaction: transactionMock,
  }),
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/auth/session", () => ({
  createDatabaseSession: createDatabaseSessionMock,
  deleteDatabaseSessionsForUser: deleteDatabaseSessionsForUserMock,
}));

vi.mock("@/lib/auth/password-lifecycle-log", () => ({
  logPasswordLifecycle: logMock,
}));

import { changeAuthenticatedUserPassword } from "@/lib/auth/change-password";
import {
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  NEW_PASSWORD_MAX_MESSAGE,
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORDS_DO_NOT_MATCH_MESSAGE,
} from "@/lib/auth/password-policy";

describe("changeAuthenticatedUserPassword", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    transactionMock.mockReset();
    verifyPasswordMock.mockReset();
    hashPasswordMock.mockReset();
    createDatabaseSessionMock.mockReset();
    deleteDatabaseSessionsForUserMock.mockReset();
    logMock.mockReset();
  });

  it("requires the current password and does not hash a missing one", async () => {
    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result).toMatchObject({
      ok: false,
      error: CURRENT_PASSWORD_REQUIRED_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects an 11-character new password before hashing", async () => {
    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "old",
      newPassword: "abcdefghijk",
      confirmPassword: "abcdefghijk",
    });
    expect(result).toMatchObject({
      ok: false,
      error: NEW_PASSWORD_MIN_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects a 257-character new password before hashing", async () => {
    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "old",
      newPassword: "p".repeat(257),
      confirmPassword: "p".repeat(257),
    });
    expect(result).toMatchObject({
      ok: false,
      error: NEW_PASSWORD_MAX_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects confirmation mismatch without hashing", async () => {
    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "old",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkm",
    });
    expect(result).toMatchObject({
      ok: false,
      error: PASSWORDS_DO_NOT_MATCH_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects a current password longer than 256 without hashing the new password", async () => {
    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "p".repeat(257),
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result.ok).toBe(false);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password without hashing the new password", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      passwordHash: "stored-hash",
    });
    verifyPasswordMock.mockReturnValue(false);
    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "wrong",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result).toMatchObject({
      ok: false,
      error: CURRENT_PASSWORD_INCORRECT_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updates the hash, invalidates sessions, and creates a replacement session", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      passwordHash: "stored-hash",
    });
    verifyPasswordMock.mockReturnValue(true);
    hashPasswordMock.mockReturnValue("new-hash");
    const session = {
      sessionToken: "new-session",
      expires: new Date("2026-10-19T00:00:00.000Z"),
    };
    createDatabaseSessionMock.mockResolvedValue(session);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { update: vi.fn() },
      })
    );

    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "old-password",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });

    expect(result).toEqual({ ok: true, session });
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "old-password",
      "stored-hash"
    );
    expect(hashPasswordMock).toHaveBeenCalledWith("abcdefghijkl");
    expect(deleteDatabaseSessionsForUserMock).toHaveBeenCalledWith(
      "user_1",
      expect.anything()
    );
    expect(createDatabaseSessionMock).toHaveBeenCalledWith(
      "user_1",
      expect.anything()
    );
    expect(logMock).toHaveBeenCalledWith({
      event: "password_changed",
      userId: "user_1",
    });
  });

  it("does not apply the 12-character minimum to the current password", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      passwordHash: "stored-hash",
    });
    verifyPasswordMock.mockReturnValue(true);
    hashPasswordMock.mockReturnValue("new-hash");
    createDatabaseSessionMock.mockResolvedValue({
      sessionToken: "new-session",
      expires: new Date(),
    });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ user: { update: vi.fn() } })
    );

    const result = await changeAuthenticatedUserPassword({
      userId: "user_1",
      currentPassword: "short",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result.ok).toBe(true);
    expect(verifyPasswordMock).toHaveBeenCalledWith("short", "stored-hash");
  });

  it("accepts 12- and 256-character new passwords and does not trim", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      passwordHash: "stored-hash",
    });
    verifyPasswordMock.mockReturnValue(true);
    hashPasswordMock.mockReturnValue("new-hash");
    createDatabaseSessionMock.mockResolvedValue({
      sessionToken: "new-session",
      expires: new Date(),
    });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ user: { update: vi.fn() } })
    );

    const twelve = "  twelve ch!";
    await expect(
      changeAuthenticatedUserPassword({
        userId: "user_1",
        currentPassword: " old pass ",
        newPassword: twelve,
        confirmPassword: twelve,
      })
    ).resolves.toMatchObject({ ok: true });
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      " old pass ",
      "stored-hash"
    );
    expect(hashPasswordMock).toHaveBeenCalledWith(twelve);

    const max = "p".repeat(256);
    await expect(
      changeAuthenticatedUserPassword({
        userId: "user_1",
        currentPassword: "old-password",
        newPassword: max,
        confirmPassword: max,
      })
    ).resolves.toMatchObject({ ok: true });
    expect(hashPasswordMock).toHaveBeenCalledWith(max);
  });
});

describe("change password source safety", () => {
  it("does not log secrets", () => {
    const source = [
      readFileSync("lib/auth/change-password.ts", "utf8"),
      readFileSync("lib/auth/reset-password.ts", "utf8"),
      readFileSync("lib/auth/request-password-reset.ts", "utf8"),
      readFileSync("lib/auth/password-lifecycle-log.ts", "utf8"),
    ].join("\n");
    expect(source).toContain("password_changed");
    expect(source).toContain("password_reset_requested");
    expect(source).toContain("password_reset_completed");
    expect(source).not.toContain("console.log(input");
    expect(source).not.toContain("console.info(rawToken");
    expect(source).not.toContain("console.info(resetUrl");
    expect(
      readFileSync("lib/auth/account-token-service.ts", "utf8")
    ).not.toContain("account-token-consume:");
  });
});
