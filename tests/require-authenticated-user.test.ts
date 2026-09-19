import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";

describe("requireAuthenticatedUser", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    getCurrentUserMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("redirects anonymous users to /login", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(requireAuthenticatedUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("allows operators without clinic membership", async () => {
    const user = {
      id: "op_1",
      email: "operator@example.test",
      name: "Operator",
      platformRole: "OPERATOR",
    };
    getCurrentUserMock.mockResolvedValue(user);
    await expect(requireAuthenticatedUser()).resolves.toEqual(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("allows clinic admin and staff users", async () => {
    const admin = {
      id: "admin_1",
      email: "admin@example.test",
      name: "Admin",
      platformRole: "NONE",
    };
    getCurrentUserMock.mockResolvedValue(admin);
    await expect(requireAuthenticatedUser()).resolves.toEqual(admin);

    const staff = {
      id: "staff_1",
      email: "staff@example.test",
      name: "Staff",
      platformRole: "NONE",
    };
    getCurrentUserMock.mockResolvedValue(staff);
    await expect(requireAuthenticatedUser()).resolves.toEqual(staff);
  });
});
