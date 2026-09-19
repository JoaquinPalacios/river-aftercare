import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const FORBIDDEN_INVITE_PATHS = [
  "app/(staff)/invite",
  "app/api/auth/invite",
  "app/(staff)/(operator)/operator/invite",
];

const PASSWORD_MANAGEMENT_PATHS = [
  "app/(staff)/forgot-password",
  "app/(staff)/reset-password",
  "app/(staff)/account/security",
  "app/api/auth/forgot-password",
  "app/api/auth/reset-password",
];

const SERVER_ONLY_FILES = [
  "lib/auth/account-token.ts",
  "lib/auth/account-token-service.ts",
  "lib/auth/change-password.ts",
  "lib/auth/request-password-reset.ts",
  "lib/auth/reset-password.ts",
  "lib/auth/password-lifecycle-log.ts",
  "lib/email/resend-api-key.ts",
  "lib/email/transactional-mailer.ts",
  "lib/email/auth-email.ts",
  "lib/email/password-reset-mail.ts",
  "lib/marketing/contact-mailer.ts",
  "lib/marketing/contact-config.ts",
];

const CLIENT_FILES = [
  "app/(marketing)/components/contact-form.tsx",
  "app/(marketing)/components/contact-turnstile.tsx",
  "app/(staff)/login/login-form.tsx",
  "app/(staff)/forgot-password/forgot-password-form.tsx",
  "app/(staff)/reset-password/reset-password-form.tsx",
  "app/(staff)/account/security/change-password-form.tsx",
  "lib/marketing/contact-fields.ts",
  "lib/marketing/contact-turnstile-public.ts",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("account lifecycle password-management boundary", () => {
  it("adds password management without invitation UI", () => {
    for (const path of PASSWORD_MANAGEMENT_PATHS) {
      expect(existsSync(path), path).toBe(true);
    }
    for (const path of FORBIDDEN_INVITE_PATHS) {
      expect(existsSync(path), path).toBe(false);
    }

    const files = walk("app").filter((path) => /\.(ts|tsx)$/.test(path));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("createInvitationToken");
      expect(source, file).not.toContain("Invite user");
      expect(source, file).not.toMatch(/\/invite\b/);
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
