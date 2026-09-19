import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
} from "@/lib/auth/login-input";

const verifyPasswordMock = vi.hoisted(() => vi.fn());
const createDatabaseSessionMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
const dummyPasswordHash = vi.hoisted(
  () => "scrypt:dummy-salt:dummy-hash-for-tests"
);

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
  DUMMY_PASSWORD_HASH: dummyPasswordHash,
}));

vi.mock("@/lib/auth/session", () => ({
  createDatabaseSession: createDatabaseSessionMock,
  postLoginPath: ({
    platformRole,
    hasClinicMembership,
  }: {
    platformRole: string;
    hasClinicMembership: boolean;
  }) =>
    !hasClinicMembership && platformRole === "OPERATOR"
      ? "/operator/clinics"
      : "/dashboard",
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: {
      findUnique: findUniqueMock,
    },
    clinicMembership: {
      findMany: findManyMock,
    },
  }),
}));

vi.mock("@/lib/auth/session-cookie", () => ({
  AUTH_SESSION_COOKIE_NAME: "authjs.session-token",
  authSessionCookieOptions: {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false,
  },
}));

import { POST } from "@/app/api/auth/login/route";

const GENERIC_INVALID_CREDENTIALS = { error: "Invalid credentials." };

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function staffUser(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "user_1",
    name: "Demo Admin",
    email: "admin@care-guide.test",
    passwordHash: "stored-hash",
    platformRole: "NONE",
    ...overrides,
  };
}

