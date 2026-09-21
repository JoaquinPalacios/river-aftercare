import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPECTED_ERROR_FILES = [
  "app/api/auth/login/route.ts",
  "app/api/health/route.ts",
  "lib/auth/reset-password.ts",
  "lib/auth/accept-invitation.ts",
  "lib/auth/complete-email-change.ts",
  "lib/auth/password.ts",
  "lib/auth/clinic-authorization.ts",
  "app/(marketing)/not-found.tsx",
  "app/(staff)/not-found.tsx",
  "app/(aftercare)/not-found.tsx",
];

describe("expected application states are not manually reported to Sentry", () => {
  it("does not add captureException to login, token, 404, health, or authorization modules", () => {
    for (const file of EXPECTED_ERROR_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("reportServerException");
      expect(source, file).not.toContain("reportOperationalFailure");
      expect(source, file).not.toContain("reportAuthEmailFailure");
      expect(source, file).not.toContain("reportContactEmailFailure");
      expect(source, file).not.toContain("reportClientException");
      expect(source, file).not.toContain("@sentry/nextjs");
    }
  });

  it("reserves explicit capture for mail delivery and unhandled request errors", () => {
    expect(
      readFileSync("lib/auth/request-password-reset.ts", "utf8")
    ).toContain("reportAuthEmailFailure");
    expect(
      readFileSync("lib/operator/deliver-clinic-invitation-email.ts", "utf8")
    ).toContain("reportAuthEmailFailure");
    expect(readFileSync("lib/marketing/contact-mailer.ts", "utf8")).toContain(
      "reportContactEmailFailure"
    );
    expect(readFileSync("instrumentation.ts", "utf8")).toContain(
      "captureServerRequestError"
    );
  });
});
