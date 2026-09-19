import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SERVER_ONLY_FILES = [
  "lib/auth/account-token.ts",
  "lib/auth/account-token-service.ts",
  "lib/auth/change-password.ts",
  "lib/auth/request-password-reset.ts",
  "lib/auth/reset-password.ts",
  "lib/auth/accept-invitation.ts",
  "lib/auth/password-lifecycle-log.ts",
  "lib/auth/invitation-lifecycle-log.ts",
  "lib/email/resend-api-key.ts",
  "lib/email/transactional-mailer.ts",
  "lib/email/auth-email.ts",
  "lib/email/password-reset-mail.ts",
  "lib/email/invitation-mail.ts",
  "lib/operator/invite-clinic-user.ts",
  "lib/operator/resend-clinic-invitation.ts",
  "lib/operator/cancel-clinic-invitation.ts",
  "lib/operator/remove-clinic-access.ts",
  "lib/operator/list-clinic-team.ts",
  "lib/operator/deliver-clinic-invitation-email.ts",
  "lib/marketing/contact-mailer.ts",
  "lib/marketing/contact-config.ts",
];

const CLIENT_FILES = [
  "app/(marketing)/components/contact-form.tsx",
  "app/(marketing)/components/contact-turnstile.tsx",
  "app/(staff)/login/login-form.tsx",
  "app/(staff)/forgot-password/forgot-password-form.tsx",
  "app/(staff)/reset-password/reset-password-form.tsx",
  "app/(staff)/accept-invitation/accept-invitation-form.tsx",
  "app/(staff)/account/security/change-password-form.tsx",
  "app/(staff)/(operator)/operator/clinics/[clinicId]/team/invite-user-form.tsx",
  "app/(staff)/(operator)/operator/clinics/[clinicId]/team/team-table.tsx",
  "lib/marketing/contact-fields.ts",
  "lib/marketing/contact-turnstile-public.ts",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("account lifecycle invitation boundary", () => {
  it("adds operator invitation UI without clinic-admin Team permissions", () => {
    expect(existsSync("app/(staff)/accept-invitation")).toBe(true);
    expect(existsSync("app/api/auth/accept-invitation")).toBe(true);
    expect(
      existsSync("app/(staff)/(operator)/operator/clinics/[clinicId]/team")
    ).toBe(true);

    const clinicPortal = walk("app/(staff)/(clinic-portal)").filter((path) =>
      /\.(ts|tsx)$/.test(path)
    );
    for (const file of clinicPortal) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("inviteClinicUser");
      expect(source, file).not.toContain("Invite user");
      expect(source, file).not.toContain("createInvitationToken");
    }
  });

  it("keeps token and mail helpers server-only and secrets out of client modules", () => {
    for (const file of SERVER_ONLY_FILES) {
      expect(readFileSync(file, "utf8"), file).toContain(
        'import "server-only"'
      );
    }

    for (const file of CLIENT_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("RESEND_API_KEY");
      expect(source, file).not.toContain("AUTH_EMAIL_FROM");
      expect(source, file).not.toContain("AUTH_EMAIL_REPLY_TO");
      expect(source, file).not.toContain("generateAccountToken");
      expect(source, file).not.toContain("hashAccountToken");
      expect(source, file).not.toContain("account-token-service");
      expect(source, file).not.toContain("transactional-mailer");
      expect(source, file).not.toContain("passwordHash");
      expect(source, file).not.toContain("tokenHash");
    }
  });

  it("does not reuse Auth.js VerificationToken for account lifecycle", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("model AccountToken");
    expect(schema).toContain("model VerificationToken");
    expect(schema).toContain("enum AccountTokenType");
    expect(
      readFileSync("lib/auth/account-token-service.ts", "utf8")
    ).not.toContain("verificationToken");
  });
});
