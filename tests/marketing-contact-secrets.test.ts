import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CLIENT_FILES = [
  "app/(marketing)/components/contact-form.tsx",
  "app/(marketing)/components/contact-turnstile.tsx",
  "lib/marketing/contact-fields.ts",
  "lib/marketing/contact-turnstile-public.ts",
] as const;

describe("marketing contact secret boundary", () => {
  it("keeps Resend and Turnstile secrets out of client modules", () => {
    for (const file of CLIENT_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("TURNSTILE_SECRET_KEY");
      expect(source, file).not.toContain("RESEND_API_KEY");
      expect(source, file).not.toContain("1x0000000000000000000000000000000AA");
      expect(source, file).not.toContain("SMTP_PASSWORD");
      expect(source, file).not.toContain("nodemailer");
    }

    const publicTurnstile = readFileSync(
      "lib/marketing/contact-turnstile-public.ts",
      "utf8"
    );
    expect(publicTurnstile).toContain("cf-turnstile-response");
    expect(publicTurnstile).not.toContain("TURNSTILE_SECRET_KEY");

    const form = readFileSync(
      "app/(marketing)/components/contact-form.tsx",
      "utf8"
    );
    expect(form).toContain("busy={pending}");
    expect(form).toContain("ContactTurnstile");
    expect(form).toContain("Thanks — your message has been sent.");
    expect(form).not.toContain("contact-mailer");
    expect(form).not.toContain("contact-enquiry");
  });
});
