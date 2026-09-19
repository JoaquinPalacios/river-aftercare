import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("password management UI contracts", () => {
  it("keeps account security behind any authenticated user", () => {
    const page = readFileSync("app/(staff)/account/security/page.tsx", "utf8");
    const layout = readFileSync("app/(staff)/account/layout.tsx", "utf8");
    const action = readFileSync(
      "app/(staff)/account/security/actions.ts",
      "utf8"
    );
    expect(page).toContain("Account security");
    expect(page).toContain("Change password");
    expect(page).toContain("requireAuthenticatedUser");
    expect(page).not.toContain("requireStaffSession");
    expect(page).not.toContain("requirePlatformOperator");
    expect(layout).toContain("requireAuthenticatedUser");
    expect(layout).toContain("OperatorAccountChrome");
    expect(layout).toContain("PortalChrome");
    expect(action).toContain("requireAuthenticatedUser");
    expect(action).toContain("isStaffAppHost");
  });

  it("links account security from operator and clinic shells", () => {
    const panel = readFileSync(
      "app/(staff)/components/staff-account-panel.tsx",
      "utf8"
    );
    const chrome = readFileSync(
      "app/(staff)/components/portal-chrome.tsx",
      "utf8"
    );
    const operator = readFileSync(
      "app/(staff)/components/operator-account-chrome.tsx",
      "utf8"
    );
    expect(panel).toContain('href="/account/security"');
    expect(panel).toContain("Account security");
    expect(chrome).toContain("StaffAccountPanel");
    expect(operator).toContain("StaffAccountPanel");
    expect(chrome).not.toContain("Invite user");
    expect(operator).not.toContain("Invite user");
  });

  it("keeps the reset token in a fragment and out of storage", () => {
    const form = readFileSync(
      "app/(staff)/reset-password/reset-password-form.tsx",
      "utf8"
    );
    const page = readFileSync("app/(staff)/reset-password/page.tsx", "utf8");
    expect(form).toContain("readPasswordResetTokenFromHash");
    expect(form).toContain("window.location.hash");
    expect(form).toContain('fetch("/api/auth/reset-password"');
    expect(form).toContain("history.replaceState");
    expect(form).not.toContain("localStorage");
    expect(form).not.toContain("sessionStorage");
    expect(form).not.toContain("searchParams");
    expect(page).not.toContain("searchParams");
    expect(page).not.toContain("[token]");
  });

  it("maps fixed login reset and invite flags rather than arbitrary message query text", () => {
    const login = readFileSync("app/(staff)/login/page.tsx", "utf8");
    expect(login).toContain('resetParam === "success"');
    expect(login).toContain('inviteParam === "success"');
    expect(login).toContain("PASSWORD_RESET_SUCCESS_MESSAGE");
    expect(login).toContain("INVITATION_READY_MESSAGE");
    expect(login).not.toContain("params.message");
    expect(login).not.toContain("searchParams.message");
  });

  it("does not add Turnstile to login or forgot-password", () => {
    const forgot = readFileSync("app/(staff)/forgot-password/page.tsx", "utf8");
    const loginForm = readFileSync("app/(staff)/login/login-form.tsx", "utf8");
    expect(forgot).toContain("Forgot your password?");
    expect(forgot).toContain("if an eligible account exists");
    expect(forgot).not.toContain("Turnstile");
    expect(loginForm).not.toContain("Turnstile");
    expect(loginForm).not.toContain("Invite");
  });
});