async function expectGeneric401(response: Response) {
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual(GENERIC_INVALID_CREDENTIALS);
  expect(createDatabaseSessionMock).not.toHaveBeenCalled();
  expect(findManyMock).not.toHaveBeenCalled();
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    verifyPasswordMock.mockReset();
    createDatabaseSessionMock.mockReset();
    findUniqueMock.mockReset();
    findManyMock.mockReset();
  });

  it("returns 401 for invalid credentials", async () => {
    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "wrong-password",
      })
    );

    await expectGeneric401(response);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "wrong-password",
      "stored-hash"
    );
  });

  it("creates a session cookie for a valid single-clinic staff user", async () => {
    const expires = new Date("2026-05-01T12:00:00.000Z");

    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(true);
    findManyMock.mockResolvedValue([{ clinicId: "clinic_1" }]);
    createDatabaseSessionMock.mockResolvedValue({
      sessionToken: "session-token-123",
      expires,
    });

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "CareGuideDemo123!",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      redirectTo: "/dashboard",
      user: {
        id: "user_1",
        name: "Demo Admin",
        email: "admin@care-guide.test",
      },
    });
    expect(response.headers.get("set-cookie")).toContain(
      "authjs.session-token=session-token-123"
    );
    expect(createDatabaseSessionMock).toHaveBeenCalledWith("user_1");
  });

  it("rejects users with multiple clinic memberships", async () => {
    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(true);
    findManyMock.mockResolvedValue([
      { clinicId: "clinic_1" },
      { clinicId: "clinic_2" },
    ]);

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "CareGuideDemo123!",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "Your account has multiple clinic memberships and cannot sign in to this MVP yet.",
    });
    expect(createDatabaseSessionMock).not.toHaveBeenCalled();
  });

  it("allows a platform operator with no clinic membership to sign in", async () => {
    const expires = new Date("2026-05-01T12:00:00.000Z");

    findUniqueMock.mockResolvedValue(
      staffUser({
        id: "user_operator",
        name: "Demo Operator",
        email: "operator@local.aftercare.test",
        platformRole: "OPERATOR",
      })
    );
    verifyPasswordMock.mockReturnValue(true);
    findManyMock.mockResolvedValue([]);
    createDatabaseSessionMock.mockResolvedValue({
      sessionToken: "operator-session",
      expires,
    });

    const response = await POST(
      loginRequest({
        email: "operator@local.aftercare.test",
        password: "LocalOnly123!",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      redirectTo: "/operator/clinics",
      user: {
        id: "user_operator",
        name: "Demo Operator",
        email: "operator@local.aftercare.test",
      },
    });
    expect(createDatabaseSessionMock).toHaveBeenCalledWith("user_operator");
  });

  it("rejects a clinic user with no membership", async () => {
    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(true);
    findManyMock.mockResolvedValue([]);

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "CareGuideDemo123!",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Your account does not have staff access yet.",
    });
    expect(createDatabaseSessionMock).not.toHaveBeenCalled();
  });

  it("normalizes email with trim and lowercase before lookup", async () => {
    findUniqueMock.mockResolvedValue(null);
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email: "  Admin@Care-Guide.TEST  ",
        password: "x",
      })
    );

    await expectGeneric401(response);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { email: "admin@care-guide.test" },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        platformRole: true,
      },
    });
  });

  it("accepts a one-character password for a verification attempt", async () => {
    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "a",
      })
    );

    await expectGeneric401(response);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    expect(verifyPasswordMock).toHaveBeenCalledWith("a", "stored-hash");
  });

  it("verifies a 256-character password against the stored hash", async () => {
    const password = "p".repeat(LOGIN_PASSWORD_MAX_LENGTH);
    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password,
      })
    );

    await expectGeneric401(response);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    expect(verifyPasswordMock).toHaveBeenCalledWith(password, "stored-hash");
  });

  it("rejects a 257-character password before lookup or verification", async () => {
    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "p".repeat(LOGIN_PASSWORD_MAX_LENGTH + 1),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password is too long.",
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects a very large password before lookup or verification", async () => {
    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "p".repeat(100_000),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password is too long.",
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("looks up a 254-character email", async () => {
    const local = "a".repeat(LOGIN_EMAIL_MAX_LENGTH - "@example.com".length);
    const email = `${local}@example.com`;
    findUniqueMock.mockResolvedValue(null);
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email,
        password: "password",
      })
    );

    await expectGeneric401(response);
    expect(email).toHaveLength(LOGIN_EMAIL_MAX_LENGTH);
    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email },
      })
    );
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an email longer than 254 characters before lookup", async () => {
    const local = "a".repeat(
      LOGIN_EMAIL_MAX_LENGTH + 1 - "@example.com".length
    );
    const email = `${local}@example.com`;

    const response = await POST(
      loginRequest({
        email,
        password: "password",
      })
    );

    expect(email.length).toBeGreaterThan(LOGIN_EMAIL_MAX_LENGTH);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Email address is too long.",
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("uses one dummy verification for an unknown user", async () => {
    findUniqueMock.mockResolvedValue(null);
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email: "missing@care-guide.test",
        password: "any-password",
      })
    );

    await expectGeneric401(response);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "any-password",
      dummyPasswordHash
    );
  });

  it("uses one dummy verification when passwordHash is null", async () => {
    findUniqueMock.mockResolvedValue(staffUser({ passwordHash: null }));
    verifyPasswordMock.mockReturnValue(false);

    const response = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "any-password",
      })
    );

    await expectGeneric401(response);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "any-password",
      dummyPasswordHash
    );
  });

  it("does not grant access when dummy verification happens to match", async () => {
    findUniqueMock.mockResolvedValue(null);
    verifyPasswordMock.mockReturnValue(true);

    const response = await POST(
      loginRequest({
        email: "missing@care-guide.test",
        password: "any-password",
      })
    );

    await expectGeneric401(response);
  });

  it("returns the same generic 401 for unknown, null-hash, and wrong-password attempts", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    verifyPasswordMock.mockReturnValueOnce(false);
    const unknownUser = await POST(
      loginRequest({
        email: "missing@care-guide.test",
        password: "password",
      })
    );

    findUniqueMock.mockResolvedValueOnce(staffUser({ passwordHash: null }));
    verifyPasswordMock.mockReturnValueOnce(false);
    const nullHash = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "password",
      })
    );

    findUniqueMock.mockResolvedValueOnce(staffUser());
    verifyPasswordMock.mockReturnValueOnce(false);
    const wrongPassword = await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "password",
      })
    );

    const bodies = await Promise.all([
      unknownUser.json(),
      nullHash.json(),
      wrongPassword.json(),
    ]);

    expect(unknownUser.status).toBe(401);
    expect(nullHash.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(bodies[0]).toEqual(GENERIC_INVALID_CREDENTIALS);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(JSON.stringify(bodies[0])).not.toMatch(
      /does not exist|password not set|dummy|hash/i
    );
  });

  it("does not create a session when credentials are invalid", async () => {
    findUniqueMock.mockResolvedValue(staffUser());
    verifyPasswordMock.mockReturnValue(false);

    await POST(
      loginRequest({
        email: "admin@care-guide.test",
        password: "wrong-password",
      })
    );

    expect(createDatabaseSessionMock).not.toHaveBeenCalled();
  });
});
