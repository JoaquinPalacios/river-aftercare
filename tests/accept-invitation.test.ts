import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.hoisted(() => vi.fn());
const inspectMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());
const logMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/account-token-service", () => ({
  completeInvitation: completeMock,
  inspectInvitation: inspectMock,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/auth/invitation-lifecycle-log", () => ({
  logInvitationLifecycle: logMock,
}));

import {
  acceptInvitationWithToken,
  getInvitationAcceptanceStatus,
} from "@/lib/auth/accept-invitation";
import {
  INVITATION_INVALID_LINK_MESSAGE,
  NEW_PASSWORD_MAX_MESSAGE,
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORDS_DO_NOT_MATCH_MESSAGE,
} from "@/lib/auth/password-policy";

describe("acceptInvitationWithToken", () => {
  beforeEach(() => {
    completeMock.mockReset();
    inspectMock.mockReset();
    hashPasswordMock.mockReset();
    logMock.mockReset();
  });

  it("rejects 11-character passwords before hashing", async () => {
    const result = await acceptInvitationWithToken({
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
    const result = await acceptInvitationWithToken({
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

  it("rejects mismatched passwords before hashing", async () => {
    const result = await acceptInvitationWithToken({
      rawToken: "token",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkm",
    });
    expect(result).toMatchObject({
      ok: false,
      error: PASSWORDS_DO_NOT_MATCH_MESSAGE,
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("accepts 12 and 256 character passwords", async () => {
    completeMock.mockResolvedValue({
      ok: true,
      userId: "user_1",
      tokenId: "tok_1",
      clinicId: "clinic_1",
      role: "STAFF",
    });
    hashPasswordMock.mockReturnValue("new-hash");

    await expect(
      acceptInvitationWithToken({
        rawToken: "Aa1-_".repeat(8) + "abcde",
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkl",
      })
    ).resolves.toEqual({ ok: true });

    const long = "p".repeat(256);
    await acceptInvitationWithToken({
      rawToken: "Aa1-_".repeat(8) + "abcde",
      newPassword: long,
      confirmPassword: long,
    });
    expect(hashPasswordMock).toHaveBeenCalled();
  });

  it("maps token failures to the generic invitation error", async () => {
    hashPasswordMock.mockReturnValue("new-hash");
    completeMock.mockResolvedValue({ ok: false, reason: "expired" });
    const result = await acceptInvitationWithToken({
      rawToken: "Aa1-_".repeat(8) + "abcde",
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(result).toEqual({
      ok: false,
      code: "invalid_token",
      error: INVITATION_INVALID_LINK_MESSAGE,
      fieldErrors: { token: INVITATION_INVALID_LINK_MESSAGE },
    });
  });

  it("treats malformed tokens as invalid without inspecting", async () => {
    await expect(
      getInvitationAcceptanceStatus({ rawToken: "not a token" })
    ).resolves.toEqual({ valid: false });
    expect(inspectMock).not.toHaveBeenCalled();
  });

  it("returns only valid/invalid from invitation prevalidation", async () => {
    inspectMock.mockResolvedValue({ valid: true });
    await expect(
      getInvitationAcceptanceStatus({
        rawToken: "Aa1-_".repeat(8) + "abcde",
      })
    ).resolves.toEqual({ valid: true });
    inspectMock.mockResolvedValue({ valid: false });
    await expect(
      getInvitationAcceptanceStatus({
        rawToken: "Aa1-_".repeat(8) + "abcde",
      })
    ).resolves.toEqual({ valid: false });
  });
});
