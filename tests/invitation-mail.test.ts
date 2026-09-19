import { afterEach, describe, expect, it } from "vitest";

import { ClinicMembershipRole } from "@prisma/client";

import { INVITATION_TOKEN_TTL_DAYS } from "@/lib/auth/account-token";
import { composeInvitationEmail } from "@/lib/email/invitation-mail";
import { buildInvitationUrl } from "@/lib/tenancy/staff-app-origin";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("invitation email", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
  });

  it("uses a fragment setup link, 7-day expiry copy, and escaped HTML", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "example.com";
    const invitationUrl = buildInvitationUrl("abcTOKEN_-0123456789abcdefghijk");
    const unsafeUrl =
      'https://app.example.com/accept-invitation#token=ab"><script>x</script>';
    const message = composeInvitationEmail({
      invitationUrl: unsafeUrl,
      clinicName: 'Riverside <script>alert("x")</script>',
      role: ClinicMembershipRole.ADMIN,
      inviteeName: "Jane <img src=x onerror=alert(1)>",
      replyTo: "hello@example.test",
    });

    expect(message.subject).toBe("Set up your River Aftercare account");
    expect(message.text).toContain("7 days");
    expect(message.text).toContain("one-time");
    expect(message.text).toContain("choose your own password");
    expect(message.text).toContain("Administrator");
    expect(message.text).toContain(unsafeUrl);
    expect(message.text).toContain("not expecting this invitation");
    expect(message.html).toContain("7 days");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("&quot;");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("passwordHash");
    expect(message.html).not.toContain("patient");
    expect(message.text).not.toContain("temporary password");
    expect(invitationUrl).toContain("/accept-invitation#token=");
    expect(invitationUrl).not.toContain("?token=");
    expect(INVITATION_TOKEN_TTL_DAYS).toBe(7);
  });
});
