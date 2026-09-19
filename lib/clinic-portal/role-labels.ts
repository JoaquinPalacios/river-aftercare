import { ClinicMembershipRole } from "@prisma/client";

export const CLINIC_ADMIN_ROLE_LABEL = "Clinic admin";
export const CLINIC_STAFF_ROLE_LABEL = "Clinic staff";
export const PLATFORM_OPERATOR_ROLE_LABEL = "Platform operator";
export const TEAM_ADMIN_ROLE_LABEL = "Administrator";
export const TEAM_STAFF_ROLE_LABEL = "Staff";

export function clinicMembershipRoleLabel(role: ClinicMembershipRole): string {
  return role === ClinicMembershipRole.ADMIN
    ? CLINIC_ADMIN_ROLE_LABEL
    : CLINIC_STAFF_ROLE_LABEL;
}

export function teamMembershipRoleLabel(role: ClinicMembershipRole): string {
  return role === ClinicMembershipRole.ADMIN
    ? TEAM_ADMIN_ROLE_LABEL
    : TEAM_STAFF_ROLE_LABEL;
}
