import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

describe("shared login copy", () => {
  const loginPage = readFileSync("app/(staff)/login/page.tsx", "utf8");
  const loginForm = readFileSync("app/(staff)/login/login-form.tsx", "utf8");
  const appRoot = readFileSync("app/(staff)/page.tsx", "utf8");

  it("uses role-neutral heading, description, and metadata", () => {
    expect(loginPage).toMatch(/<h1[^>]*>\s*Sign in\s*<\/h1>/);
    expect(loginPage).toContain(
      "Use your email and password to continue to {PRODUCT_NAME}."
    );
    expect(loginPage).toContain("`Sign in · ${PRODUCT_NAME}`");
    expect(loginPage).toContain("`Sign in to ${PRODUCT_NAME}.`");
    expect(loginPage).toContain("PRIVATE_ROBOTS");
    expect(loginPage).not.toContain("Staff sign in");
    expect(loginPage).not.toContain("clinic portal");
    expect(loginPage).not.toContain("Clinic portal");
    expect(loginPage).not.toContain("Operator sign in");
    expect(loginForm).not.toContain("Operator sign in");
    expect(loginForm).not.toContain("Clinic sign in");
    expect(PRODUCT_NAME).toBe("River Aftercare");
    expect(PRIVATE_ROBOTS).toEqual({ index: false, follow: false });
  });

  it("keeps one shared login without a dead password-reset link", () => {
    expect(loginPage).toContain("<LoginForm />");
    expect(loginPage).not.toContain('href="/login/operator"');
    expect(loginPage).not.toContain('href="/operator/login"');
    expect(loginForm).not.toContain("Forgot password");
    expect(loginForm).not.toContain("Reset password");
    expect(appRoot).not.toContain("Staff sign in");
    expect(appRoot).not.toContain("Clinic portal");
  });

  it("does not add a second operator credentials path", () => {
    const loginRoute = readFileSync("app/api/auth/login/route.ts", "utf8");
    expect(loginRoute).toContain("export async function POST");
    expect(loginRoute).toContain("postLoginPath");
    expect(loginForm).toContain('fetch("/api/auth/login"');
    expect(loginForm).not.toContain("/api/auth/operator");
  });
});
