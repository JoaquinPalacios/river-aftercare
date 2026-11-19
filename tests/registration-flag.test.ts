import { describe, expect, it } from "vitest";

import { isRegistrationEnabled } from "@/lib/auth/registration-flag";

function env(value?: string): NodeJS.ProcessEnv {
  const next = value === undefined ? {} : { REGISTRATION_ENABLED: value };
  return next as unknown as NodeJS.ProcessEnv;
}

describe("registration feature flag", () => {
  it("stays off unless the server variable is exactly true", () => {
    expect(isRegistrationEnabled(env())).toBe(false);
    expect(isRegistrationEnabled(env(""))).toBe(false);
    expect(isRegistrationEnabled(env("false"))).toBe(false);
    expect(isRegistrationEnabled(env("1"))).toBe(false);
    expect(isRegistrationEnabled(env(" TRUE "))).toBe(true);
  });
});
