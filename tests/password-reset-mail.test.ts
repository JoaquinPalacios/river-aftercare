import { afterEach, describe, expect, it } from "vitest";

import { PASSWORD_RESET_TOKEN_TTL_MINUTES } from "@/lib/auth/account-token";
import { composePasswordResetEmail } from "@/lib/email/password-reset-mail";
import { buildPasswordResetUrl } from "@/lib/tenancy/staff-app-origin";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("password reset email", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
  });

  it("uses a fragment reset link, expiry copy, and escaped HTML", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    const resetUrl = buildPasswordResetUrl("abcTOKEN_-0123456789abcdefghijk");
    const unsafeUrl =
      'https://app.example.com/reset-password#token=ab"><script>x</script>';
    const message = composePasswordResetEmail({
      resetUrl: unsafeUrl,
      replyTo: "hello@example.test",
    });

    expect(message.subject).toBe("Reset your River Aftercare password");
    expect(message.text).toContain("30 minutes");
    expect(message.text).toContain("can only be used once");
    expect(message.text).toContain("If you didn't request this");
    expect(message.text).toContain(unsafeUrl);
    expect(message.text).toContain("reply to this email");
    expect(message.html).toContain("30 minutes");
    expect(message.html).toContain("&quot;");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("patient");
    expect(resetUrl).toContain("#token=");
    expect(resetUrl).not.toContain("?token=");
    expect(PASSWORD_RESET_TOKEN_TTL_MINUTES).toBe(30);
  });
});
