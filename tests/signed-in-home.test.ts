import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

import { signedInHomePath } from "@/lib/auth/signed-in-home";

type AuthContext = Parameters<typeof signedInHomePath>[0];

function context(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    user: overrides.user ?? null,
    clinicMembership: overrides.clinicMembership ?? null,
  };
}

describe("signedInHomePath", () => {
  it("returns null for anonymous users", () => {
    expect(signedInHomePath(context())).toBeNull();
  });

  it("sends a platform operator with no membership to All Clinics", () => {
    expect(
      signedInHomePath(
        context({
          user: {
            id: "user_operator",
            email: "operator@local.aftercare.test",
            name: "Demo Operator",
            platformRole: PlatformRole.OPERATOR,
          },
        })
      )
    ).toBe("/operator/clinics");
  });

  it("sends a single-clinic user to the clinic dashboard", () => {
    expect(
      signedInHomePath(
        context({
          user: {
            id: "user_1",
            email: "admin@care-guide.test",
            name: "Demo Admin",
            platformRole: PlatformRole.NONE,
          },
          clinicMembership: {
            membershipId: "membership_1",
            role: ClinicMembershipRole.ADMIN,
            clinic: { id: "clinic_1", name: "Riverside Dental Demo" },
          },
        })
      )
    ).toBe("/dashboard");
  });

  it("prefers the clinic dashboard when an operator also has one membership", () => {
    expect(
      signedInHomePath(
        context({
          user: {
            id: "user_operator",
            email: "operator@local.aftercare.test",
            name: "Demo Operator",
            platformRole: PlatformRole.OPERATOR,
          },
          clinicMembership: {
            membershipId: "membership_1",
            role: ClinicMembershipRole.ADMIN,
            clinic: { id: "clinic_1", name: "Riverside Dental Demo" },
          },
        })
      )
    ).toBe("/dashboard");
  });

  it("returns null for an authenticated user with no membership and no operator role", () => {
    expect(
      signedInHomePath(
        context({
          user: {
            id: "user_none",
            email: "none@care-guide.test",
            name: "No Access",
            platformRole: PlatformRole.NONE,
          },
        })
      )
    ).toBeNull();
  });
});
