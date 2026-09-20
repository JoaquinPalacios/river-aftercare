import { afterEach, describe, expect, it } from "vitest";

import { EMAIL_CHANGE_TOKEN_TTL_MINUTES } from "@/lib/auth/account-token";
import { composeEmailChangeEmail } from "@/lib/email/email-change-mail";
import { buildEmailChangeUrl } from "@/lib/tenancy/staff-app-origin";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("email change confirmation email", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
  });

  it("uses a fragment confirm link, expiry copy, and escaped HTML", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    const confirmUrl = buildEmailChangeUrl("abcTOKEN_-0123456789abcdefghijk");
    const unsafeUrl =
      'https://app.example.com/confirm-email-change#token=ab"><script>x</script>';
    const message = composeEmailChangeEmail({
      confirmUrl: unsafeUrl,
      replyTo: "hello@example.test",
    });

    expect(message.subject).toBe("Confirm your new River Aftercare email");
    expect(message.text).toContain("30 minutes");
    expect(message.text).toContain("can only be used once");
    expect(message.text).toContain("current sign-in email will stay the same");
    expect(message.text).toContain(unsafeUrl);
    expect(message.html).toContain("&quot;");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
    expect(confirmUrl).toContain("/confirm-email-change#token=");
    expect(confirmUrl).not.toContain("?token=");
    expect(EMAIL_CHANGE_TOKEN_TTL_MINUTES).toBe(30);
  });
});
