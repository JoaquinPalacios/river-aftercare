import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/complete-email-change", () => ({
  completeEmailChangeWithToken: completeMock,
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "localhost",
}));

import { POST } from "@/app/api/auth/confirm-email-change/route";
import { generateAccountToken } from "@/lib/auth/account-token";
import { EMAIL_CHANGE_INVALID_LINK_MESSAGE } from "@/lib/auth/account-profile-schema";

function requestFor(body: unknown, host = "app.localhost:3000") {
  return new Request(
    "http://app.localhost:3000/api/auth/confirm-email-change",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host,
        origin: `http://${host}`,
      },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/auth/confirm-email-change", () => {
  beforeEach(() => {
    completeMock.mockReset();
    authMock.mockReset();
    authMock.mockResolvedValue(null);
  });

  it("returns 404 off the staff host", async () => {
    const response = await POST(
      requestFor({ token: generateAccountToken() }, "demodental.localhost:3000")
    );
    expect(response.status).toBe(404);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens", async () => {
    const response = await POST(requestFor({ token: "not a token" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: EMAIL_CHANGE_INVALID_LINK_MESSAGE,
    });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("succeeds for a well-formed token and reports signed-in state", async () => {
    const token = generateAccountToken();
    completeMock.mockResolvedValue({
      ok: true,
      userId: "user_1",
      email: "next@example.test",
    });
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    const response = await POST(requestFor({ token }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      signedIn: true,
    });
    expect(completeMock).toHaveBeenCalledWith({ rawToken: token });
  });
});
