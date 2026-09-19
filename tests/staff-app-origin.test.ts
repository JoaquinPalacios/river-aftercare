import { afterEach, describe, expect, it } from "vitest";

import {
  buildPasswordResetUrl,
  isStaffAppHost,
  isTrustedStaffAuthMutationRequest,
  staffAppOrigin,
} from "@/lib/tenancy/staff-app-origin";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("staff app origin", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
  });

  it("derives the production staff origin from the root domain", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "riveraftercare.com.au";
    expect(staffAppOrigin()).toBe("https://app.riveraftercare.com.au");
    expect(buildPasswordResetUrl("abc_token")).toBe(
      "https://app.riveraftercare.com.au/reset-password#token=abc_token"
    );
    expect(buildPasswordResetUrl("abc_token")).not.toContain("?token=");
    expect(buildPasswordResetUrl("abc_token")).not.toContain(
      "/reset-password/abc_token"
    );
  });

  it("uses http for localhost staff origin", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    expect(staffAppOrigin()).toBe("http://app.localhost");
    expect(isStaffAppHost("app.localhost:3000")).toBe(true);
    expect(isStaffAppHost("localhost:3000")).toBe(false);
    expect(isStaffAppHost("demodental.localhost:3000")).toBe(false);
  });

  it("does not trust Host or Origin from a non-staff request", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const evil = new Request("http://evil.example/api/auth/forgot-password", {
      method: "POST",
      headers: {
        host: "evil.example",
        origin: "http://evil.example",
      },
    });
    expect(isTrustedStaffAuthMutationRequest(evil)).toBe(false);

    const staff = new Request(
      "http://app.localhost:3000/api/auth/forgot-password",
      {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
        },
      }
    );
    expect(isTrustedStaffAuthMutationRequest(staff)).toBe(true);
  });
});
