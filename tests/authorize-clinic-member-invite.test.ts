import { ClinicMembershipRole, PlatformRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  decideClinicMemberInvite,
  type ClinicMemberInviteAuthority,
} from "@/lib/clinic-portal/authorize-clinic-member-invite";
import type {
  ClinicAccessDecision,
  ClinicActor,
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

function authority(
  actor: ClinicActor,
  access: ClinicAccessDecision,
  clinicId = "clinic_a"
): ClinicMemberInviteAuthority | null {
  return decideClinicMemberInvite({ actor, clinicId, access });
}

describe("decideClinicMemberInvite", () => {
  it("lets a clinic admin invite for their clinic without a seat count", () => {
    expect(authority(clinicAdmin, activeAdmin)).toEqual({
      kind: "clinic_admin",
      userId: "admin_1",
      clinicId: "clinic_a",
    });
  });

  it("refuses clinic staff", () => {
    expect(authority(clinicStaff, activeStaff)).toBeNull();
  });

  it("lets a platform operator invite without a clinic membership", () => {
    expect(authority(operator, noMembership)).toEqual({
      kind: "platform_operator",
      userId: "operator_1",
      clinicId: "clinic_a",
    });
  });

  it("keeps an operator on the operator branch even if a membership row exists", () => {
    expect(authority(operator, activeAdmin)).toEqual({
      kind: "platform_operator",
      userId: "operator_1",
      clinicId: "clinic_a",
    });
  });

  it("refuses a missing clinic for every actor", () => {
    expect(authority(clinicAdmin, missingClinic)).toBeNull();
    expect(authority(operator, missingClinic, "clinic_missing")).toBeNull();
  });

  it("does not authorize an admin who has no active membership on that clinic", () => {
    expect(authority(clinicAdmin, noMembership, "clinic_b")).toBeNull();
  });
});
