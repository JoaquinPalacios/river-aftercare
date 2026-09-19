import { describe, expect, it } from "vitest";

import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
  normalizeLoginEmail,
  PASSWORD_MAX_LENGTH,
} from "@/lib/auth/login-input";

describe("login input limits", () => {
  it("exposes the login email and resource-safety password bounds", () => {
    expect(LOGIN_EMAIL_MAX_LENGTH).toBe(254);
    expect(LOGIN_PASSWORD_MAX_LENGTH).toBe(256);
    expect(PASSWORD_MAX_LENGTH).toBe(256);
    expect(LOGIN_PASSWORD_MAX_LENGTH).toBe(PASSWORD_MAX_LENGTH);
  });

  it("normalizes login emails with trim and lowercase", () => {
    expect(normalizeLoginEmail("  Admin@Care-Guide.TEST  ")).toBe(
      "admin@care-guide.test"
    );
  });
});
