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
    const statusRoute = readFileSync(
      "app/api/auth/invitation-status/route.ts",
      "utf8"
    );
    expect(form).toContain("readAccountTokenFromHash");
    expect(form).toContain("window.location.hash");
    expect(form).toContain('fetch("/api/auth/invitation-status"');
    expect(form).toContain('fetch("/api/auth/accept-invitation"');
    expect(form).toContain("CHECKING");
    expect(form).toContain("Checking invitation…");
    expect(form).toContain("history.replaceState");
    expect(form).toContain("/login?invite=success");
    expect(form).not.toContain("localStorage");
    expect(form).not.toContain("sessionStorage");
    expect(form).not.toContain("searchParams");
    expect(page).not.toContain("searchParams");
    expect(page).not.toContain("[token]");
    expect(statusRoute).toContain("isTrustedStaffAuthMutationRequest");
    expect(statusRoute).not.toContain("console.");
    expect(statusRoute).not.toContain("searchParams");
  });

  it("does not serialize password or token hashes in team queries", () => {
    const list = readFileSync("lib/operator/list-clinic-team.ts", "utf8");
    expect(list).not.toContain("tokenHash");
    expect(list).not.toContain("rawToken");
    expect(list).toContain('status: "active"');
    expect(list).toContain("expired");
    expect(list).toContain("pending");
  });

  it("exposes Remove access with ConfirmDialog for active members", () => {
    const table = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/team-table.tsx",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions.ts",
      "utf8"
    );
    expect(table).toContain("Remove access");
    expect(table).toContain("removeClinicAccessAction");
    expect(table).toContain("ConfirmDialog");
    expect(table).toContain("OverflowMenu");
    expect(table).toContain("Resend invitation");
    expect(table).toContain("Cancel invitation");
    expect(actions).toContain("removeClinicAccessAction");
    expect(actions).toContain("inviteClinicUserAction");
    expect(actions).toContain("resendClinicInvitationAction");
    expect(actions).toContain("cancelClinicInvitationAction");
  });

  it("keeps the send-invitation pending spinner as a flex sibling of Sending…", () => {
    const inviteForm = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/invite-user-form.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(inviteForm).toContain("staffLoginSubmit");
    expect(inviteForm).toContain("staffLoginSpinner");
    expect(inviteForm).toContain("Sending…");
    expect(inviteForm).toContain("aria-busy={pending || undefined}");
    expect(inviteForm).toContain("disabled={pending}");
    expect(inviteForm).toContain("Sending invitation. Please wait.");
    expect(inviteForm).not.toContain("position: absolute");
    expect(css).toContain(".staffLoginSubmit");
    expect(css).toContain("gap: 0.5rem");
    expect(css).toContain(".staffLoginSpinner");
    expect(css).toContain("flex: 0 0 auto");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("redirects successful invites with a fixed status flag", () => {
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions.ts",
      "utf8"
    );
    const teamPage = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/team/page.tsx",
      "utf8"
    );
    expect(actions).toContain("TEAM_STATUS.INVITATION_SENT");
    expect(actions).toContain("TEAM_STATUS.ACCESS_RESTORED");
    expect(actions).toContain("TEAM_STATUS.ACCESS_REMOVED");
    expect(actions).not.toContain("Invitation sent to");
    expect(teamPage).toContain("teamStatusMessage");
    expect(teamPage).toContain("TeamStatusBanner");
  });
});
