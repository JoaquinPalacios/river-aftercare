import { afterEach, describe, expect, it } from "vitest";

import {
  buildEmailChangeUrl,
  buildInvitationUrl,
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
  const previousMetadataBase = process.env.CARE_GUIDE_METADATA_BASE;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousPort = process.env.PORT;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    restore("CARE_GUIDE_METADATA_BASE", previousMetadataBase);
    restore("VERCEL_ENV", previousVercelEnv);
    restore("PORT", previousPort);
  });

  it("derives the production staff origin from the root domain", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "riveraftercare.com.au";
    process.env.VERCEL_ENV = "production";
    process.env.PORT = "3000";
    process.env.CARE_GUIDE_METADATA_BASE = "http://localhost:3000";
    expect(staffAppOrigin()).toBe("https://app.riveraftercare.com.au");
    expect(buildPasswordResetUrl("abc_token")).toBe(
      "https://app.riveraftercare.com.au/reset-password#token=abc_token"
    );
    expect(buildInvitationUrl("abc_token")).toBe(
      "https://app.riveraftercare.com.au/accept-invitation#token=abc_token"
    );
    expect(buildEmailChangeUrl("abc_token")).toBe(
      "https://app.riveraftercare.com.au/confirm-email-change#token=abc_token"
    );
    expect(staffAppOrigin()).not.toContain(":3000");
    expect(buildInvitationUrl("abc_token")).not.toContain("?token=");
    expect(buildInvitationUrl("abc_token")).not.toContain(
      "/accept-invitation/abc_token"
    );
    expect(buildPasswordResetUrl("abc_token")).not.toContain("?token=");
    expect(buildPasswordResetUrl("abc_token")).not.toContain(
      "/reset-password/abc_token"
    );
  });

  it("keeps preview staff origins on https without a local port", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "preview.riveraftercare.com.au";
    process.env.VERCEL_ENV = "preview";
    process.env.PORT = "3000";
    process.env.CARE_GUIDE_METADATA_BASE = "http://localhost:3000";
    expect(staffAppOrigin()).toBe("https://app.preview.riveraftercare.com.au");
    expect(buildInvitationUrl("abc_token")).toBe(
      "https://app.preview.riveraftercare.com.au/accept-invitation#token=abc_token"
    );
    expect(buildPasswordResetUrl("abc_token")).toBe(
      "https://app.preview.riveraftercare.com.au/reset-password#token=abc_token"
    );
    expect(buildInvitationUrl("abc_token")).not.toContain(":3000");
    expect(buildPasswordResetUrl("abc_token")).not.toContain(":3000");
  });

  it("uses http and port 3000 for the local staff origin", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.VERCEL_ENV;
    delete process.env.CARE_GUIDE_METADATA_BASE;
    process.env.PORT = "4000";
    expect(staffAppOrigin()).toBe("http://app.localhost:3000");
    expect(buildInvitationUrl("abc_token")).toBe(
      "http://app.localhost:3000/accept-invitation#token=abc_token"
    );
    expect(buildPasswordResetUrl("abc_token")).toBe(
      "http://app.localhost:3000/reset-password#token=abc_token"
    );
    expect(buildInvitationUrl("abc_token")).not.toContain("?token=");
    expect(buildPasswordResetUrl("abc_token")).not.toContain("?token=");
    expect(isStaffAppHost("app.localhost:3000")).toBe(true);
    expect(isStaffAppHost("localhost:3000")).toBe(false);
    expect(isStaffAppHost("demodental.localhost:3000")).toBe(false);
  });

  it("uses the port from a configured local development origin", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.VERCEL_ENV;
    process.env.CARE_GUIDE_METADATA_BASE = "http://localhost:4173";
    expect(staffAppOrigin()).toBe("http://app.localhost:4173");
    expect(buildInvitationUrl("abc_token")).toBe(
      "http://app.localhost:4173/accept-invitation#token=abc_token"
    );
    expect(buildPasswordResetUrl("abc_token")).toBe(
      "http://app.localhost:4173/reset-password#token=abc_token"
    );
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
