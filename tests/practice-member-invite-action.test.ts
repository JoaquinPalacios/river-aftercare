import { readFileSync } from "node:fs";

import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());
const loadAccessMock = vi.hoisted(() => vi.fn());
const inviteMock = vi.hoisted(() => vi.fn());
const gateMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

vi.mock("@/lib/auth/clinic-authorization", () => ({
  loadClinicAccess: loadAccessMock,
}));

vi.mock("@/lib/billing/activation-gate", () => ({
  enforcePrePaymentActivationGate: gateMock,
}));

vi.mock("@/lib/operator/invite-clinic-user", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/operator/invite-clinic-user")>();
  return {
    ...actual,
    inviteClinicUser: inviteMock,
  };
});

import { invitePracticeMemberAction } from "@/app/(staff)/(clinic-portal)/practice/membership-actions";
import { OPERATOR_SUPPORT_MEMBERSHIP_ID } from "@/lib/auth/operator-support-clinic";
import { PENDING_SAME_CLINIC_MESSAGE } from "@/lib/operator/invite-clinic-user";

const operator = {
  id: "user_operator",
  email: "operator@example.test",
  name: "Demo Operator",
  platformRole: PlatformRole.OPERATOR,
};

const admin = {
  id: "user_admin",
  email: "admin@example.test",
  name: "Clinic Admin",
  platformRole: PlatformRole.NONE,
};

