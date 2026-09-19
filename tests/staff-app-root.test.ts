import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

import Home from "@/app/(staff)/page";

describe("staff app root", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    getAuthContextMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("redirects anonymous users to /login", async () => {
    getAuthContextMock.mockResolvedValue({
      user: null,
      clinicMembership: null,
    });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("redirects an authenticated operator with no membership to All Clinics", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_operator",
        email: "operator@local.aftercare.test",
        name: "Demo Operator",
        platformRole: "OPERATOR",
      },
      clinicMembership: null,
    });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/operator/clinics");
  });

  it("redirects an authenticated single-clinic user to /dashboard", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_1",
        email: "admin@care-guide.test",
        name: "Demo Admin",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_1",
        role: "ADMIN",
        clinic: { id: "clinic_1", name: "Riverside Dental Demo" },
      },
    });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("sends unresolved auth failures to /login instead of looping", async () => {
    getAuthContextMock.mockRejectedValue(new Error("multiple memberships"));

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("uses the canonical signed-in home helper and a server redirect", () => {
    const source = readFileSync("app/(staff)/page.tsx", "utf8");

    expect(source).toContain("signedInHomePath");
    expect(source).toContain(
      'redirect(signedInHomePath(authContext) ?? "/login")'
    );
    expect(source).not.toContain("Clinic portal");
    expect(source).not.toContain("Staff sign in");
    expect(source).not.toContain("Operator sign in");
    expect(source).not.toContain("router.push");
    expect(source).not.toContain("window.location");
  });
});
