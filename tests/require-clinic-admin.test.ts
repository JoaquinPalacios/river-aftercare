import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicMembershipRole } from "@prisma/client";

const notFoundMock = vi.hoisted(() => vi.fn());
const requireStaffSessionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/lib/auth/require-staff-session", () => ({
  requireStaffSession: requireStaffSessionMock,
}));

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";

describe("requireClinicAdmin", () => {
  beforeEach(() => {
    notFoundMock.mockReset();
    requireStaffSessionMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
  });

  it("returns the session for clinic ADMIN", async () => {
    const session = {
      user: {
        id: "user_1",
        email: "admin@care-guide.test",
        name: "Demo Admin",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_1",
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_1", name: "Riverside" },
      },
    };
    requireStaffSessionMock.mockResolvedValue(session);

    await expect(requireClinicAdmin()).resolves.toEqual(session);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("does not let clinic STAFF mutate clinic configuration", async () => {
    requireStaffSessionMock.mockResolvedValue({
      user: {
        id: "user_staff",
        email: "staff@care-guide.test",
        name: "Demo Staff",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_2",
        role: ClinicMembershipRole.STAFF,
        clinic: { id: "clinic_1", name: "Riverside" },
      },
    });

    await expect(requireClinicAdmin()).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("allows a platform operator assisting a clinic", async () => {
    const session = {
      user: {
        id: "user_operator",
        email: "operator@care-guide.test",
        name: "Demo Operator",
        platformRole: "OPERATOR",
      },
      clinicMembership: {
        membershipId: "operator-support",
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_1", name: "Riverside" },
        source: "operator_support" as const,
      },
    };
    requireStaffSessionMock.mockResolvedValue(session);

    await expect(requireClinicAdmin()).resolves.toEqual(session);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("does not treat a forged operator-support context as clinic admin for STAFF", async () => {
    requireStaffSessionMock.mockResolvedValue({
      user: {
        id: "user_staff",
        email: "staff@care-guide.test",
        name: "Demo Staff",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "operator-support",
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_other", name: "Other Clinic" },
        source: "operator_support" as const,
      },
    });

    await expect(requireClinicAdmin()).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
