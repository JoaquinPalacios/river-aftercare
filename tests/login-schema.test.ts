import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loginSchema } from "@/app/(staff)/login/login-schema";
import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
} from "@/lib/auth/login-input";

function emailOfLength(length: number) {
  const domain = "example.com";
  const local = "a".repeat(length - domain.length - 1);
  return `${local}@${domain}`;
}

describe("loginSchema", () => {
  it("trims and lowercases email without changing the password", () => {
    const parsed = loginSchema.parse({
      email: "  Admin@Care-Guide.TEST  ",
      password: "  Secret Pass  ",
    });

    expect(parsed.email).toBe("admin@care-guide.test");
    expect(parsed.password).toBe("  Secret Pass  ");
  });

  it("accepts a one-character password", () => {
    const parsed = loginSchema.safeParse({
      email: "admin@care-guide.test",
      password: "a",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a 256-character password", () => {
    const parsed = loginSchema.safeParse({
      email: "admin@care-guide.test",
      password: "p".repeat(LOGIN_PASSWORD_MAX_LENGTH),
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a 257-character password", () => {
    const parsed = loginSchema.safeParse({
      email: "admin@care-guide.test",
      password: "p".repeat(LOGIN_PASSWORD_MAX_LENGTH + 1),
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    expect(parsed.error.flatten().fieldErrors.password?.[0]).toBe(
      "Password is too long."
    );
  });

  it("accepts a 254-character email", () => {
    const email = emailOfLength(LOGIN_EMAIL_MAX_LENGTH);
    const parsed = loginSchema.safeParse({
      email,
      password: "password",
    });

    expect(email).toHaveLength(LOGIN_EMAIL_MAX_LENGTH);
    expect(parsed.success).toBe(true);
  });

  it("rejects an email longer than 254 characters", () => {
    const email = emailOfLength(LOGIN_EMAIL_MAX_LENGTH + 1);
    const parsed = loginSchema.safeParse({
      email,
      password: "password",
    });

    expect(email.length).toBeGreaterThan(LOGIN_EMAIL_MAX_LENGTH);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    expect(parsed.error.flatten().fieldErrors.email?.[0]).toBe(
      "Email address is too long."
    );
  });

  it("does not introduce a 12-character login minimum", () => {
    const parsed = loginSchema.safeParse({
      email: "admin@care-guide.test",
      password: "short",
    });

    expect(parsed.success).toBe(true);
  });

  it("keeps login autocomplete and does not truncate passwords in the DOM", () => {
    const form = readFileSync("app/(staff)/login/login-form.tsx", "utf8");
    const field = readFileSync(
      "app/(staff)/components/password-visibility-field.tsx",
      "utf8"
    );

    expect(form).toContain('autoComplete="email"');
    expect(field).toContain('autoComplete = "current-password"');
    expect(field).toContain("autoComplete={autoComplete}");
    expect(form).not.toContain("maxLength");
    expect(field).not.toContain("maxLength");
  });
});
