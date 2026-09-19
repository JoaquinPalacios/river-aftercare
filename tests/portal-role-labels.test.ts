import { ClinicMembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  CLINIC_ADMIN_ROLE_LABEL,
  CLINIC_STAFF_ROLE_LABEL,
  PLATFORM_OPERATOR_ROLE_LABEL,
  TEAM_ADMIN_ROLE_LABEL,
  TEAM_STAFF_ROLE_LABEL,
  clinicMembershipRoleLabel,
  teamMembershipRoleLabel,
} from "@/lib/clinic-portal/role-labels";

describe("portal role labels", () => {
  it("uses clinic-facing labels instead of raw ADMIN/STAFF enums", () => {
    expect(clinicMembershipRoleLabel(ClinicMembershipRole.ADMIN)).toBe(
      CLINIC_ADMIN_ROLE_LABEL
    );
    expect(clinicMembershipRoleLabel(ClinicMembershipRole.STAFF)).toBe(
      CLINIC_STAFF_ROLE_LABEL
    );
    expect(CLINIC_ADMIN_ROLE_LABEL).toBe("Clinic admin");
    expect(CLINIC_STAFF_ROLE_LABEL).toBe("Clinic staff");
    expect(PLATFORM_OPERATOR_ROLE_LABEL).toBe("Platform operator");
  });

  it("uses Administrator / Staff labels for operator Team", () => {
    expect(teamMembershipRoleLabel(ClinicMembershipRole.ADMIN)).toBe(
      TEAM_ADMIN_ROLE_LABEL
    );
    expect(teamMembershipRoleLabel(ClinicMembershipRole.STAFF)).toBe(
      TEAM_STAFF_ROLE_LABEL
    );
    expect(TEAM_ADMIN_ROLE_LABEL).toBe("Administrator");
    expect(TEAM_STAFF_ROLE_LABEL).toBe("Staff");
  });
});
