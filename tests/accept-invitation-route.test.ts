import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acceptMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/accept-invitation", () => ({
  acceptInvitationWithToken: acceptMock,
}));

import { POST } from "@/app/api/auth/accept-invitation/route";
import { INVITATION_INVALID_LINK_MESSAGE } from "@/lib/auth/password-policy";

function requestFor(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://app.localhost:3000/api/auth/accept-invitation", {
    method: "POST",
    headers: {
      host: "app.localhost:3000",
      origin: "http://app.localhost:3000",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/accept-invitation", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    acceptMock.mockReset();
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("rejects non-staff hosts", async () => {
    const response = await POST(
      requestFor(
        {
          token: "Aa1-_".repeat(8) + "abcde",
          newPassword: "abcdefghijkl",
        },
        {
          host: "demodental.localhost:3000",
          origin: "http://demodental.localhost:3000",
        }
      )
    );
    expect(response.status).toBe(404);
    expect(acceptMock).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens before acceptance", async () => {
    const response = await POST(
      requestFor({ token: "not a token", newPassword: "abcdefghijkl" })
    );
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe(INVITATION_INVALID_LINK_MESSAGE);
    expect(acceptMock).not.toHaveBeenCalled();
  });

  it("does not accept clinicId or role from the browser body", async () => {
    acceptMock.mockResolvedValue({ ok: true });
    const token = "Aa1-_".repeat(8) + "abcde";
    const response = await POST(
      requestFor({
        token,
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkl",
        clinicId: "forged",
        role: "ADMIN",
        userId: "forged-user",
      })
    );
    expect(response.status).toBe(200);
    expect(acceptMock).toHaveBeenCalledWith({
      rawToken: token,
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
  });
});
