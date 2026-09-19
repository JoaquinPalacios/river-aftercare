import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const FORBIDDEN_PATHS = [
  "app/(staff)/forgot-password",
  "app/(staff)/reset-password",
  "app/(staff)/invite",
  "app/(staff)/change-password",
  "app/api/auth/forgot-password",
  "app/api/auth/reset-password",
  "app/api/auth/invite",
  "app/api/auth/change-password",
];

const SERVER_ONLY_FILES = [
  "lib/auth/account-token.ts",
  "lib/auth/account-token-service.ts",
  "lib/email/resend-api-key.ts",
  "lib/email/transactional-mailer.ts",
  "lib/email/auth-email.ts",
  "lib/marketing/contact-mailer.ts",
  "lib/marketing/contact-config.ts",
];

const CLIENT_FILES = [
  "app/(marketing)/components/contact-form.tsx",
  "app/(marketing)/components/contact-turnstile.tsx",
  "app/(staff)/login/login-form.tsx",
  "lib/marketing/contact-fields.ts",
  "lib/marketing/contact-turnstile-public.ts",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("account lifecycle foundation boundary", () => {
  it("does not add user-facing auth lifecycle routes or mutations", () => {
    for (const path of FORBIDDEN_PATHS) {
      expect(existsSync(path), path).toBe(false);
    }

    const files = walk("app").filter((path) => /\.(ts|tsx)$/.test(path));

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/forgot-password/);
      expect(source, file).not.toMatch(/reset-password/);
      expect(source, file).not.toMatch(/change-password/);
      expect(source, file).not.toContain("@/lib/auth/account-token-service");
      expect(source, file).not.toContain("@/lib/email/auth-email");
      expect(source, file).not.toContain("createInvitationToken");
      expect(source, file).not.toContain("createPasswordResetToken");
      expect(source, file).not.toContain("sendAuthTransactionalEmail");
    }

    const libFiles = walk("lib").filter((path) => /\.(ts|tsx)$/.test(path));
    for (const file of libFiles) {
      if (
        file === "lib/auth/account-token-service.ts" ||
        file === "lib/email/auth-email.ts"
      ) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("@/lib/auth/account-token-service");
      expect(source, file).not.toContain("createInvitationToken");
      expect(source, file).not.toContain("createPasswordResetToken");
      expect(source, file).not.toContain("sendAuthTransactionalEmail");
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
