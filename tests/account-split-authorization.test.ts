import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { decideAccountSplitAuthorization } from "@/lib/account-split/authorize";

const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
}));

import { requireAccountSplitOperator } from "@/lib/account-split/authorize";

const operator = {
  id: "user_operator",
  email: "operator@care-guide.test",
  name: "Operator",
  platformRole: "OPERATOR" as const,
};

describe("account split authorization", () => {
  beforeEach(() => {
    notFoundMock.mockReset();
    redirectMock.mockReset();
    getAuthContextMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("accepts a true platform operator", async () => {
    expect(
      decideAccountSplitAuthorization({
        user: operator,
        clinicMembership: null,
      })
    ).toEqual({ ok: true });
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: null,
    });
    await expect(requireAccountSplitOperator()).resolves.toEqual({
      user: operator,
    });
  });

  it("rejects a clinic ADMIN", async () => {
    expect(
      decideAccountSplitAuthorization({
        user: { platformRole: "NONE" },
        clinicMembership: { role: "ADMIN", source: "membership" },
      })
    ).toEqual({ ok: false, reason: "clinic_admin" });
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "admin",
        email: "admin@care-guide.test",
        name: "Admin",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "m1",
        role: "ADMIN",
        clinic: { id: "c1", name: "Clinic" },
        source: "membership",
      },
    });
    await expect(requireAccountSplitOperator()).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
  });

  it("rejects clinic STAFF", () => {
    expect(
      decideAccountSplitAuthorization({
        user: { platformRole: "NONE" },
        clinicMembership: { role: "STAFF", source: "membership" },
      })
    ).toEqual({ ok: false, reason: "clinic_staff" });
  });

  it("rejects operator-support mode", async () => {
    expect(
      decideAccountSplitAuthorization({
        user: operator,
        clinicMembership: { role: "ADMIN", source: "operator_support" },
      })
    ).toEqual({ ok: false, reason: "operator_support" });
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: {
        membershipId: "operator-support",
        role: "ADMIN",
        clinic: { id: "c1", name: "Clinic" },
        source: "operator_support",
      },
    });
    await expect(requireAccountSplitOperator()).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
  });

  it("keeps every split action behind the platform operator guard", () => {
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/split/actions.ts",
      "utf8"
    );
    const exports = actions.match(/export async function \w+/g) ?? [];
    expect(exports.length).toBeGreaterThanOrEqual(6);
    expect(actions).toContain("requireAccountSplitOperator");
    for (const line of exports) {
      const name = line.replace("export async function ", "");
      const body = actions.slice(actions.indexOf(line));
      expect(body.indexOf("requireAccountSplitOperator")).toBeGreaterThan(-1);
      expect(body.indexOf("requireAccountSplitOperator")).toBeLessThan(
        body.indexOf("export async function", 1) === -1
          ? body.length
          : body.indexOf("export async function", 1)
      );
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
