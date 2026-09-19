import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const statusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/accept-invitation", () => ({
  getInvitationAcceptanceStatus: statusMock,
}));

import { POST } from "@/app/api/auth/invitation-status/route";

function requestFor(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://app.localhost:3000/api/auth/invitation-status", {
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

describe("POST /api/auth/invitation-status", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    statusMock.mockReset();
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("rejects marketing and tenant hosts", async () => {
    statusMock.mockResolvedValue({ valid: true });
    const marketing = await POST(
      requestFor(
        { token: "Aa1-_".repeat(8) + "abcde" },
        {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        }
      )
    );
    expect(marketing.status).toBe(404);
    const tenant = await POST(
      requestFor(
        { token: "Aa1-_".repeat(8) + "abcde" },
        {
          host: "demodental.localhost:3000",
          origin: "http://demodental.localhost:3000",
        }
      )
    );
    expect(tenant.status).toBe(404);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("returns valid:false for malformed JSON without revealing why", async () => {
    const response = await POST(
      new Request("http://app.localhost:3000/api/auth/invitation-status", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
          "content-type": "application/json",
        },
        body: "{",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("returns only valid/invalid and does not accept clinicId from the body", async () => {
    statusMock.mockResolvedValue({ valid: true });
    const token = "Aa1-_".repeat(8) + "abcde";
    const response = await POST(
      requestFor({
        token,
        clinicId: "forged",
        role: "ADMIN",
        userId: "forged-user",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(statusMock).toHaveBeenCalledWith({ rawToken: token });
  });

  it("maps unusable invitations to valid:false", async () => {
    statusMock.mockResolvedValue({ valid: false });
    const response = await POST(
      requestFor({ token: "Aa1-_".repeat(8) + "abcde" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
  });
});
