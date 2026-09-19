import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("clinic invitation UI contracts", () => {
  it("keeps operator Team mutations behind requirePlatformOperator", () => {
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions.ts",
      "utf8"
    );
    const teamPage = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/page.tsx",
      "utf8"
    );
    const invitePage = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/invite/page.tsx",
      "utf8"
    );
    expect(actions).toContain("requirePlatformOperator");
    expect(actions).toContain("isStaffAppHost");
    expect(actions).not.toContain("requireClinicAdmin");
    expect(teamPage).toContain("requirePlatformOperator");
    expect(invitePage).toContain("requirePlatformOperator");
    expect(invitePage).not.toContain('formData.get("platformRole")');
    expect(actions).not.toContain("passwordHash");
  });

  it("keeps the invitation token in a fragment and out of storage", () => {
    const form = readFileSync(
      "app/(staff)/accept-invitation/accept-invitation-form.tsx",
      "utf8"
    );
    const page = readFileSync("app/(staff)/accept-invitation/page.tsx", "utf8");
    expect(form).toContain("readAccountTokenFromHash");
    expect(form).toContain("window.location.hash");
    expect(form).toContain('fetch("/api/auth/accept-invitation"');
    expect(form).toContain("history.replaceState");
    expect(form).toContain("/login?invite=success");
    expect(form).not.toContain("localStorage");
    expect(form).not.toContain("sessionStorage");
    expect(form).not.toContain("searchParams");
    expect(page).not.toContain("searchParams");
    expect(page).not.toContain("[token]");
  });

  it("does not serialize password or token hashes in team queries", () => {
    const list = readFileSync("lib/operator/list-clinic-team.ts", "utf8");
    expect(list).not.toContain("tokenHash");
    expect(list).not.toContain("rawToken");
    expect(list).toContain('status: "active"');
    expect(list).toContain("expired");
    expect(list).toContain("pending");
  });

  it("does not expose Remove access until restore-access exists", () => {
    const table = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/team-table.tsx",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions.ts",
      "utf8"
    );
    const inviteForm = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/invite-user-form.tsx",
      "utf8"
    );
    expect(table).not.toContain("Remove access");
    expect(table).not.toContain("removeClinicAccessAction");
    expect(table).not.toContain("ConfirmDialog");
    expect(actions).not.toContain("removeClinicAccess");
    expect(actions).not.toContain("removeClinicAccessAction");
    expect(inviteForm).not.toContain("Remove access");
    expect(actions).toContain("inviteClinicUserAction");
    expect(actions).toContain("resendClinicInvitationAction");
    expect(actions).toContain("cancelClinicInvitationAction");
  });
});
