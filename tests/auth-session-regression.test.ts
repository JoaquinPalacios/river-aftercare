import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("auth session regressions", () => {
  it("login still creates a database session after a successful credential check", () => {
    const source = readFileSync("app/api/auth/login/route.ts", "utf8");
    expect(source).toContain("createDatabaseSession");
    expect(source).toContain("AUTH_SESSION_COOKIE_NAME");
    expect(source).not.toContain("Turnstile");
    expect(source).not.toContain("rateLimit");
    expect(source).not.toContain("AUTH_EMAIL_FROM");
  });

  it("logout still deletes the database session and clears the cookie", () => {
    const source = readFileSync("app/api/auth/logout/route.ts", "utf8");
    expect(source).toContain("deleteDatabaseSession");
    expect(source).toContain("AUTH_SESSION_COOKIE_NAME");
  });

  it("Auth.js still reads database sessions with no extra login provider", () => {
    const source = readFileSync("auth.ts", "utf8");
    expect(source).toContain('strategy: "database"');
    expect(source).toContain("providers: []");
    expect(source).toContain("session({ session, user })");
  });

  it("leaves host enforcement in proxy.ts rather than the login route", () => {
    const login = readFileSync("app/api/auth/login/route.ts", "utf8");
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(login).not.toContain("parseHostname");
    expect(proxy).toContain("isStaffPath");
    expect(proxy).toContain('classification.kind === "staff"');
  });
});
