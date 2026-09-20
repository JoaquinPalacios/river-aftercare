import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("operator client-support security boundaries", () => {
  it("does not let operators set another user's password", () => {
    const membership = readFileSync(
      "lib/clinic-portal/update-clinic-membership-status.ts",
      "utf8"
    );
    const teamActions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions.ts",
      "utf8"
    );
    const practiceMembers = readFileSync(
      "app/(staff)/(clinic-portal)/practice/membership-actions.ts",
      "utf8"
    );
    const profile = readFileSync("lib/auth/update-own-profile.ts", "utf8");
    const password = readFileSync("lib/auth/change-password.ts", "utf8");

    expect(membership).not.toContain("passwordHash");
    expect(membership).not.toContain("hashPassword");
    expect(teamActions).not.toContain("passwordHash");
    expect(practiceMembers).not.toContain("passwordHash");
    expect(profile).toContain("id: input.userId");
    expect(password).toContain("id: input.userId");
    expect(password).toContain("verifyPassword");
  });

  it("uses central clinic authorization instead of scattered OPERATOR checks in practice UI", () => {
    const practiceActions = readFileSync(
      "app/(staff)/(clinic-portal)/practice/actions.ts",
      "utf8"
    );
    const guideActions = readFileSync(
      "app/(staff)/(clinic-portal)/guides/actions.ts",
      "utf8"
    );
    const authz = readFileSync("lib/auth/clinic-authorization.ts", "utf8");
    expect(authz).toContain("canManageClinic");
    expect(authz).toContain("canManageClinicMembers");
    expect(authz).toContain("canManageClinicGuides");
    expect(practiceActions).toContain("requireClinicAdmin");
    expect(guideActions).toContain("requireClinicAdmin");
    expect(practiceActions).not.toContain('formData.get("clinicId")');
    expect(guideActions).not.toContain('formData.get("clinicId")');
  });
});
