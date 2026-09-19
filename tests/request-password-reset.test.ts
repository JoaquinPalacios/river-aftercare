import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.hoisted(() => vi.fn());
const createIfAllowedMock = vi.hoisted(() => vi.fn());
const revokeMock = vi.hoisted(() => vi.fn());
const sendAuthMock = vi.hoisted(() => vi.fn());
const getConfigMock = vi.hoisted(() => vi.fn());
const logMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: findUniqueMock },
  }),
}));

vi.mock("@/lib/auth/account-token-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/auth/account-token-service")>();
  return {
    ...actual,
    createPasswordResetTokenIfAllowed: createIfAllowedMock,
    revokeAccountToken: revokeMock,
  };
});

vi.mock("@/lib/email/auth-email", () => ({
  getAuthEmailDeliveryConfig: getConfigMock,
  sendAuthTransactionalEmail: sendAuthMock,
}));

vi.mock("@/lib/auth/password-lifecycle-log", () => ({
  logPasswordLifecycle: logMock,
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "example.com",
}));

import { requestPasswordReset } from "@/lib/auth/request-password-reset";
import { FORGOT_PASSWORD_GENERIC_MESSAGE } from "@/lib/auth/password-policy";

describe("requestPasswordReset", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    createIfAllowedMock.mockReset();
    revokeMock.mockReset();
    sendAuthMock.mockReset();
    getConfigMock.mockReset();
    logMock.mockReset();
    getConfigMock.mockReturnValue({
      ready: true,
      from: "River Aftercare <accounts@example.test>",
      replyTo: "hello@example.test",
      transport: { kind: "memory" },
    });
  });

  it("does nothing for unknown emails", async () => {
    findUniqueMock.mockResolvedValue(null);
    await requestPasswordReset({ email: "missing@example.test" });
    expect(createIfAllowedMock).not.toHaveBeenCalled();
    expect(sendAuthMock).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("does nothing for null passwordHash users", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_pending",
      email: "pending@example.test",
      passwordHash: null,
    });
    await requestPasswordReset({ email: "pending@example.test" });
    expect(createIfAllowedMock).not.toHaveBeenCalled();
    expect(sendAuthMock).not.toHaveBeenCalled();
  });

  it("does not send when cooldown is active", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "user@example.test",
      passwordHash: "scrypt:hash",
    });
    createIfAllowedMock.mockResolvedValue({
      created: false,
      reason: "cooldown",
    });
    await requestPasswordReset({ email: "user@example.test" });
    expect(sendAuthMock).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("sends auth mail to the user record and logs the user id", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "user@example.test",
      passwordHash: "scrypt:hash",
    });
    createIfAllowedMock.mockResolvedValue({
      created: true,
      rawToken: "raw-token-value",
      token: { id: "tok_1" },
    });
    sendAuthMock.mockResolvedValue({ ok: true });

    await requestPasswordReset({ email: "  User@Example.TEST  " });

    expect(sendAuthMock).toHaveBeenCalledTimes(1);
    const payload = sendAuthMock.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    const config = sendAuthMock.mock.calls[0]?.[1] as { from: string };
    expect(payload.to).toBe("user@example.test");
    expect(payload.subject).toBe("Reset your River Aftercare password");
    expect(payload.text).toContain("#token=raw-token-value");
    expect(payload.text).not.toContain("?token=");
    expect(payload.html).toContain("#token=raw-token-value");
    expect(config.from).toContain("accounts@example.test");
    expect(logMock).toHaveBeenCalledWith({
      event: "password_reset_requested",
      userId: "user_1",
    });
    expect(JSON.stringify(logMock.mock.calls)).not.toContain("raw-token-value");
    expect(FORGOT_PASSWORD_GENERIC_MESSAGE).toContain("If an account exists");
  });

  it("revokes the new token when delivery fails", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "user@example.test",
      passwordHash: "scrypt:hash",
    });
    createIfAllowedMock.mockResolvedValue({
      created: true,
      rawToken: "raw-token-value",
      token: { id: "tok_1" },
    });
    sendAuthMock.mockResolvedValue({ ok: false, code: "delivery_failed" });

    await requestPasswordReset({ email: "user@example.test" });
    expect(revokeMock).toHaveBeenCalledWith("tok_1", expect.anything());
    expect(logMock).toHaveBeenCalledWith({
      event: "password_reset_email_failed",
      userId: "user_1",
      reason: "delivery_failed",
    });
  });

  it("does not create a token when auth email is not configured", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "user@example.test",
      passwordHash: "scrypt:hash",
    });
    getConfigMock.mockReturnValue({ ready: false, reason: "missing_from" });
    await requestPasswordReset({ email: "user@example.test" });
    expect(createIfAllowedMock).not.toHaveBeenCalled();
    expect(sendAuthMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith({
      event: "password_reset_email_failed",
      userId: "user_1",
      reason: "not_configured",
    });
  });

  it("revokes the new token when sending throws", async () => {
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "user@example.test",
      passwordHash: "scrypt:hash",
    });
    createIfAllowedMock.mockResolvedValue({
      created: true,
      rawToken: "raw-token-value",
      token: { id: "tok_1" },
    });
    sendAuthMock.mockRejectedValue(new Error("provider exploded"));

    await requestPasswordReset({ email: "user@example.test" });
    expect(revokeMock).toHaveBeenCalledWith("tok_1", expect.anything());
    expect(logMock).toHaveBeenCalledWith({
      event: "password_reset_email_failed",
      userId: "user_1",
      reason: "delivery_failed",
    });
  });
});