const staff = {
  id: "user_staff",
  email: "staff@example.test",
  name: "Clinic Staff",
  platformRole: PlatformRole.NONE,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("invitePracticeMemberAction", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    notFoundMock.mockReset();
    getAuthContextMock.mockReset();
    headersMock.mockReset();
    loadAccessMock.mockReset();
    inviteMock.mockReset();
    gateMock.mockReset();
    revalidatePathMock.mockReset();
    notFoundMock.mockImplementation(() => {
      const error = new Error("NEXT_HTTP_ERROR_FALLBACK;404") as Error & {
        digest: string;
      };
      error.digest = "NEXT_NOT_FOUND";
      throw error;
    });
    gateMock.mockResolvedValue({
      kind: "allow",
      reason: "legacy",
      billingHref: null,
    });
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    headersMock.mockResolvedValue(new Headers({ host: "app.localhost:3000" }));
    inviteMock.mockResolvedValue({
      ok: true,
      outcome: "INVITATION_SENT",
      delivered: true,
      email: "new.admin@example.test",
      userId: "user_new",
    });
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("lets an assisting operator invite for a clinic with zero members", async () => {
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: {
        membershipId: OPERATOR_SUPPORT_MEMBERSHIP_ID,
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_empty", name: "Empty Clinic" },
        source: "operator_support",
      },
    });
    loadAccessMock.mockResolvedValue({
      clinicExists: true,
      activeMembership: null,
    });

    await expect(
      invitePracticeMemberAction(
        {},
        form({
          clinicId: "clinic_other",
          name: "New Admin",
          email: "new.admin@example.test",
          role: "ADMIN",
          platformRole: "OPERATOR",
        })
      )
    ).resolves.toEqual({ success: "Invitation sent." });

    expect(loadAccessMock).toHaveBeenCalledWith(
      { id: operator.id, platformRole: PlatformRole.OPERATOR },
      "clinic_empty"
    );
    expect(inviteMock).toHaveBeenCalledWith({
      clinicId: "clinic_empty",
      invitedByUserId: operator.id,
      name: "New Admin",
      email: "new.admin@example.test",
      role: "ADMIN",
      actorPlatformRole: PlatformRole.OPERATOR,
      operatorOverride: false,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/operator/clinics/clinic_empty/team"
    );
  });

  it("lets a clinic admin invite and ignores a posted clinic id", async () => {
    getAuthContextMock.mockResolvedValue({
      user: admin,
      clinicMembership: {
        membershipId: "membership_admin",
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_a", name: "Clinic A" },
        source: "membership",
      },
    });
    loadAccessMock.mockResolvedValue({
      clinicExists: true,
      activeMembership: {
        id: "membership_admin",
        role: ClinicMembershipRole.ADMIN,
      },
    });

    await expect(
      invitePracticeMemberAction(
        {},
        form({
          clinicId: "clinic_b",
          name: "New Staff",
          email: "new.staff@example.test",
          role: "STAFF",
        })
      )
    ).resolves.toEqual({ success: "Invitation sent." });

    expect(loadAccessMock).toHaveBeenCalledWith(
      { id: admin.id, platformRole: PlatformRole.NONE },
      "clinic_a"
    );
    expect(inviteMock).toHaveBeenCalledWith({
      clinicId: "clinic_a",
      invitedByUserId: admin.id,
      name: "New Staff",
      email: "new.staff@example.test",
      role: "STAFF",
      actorPlatformRole: PlatformRole.NONE,
      operatorOverride: false,
    });
    expect(revalidatePathMock).not.toHaveBeenCalledWith(
      "/operator/clinics/clinic_a/team"
    );
  });

  it("does not let clinic staff invite", async () => {
    getAuthContextMock.mockResolvedValue({
      user: staff,
      clinicMembership: {
        membershipId: "membership_staff",
        role: ClinicMembershipRole.STAFF,
        clinic: { id: "clinic_a", name: "Clinic A" },
        source: "membership",
      },
    });

    await expect(
      invitePracticeMemberAction(
        {},
        form({
          name: "Someone",
          email: "someone@example.test",
          role: "STAFF",
        })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(inviteMock).not.toHaveBeenCalled();
    expect(loadAccessMock).not.toHaveBeenCalled();
  });

  it("returns the existing duplicate-invitation message", async () => {
    getAuthContextMock.mockResolvedValue({
      user: admin,
      clinicMembership: {
        membershipId: "membership_admin",
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_a", name: "Clinic A" },
        source: "membership",
      },
    });
    loadAccessMock.mockResolvedValue({
      clinicExists: true,
      activeMembership: {
        id: "membership_admin",
        role: ClinicMembershipRole.ADMIN,
      },
    });
    inviteMock.mockResolvedValue({
      ok: false,
      code: "pending_same_clinic",
      error: PENDING_SAME_CLINIC_MESSAGE,
    });

    await expect(
      invitePracticeMemberAction(
        {},
        form({
          name: "Pending Person",
          email: "pending@example.test",
          role: "ADMIN",
        })
      )
    ).resolves.toEqual({ error: PENDING_SAME_CLINIC_MESSAGE });
  });

  it("rejects an operator platform role as the invited clinic role", async () => {
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: {
        membershipId: OPERATOR_SUPPORT_MEMBERSHIP_ID,
        role: ClinicMembershipRole.ADMIN,
        clinic: { id: "clinic_empty", name: "Empty Clinic" },
        source: "operator_support",
      },
    });
    loadAccessMock.mockResolvedValue({
      clinicExists: true,
      activeMembership: null,
    });

    const result = await invitePracticeMemberAction(
      {},
      form({
        name: "Not An Operator",
        email: "not.operator@example.test",
        role: "OPERATOR",
      })
    );
    expect(result.error).toBe("Please review the invitation details.");
    expect(result.fieldErrors?.role).toBeTruthy();
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it("does not hard-code plan numbers or call Stripe from the invite action", () => {
    const action = readFileSync(
      "app/(staff)/(clinic-portal)/practice/membership-actions.ts",
      "utf8"
    );
    const authorizer = readFileSync(
      "lib/clinic-portal/authorize-clinic-member-invite.ts",
      "utf8"
    );
    const invite = readFileSync("lib/operator/invite-clinic-user.ts", "utf8");
    for (const source of [action, authorizer, invite]) {
      expect(source).not.toContain("CommercialPlan");
      expect(source).not.toContain("overridePlanAllowance");
      expect(source).not.toMatch(/\/\s*2/);
      expect(source).not.toContain("seats used");
    }
    expect(action).not.toContain('from "@/lib/billing/checkout"');
    expect(action).not.toContain('from "@/lib/billing/prepare-offer"');
    expect(action).not.toContain("stripe");
    expect(authorizer).toContain('kind: "platform_operator"');
    expect(authorizer).toContain('kind: "clinic_admin"');
  });
});
