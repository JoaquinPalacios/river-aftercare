export const TEAM_STATUS = {
  INVITATION_SENT: "invitation-sent",
  ACCESS_RESTORED: "access-restored",
  ACCESS_REMOVED: "access-removed",
} as const;

export type TeamStatusFlag = (typeof TEAM_STATUS)[keyof typeof TEAM_STATUS];

const TEAM_STATUS_MESSAGES: Record<TeamStatusFlag, string> = {
  [TEAM_STATUS.INVITATION_SENT]: "Invitation sent.",
  [TEAM_STATUS.ACCESS_RESTORED]: "Access restored.",
  [TEAM_STATUS.ACCESS_REMOVED]: "Access removed.",
};

export function clinicTeamPath(clinicId: string): string {
  return `/operator/clinics/${clinicId}/team`;
}

export function clinicTeamStatusPath(
  clinicId: string,
  status: TeamStatusFlag
): string {
  return `${clinicTeamPath(clinicId)}?status=${status}`;
}

export function teamStatusMessage(
  value: string | string[] | undefined
): string | null {
  const flag = Array.isArray(value) ? value[0] : value;
  if (!flag || !(flag in TEAM_STATUS_MESSAGES)) {
    return null;
  }
  return TEAM_STATUS_MESSAGES[flag as TeamStatusFlag];
}
