import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  canAccessClinic,
  canManageClinic,
  canManageClinicBranding,
  canManageClinicGuides,
  canManageClinicMembers,
  type ClinicAccessDecision,
  type ClinicActor,
} from "@/lib/auth/clinic-authorization";

const clinicAdmin: ClinicActor = {
  id: "admin_1",
  platformRole: PlatformRole.NONE,
};
const clinicStaff: ClinicActor = {
  id: "staff_1",
  platformRole: PlatformRole.NONE,
};
const operator: ClinicActor = {
  id: "operator_1",
  platformRole: PlatformRole.OPERATOR,
};

const missingClinic: ClinicAccessDecision = {
  clinicExists: false,
  activeMembership: null,
};
const noMembership: ClinicAccessDecision = {
  clinicExists: true,
  activeMembership: null,
};
const activeAdmin: ClinicAccessDecision = {
  clinicExists: true,
  activeMembership: { id: "m_admin", role: ClinicMembershipRole.ADMIN },
};
const activeStaff: ClinicAccessDecision = {
  clinicExists: true,
  activeMembership: { id: "m_staff", role: ClinicMembershipRole.STAFF },
};

describe("clinic authorization helpers", () => {
  it("denies missing clinics", () => {
    expect(canAccessClinic(clinicAdmin, missingClinic)).toBe(false);
    expect(canManageClinic(operator, missingClinic)).toBe(false);
  });

  it("treats inactive or missing membership as no clinic access", () => {
    expect(canAccessClinic(clinicStaff, noMembership)).toBe(false);
    expect(canAccessClinic(clinicAdmin, noMembership)).toBe(false);
    expect(canManageClinic(clinicAdmin, noMembership)).toBe(false);
  });

  it("lets active STAFF access but not manage clinic-owned settings", () => {
    expect(canAccessClinic(clinicStaff, activeStaff)).toBe(true);
    expect(canManageClinic(clinicStaff, activeStaff)).toBe(false);
    expect(canManageClinicMembers(clinicStaff, activeStaff)).toBe(false);
  });

  it("lets active ADMIN manage clinic-owned resources", () => {
    expect(canAccessClinic(clinicAdmin, activeAdmin)).toBe(true);
    expect(canManageClinic(clinicAdmin, activeAdmin)).toBe(true);
    expect(canManageClinicBranding(clinicAdmin, activeAdmin)).toBe(true);
    expect(canManageClinicMembers(clinicAdmin, activeAdmin)).toBe(true);
    expect(canManageClinicGuides(clinicAdmin, activeAdmin)).toBe(true);
  });

  it("lets platform operators manage an existing clinic without a membership", () => {
    expect(canAccessClinic(operator, noMembership)).toBe(true);
    expect(canManageClinic(operator, noMembership)).toBe(true);
    expect(canManageClinicBranding(operator, noMembership)).toBe(true);
    expect(canManageClinicMembers(operator, noMembership)).toBe(true);
    expect(canManageClinicGuides(operator, noMembership)).toBe(true);
  });
});
