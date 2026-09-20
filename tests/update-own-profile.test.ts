import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.hoisted(() => vi.fn());
const userUpdateMock = vi.hoisted(() => vi.fn());
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const logMock = vi.hoisted(() => vi.fn());
const requestEmailChangeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: findUniqueMock, update: userUpdateMock },
  }),
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/auth/account-security-log", () => ({
  logAccountSecurity: logMock,
}));

vi.mock("@/lib/auth/request-email-change", () => ({
  requestEmailChange: requestEmailChangeMock,
}));

import { updateOwnProfile } from "@/lib/auth/update-own-profile";
import {
  PROFILE_EMAIL_INVALID_MESSAGE,
  PROFILE_EMAIL_TAKEN_MESSAGE,
  PROFILE_NAME_REQUIRED_MESSAGE,
} from "@/lib/auth/account-profile-schema";
import { CURRENT_PASSWORD_INCORRECT_MESSAGE } from "@/lib/auth/password-policy";

describe("updateOwnProfile", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    userUpdateMock.mockReset();
    verifyPasswordMock.mockReset();
    logMock.mockReset();
    requestEmailChangeMock.mockReset();
  });

  it("updates the signed-in user's name without a password", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      name: "Old Name",
      email: "user@example.test",
      passwordHash: "hash",
    });
    userUpdateMock.mockResolvedValue({});

    const result = await updateOwnProfile({
      userId: "user_1",
      name: "  New Name  ",
      email: "user@example.test",
      currentPassword: "",
    });

    expect(result).toMatchObject({
      ok: true,
      name: "New Name",
      emailChanged: false,
      nameChanged: true,
      pendingEmail: null,
    });
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(requestEmailChangeMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith({
      event: "profile_name_changed",
      userId: "user_1",
    });
  });

  it("rejects an empty name", async () => {
    const result = await updateOwnProfile({
      userId: "user_1",
      name: "   ",
      email: "user@example.test",
      currentPassword: "",
    });
    expect(result).toMatchObject({
      ok: false,
      error: PROFILE_NAME_REQUIRED_MESSAGE,
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const result = await updateOwnProfile({
      userId: "user_1",
      name: "River Staff",
      email: "not-an-email",
      currentPassword: "whatever",
    });
    expect(result).toMatchObject({
      ok: false,
      error: PROFILE_EMAIL_INVALID_MESSAGE,
    });
  });

  it("requires the current password to change email", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      name: "River Staff",
      email: "user@example.test",
      passwordHash: "hash",
    });

    const result = await updateOwnProfile({
      userId: "user_1",
      name: "River Staff",
      email: "next@example.test",
      currentPassword: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.fieldErrors?.currentPassword).toBeTruthy();
    expect(requestEmailChangeMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password on email change", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      name: "River Staff",
      email: "user@example.test",
      passwordHash: "hash",
    });
    verifyPasswordMock.mockReturnValue(false);

    const result = await updateOwnProfile({
      userId: "user_1",
      name: "River Staff",
      email: "next@example.test",
      currentPassword: "wrong-password",
    });
    expect(result).toMatchObject({
      ok: false,
      error: CURRENT_PASSWORD_INCORRECT_MESSAGE,
    });
    expect(requestEmailChangeMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email without changing User.email", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      name: "River Staff",
      email: "user@example.test",
      passwordHash: "hash",
    });
    verifyPasswordMock.mockReturnValue(true);
    requestEmailChangeMock.mockResolvedValue({
      ok: false,
      code: "email_taken",
      error: PROFILE_EMAIL_TAKEN_MESSAGE,
    });

    const result = await updateOwnProfile({
      userId: "user_1",
      name: "River Staff",
      email: "taken@example.test",
      currentPassword: "correct-password",
    });
    expect(result).toMatchObject({
      ok: false,
      error: PROFILE_EMAIL_TAKEN_MESSAGE,
    });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("keeps the current email and requests verification for a new address", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      name: "River Staff",
      email: "user@example.test",
      passwordHash: "hash",
    });
    verifyPasswordMock.mockReturnValue(true);
    requestEmailChangeMock.mockResolvedValue({
      ok: true,
      pendingEmail: "next@example.test",
    });

    const result = await updateOwnProfile({
      userId: "user_1",
      name: "River Staff",
      email: "next@example.test",
      currentPassword: "correct-password",
    });
    expect(result).toMatchObject({
      ok: true,
      email: "user@example.test",
      emailChanged: true,
      pendingEmail: "next@example.test",
    });
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(requestEmailChangeMock).toHaveBeenCalledWith({
      userId: "user_1",
      email: "next@example.test",
    });
  });
});
