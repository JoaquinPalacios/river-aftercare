import { describe, expect, it } from "vitest";

import {
  clinicTeamStatusPath,
  TEAM_STATUS,
  teamStatusMessage,
} from "@/lib/operator/clinic-team-status";

describe("clinic team status flags", () => {
  it("maps known flags to fixed copy without PII", () => {
    expect(teamStatusMessage(TEAM_STATUS.INVITATION_SENT)).toBe(
      "Invitation sent."
    );
    expect(teamStatusMessage(TEAM_STATUS.ACCESS_RESTORED)).toBe(
      "Access restored."
    );
    expect(teamStatusMessage(TEAM_STATUS.ACCESS_REMOVED)).toBe(
      "Access removed."
    );
    expect(teamStatusMessage("anything-else")).toBeNull();
    expect(teamStatusMessage(["invitation-sent", "extra"])).toBe(
      "Invitation sent."
    );
    expect(
      clinicTeamStatusPath("clinic_1", TEAM_STATUS.INVITATION_SENT)
    ).toBe("/operator/clinics/clinic_1/team?status=invitation-sent");
    expect(
      clinicTeamStatusPath("clinic_1", TEAM_STATUS.INVITATION_SENT)
    ).not.toContain("@");
  });
});
