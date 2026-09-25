export const CLINIC_MEMBERSHIP_ROLE = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
} as const;

export const CLINIC_MEMBERSHIP_ROLES = [
  CLINIC_MEMBERSHIP_ROLE.ADMIN,
  CLINIC_MEMBERSHIP_ROLE.STAFF,
] as const;

export type ClinicMembershipRoleName = (typeof CLINIC_MEMBERSHIP_ROLES)[number];
