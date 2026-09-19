import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordWithTokenMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/reset-password", () => ({
  resetPasswordWithToken: resetPasswordWithTokenMock,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "localhost",
}));

import { POST } from "@/app/api/auth/reset-password/route";
import { generateAccountToken } from "@/lib/auth/account-token";
import {
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  PASSWORDS_DO_NOT_MATCH_MESSAGE,
} from "@/lib/auth/password-policy";

function requestFor(body: unknown, host = "app.localhost:3000") {
  return new Request("http://app.localhost:3000/api/auth/reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host,
      origin: `http://${host}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    resetPasswordWithTokenMock.mockReset();
    hashPasswordMock.mockReset();
  });

  it("returns 404 off the staff host", async () => {
    const response = await POST(
      requestFor(
        {
          token: generateAccountToken(),
          newPassword: "abcdefghijkl",
          confirmPassword: "abcdefghijkl",
        },
        "demodental.localhost:3000"
      )
    );
    expect(response.status).toBe(404);
    expect(resetPasswordWithTokenMock).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens without hashing", async () => {
    const response = await POST(
      requestFor({
        token: "not a token",
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkl",
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: PASSWORD_RESET_INVALID_LINK_MESSAGE,
    });
    expect(resetPasswordWithTokenMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("maps validation failures without a successful reset", async () => {
    resetPasswordWithTokenMock.mockResolvedValue({
      ok: false,
      code: "validation",
      error: NEW_PASSWORD_MIN_MESSAGE,
      fieldErrors: { newPassword: NEW_PASSWORD_MIN_MESSAGE },
    });
    const token = generateAccountToken();
    const response = await POST(
      requestFor({
        token,
        newPassword: "short",
        confirmPassword: "short",
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: NEW_PASSWORD_MIN_MESSAGE,
    });
  });

  it("maps confirm mismatch", async () => {
    resetPasswordWithTokenMock.mockResolvedValue({
      ok: false,
      code: "validation",
      error: PASSWORDS_DO_NOT_MATCH_MESSAGE,
      fieldErrors: { confirmPassword: PASSWORDS_DO_NOT_MATCH_MESSAGE },
    });
    const response = await POST(
      requestFor({
        token: generateAccountToken(),
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkm",
      })
    );
    expect(response.status).toBe(400);
  });

  it("succeeds for a well-formed token payload", async () => {
    resetPasswordWithTokenMock.mockResolvedValue({ ok: true });
    const token = generateAccountToken();
    const response = await POST(
      requestFor({
        token,
        newPassword: "abcdefghijkl",
        confirmPassword: "abcdefghijkl",
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(resetPasswordWithTokenMock).toHaveBeenCalledWith({
      rawToken: token,
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
  });
});
