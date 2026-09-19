import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPasswordResetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/request-password-reset", () => ({
  requestPasswordReset: requestPasswordResetMock,
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "localhost",
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import { FORGOT_PASSWORD_GENERIC_MESSAGE } from "@/lib/auth/password-policy";

function requestFor(body: unknown, host = "app.localhost:3000") {
  return new Request("http://app.localhost:3000/api/auth/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host,
      origin: `http://${host}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset();
    requestPasswordResetMock.mockResolvedValue(undefined);
  });

  it("returns 404 off the staff host", async () => {
    const response = await POST(
      requestFor({ email: "user@example.test" }, "localhost:3000")
    );
    expect(response.status).toBe(404);
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("rejects invalid and oversized emails without calling the service", async () => {
    const invalid = await POST(requestFor({ email: "not-an-email" }));
    expect(invalid.status).toBe(400);
    const tooLong = await POST(
      requestFor({ email: `${"a".repeat(250)}@x.com` })
    );
    expect(tooLong.status).toBe(400);
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("returns the generic success payload", async () => {
    const response = await POST(requestFor({ email: "User@Example.TEST" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: FORGOT_PASSWORD_GENERIC_MESSAGE,
    });
    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: "user@example.test",
    });
  });

  it("still returns the generic payload when the service throws", async () => {
    requestPasswordResetMock.mockRejectedValue(new Error("boom"));
    const response = await POST(requestFor({ email: "user@example.test" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: FORGOT_PASSWORD_GENERIC_MESSAGE,
    });
  });
});
