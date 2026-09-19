import { afterEach, describe, expect, it, vi } from "vitest";

const resendState = vi.hoisted(() => ({
  send: vi.fn(),
  keys: [] as string[],
}));

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: resendState.send };
    constructor(key: string) {
      resendState.keys.push(key);
    }
  },
}));

import { composeMarketingContactMessage } from "@/lib/marketing/contact-mail";
import {
  CONTACT_DELIVERY_FAILED,
  clearMarketingContactMemoryInbox,
  deliverMarketingContactEnquiry,
  getMarketingContactMemoryInbox,
} from "@/lib/marketing/contact-mailer";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-enquiry";
import {
  getMarketingContactDeliveryConfig,
  getMarketingContactFromEmail,
  getMarketingContactToEmail,
  getTurnstileSiteKey,
} from "@/lib/marketing/contact-config";
import { TURNSTILE_DUMMY_PASS_SITE_KEY } from "@/lib/marketing/contact-turnstile-public";

const enquiry = {
  fullName: "Alex Rivera",
  workEmail: "alex@clinic.example.test",
  clinicName: "Harbour Dental",
  phone: "0400 000 000",
  message: "We have two rooms.",
  [CONTACT_HONEYPOT_FIELD]: "",
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("marketing contact mailer", () => {
  const previous = {
    to: process.env.CONTACT_EMAIL_TO,
    from: process.env.CONTACT_EMAIL_FROM,
    mailer: process.env.CONTACT_MAILER,
    legacyTo: process.env.MARKETING_CONTACT_TO_EMAIL,
    legacyFrom: process.env.MARKETING_CONTACT_FROM_EMAIL,
    legacy: process.env.MARKETING_CONTACT_EMAIL,
    resend: process.env.RESEND_API_KEY,
    vercelEnv: process.env.VERCEL_ENV,
    authFrom: process.env.AUTH_EMAIL_FROM,
    authReplyTo: process.env.AUTH_EMAIL_REPLY_TO,
  };

  afterEach(() => {
    restore("CONTACT_EMAIL_TO", previous.to);
    restore("CONTACT_EMAIL_FROM", previous.from);
    restore("CONTACT_MAILER", previous.mailer);
    restore("MARKETING_CONTACT_TO_EMAIL", previous.legacyTo);
    restore("MARKETING_CONTACT_FROM_EMAIL", previous.legacyFrom);
    restore("MARKETING_CONTACT_EMAIL", previous.legacy);
    restore("RESEND_API_KEY", previous.resend);
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("AUTH_EMAIL_FROM", previous.authFrom);
    restore("AUTH_EMAIL_REPLY_TO", previous.authReplyTo);
    clearMarketingContactMemoryInbox();
    resendState.send.mockReset();
    resendState.keys.length = 0;
  });

  it("fails closed when delivery is not configured", async () => {
    delete process.env.CONTACT_EMAIL_TO;
    delete process.env.CONTACT_EMAIL_FROM;
    delete process.env.MARKETING_CONTACT_TO_EMAIL;
    delete process.env.MARKETING_CONTACT_FROM_EMAIL;
    delete process.env.MARKETING_CONTACT_EMAIL;
    delete process.env.RESEND_API_KEY;
    process.env.CONTACT_MAILER = "resend";

    const result = await deliverMarketingContactEnquiry(enquiry);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe(CONTACT_DELIVERY_FAILED);
    expect(result.error).not.toMatch(/RESEND_API_KEY|SMTP|CONTACT_EMAIL/i);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
    expect(resendState.send).not.toHaveBeenCalled();
  });

  it("delivers through the memory adapter without faking client success", async () => {
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "River Aftercare <website@example.test>";
    process.env.CONTACT_MAILER = "memory";

    const config = getMarketingContactDeliveryConfig();
    expect(config.ready).toBe(true);
    const result = await deliverMarketingContactEnquiry(enquiry, config);
    expect(result).toEqual({ ok: true });
    expect(getMarketingContactMemoryInbox()).toHaveLength(1);
    const message = getMarketingContactMemoryInbox()[0];
    expect(message.subject).toBe("River Aftercare enquiry — Harbour Dental");
    expect(message.replyTo).toBe("alex@clinic.example.test");
    expect(message.from).toBe("River Aftercare <website@example.test>");
    expect(message.to).toBe("hello@example.test");
    expect(message.text).toContain("Name: Alex Rivera");
    expect(message.text).toContain("Email: alex@clinic.example.test");
    expect(message.text).toContain("Practice: Harbour Dental");
    expect(message.text).not.toContain("Work email");
    expect(message.text).not.toContain("Number of locations");
    expect(message.text).toContain("Phone: 0400 000 000");
    expect(message.html).toContain("Harbour Dental");
    expect(message.html).not.toContain("<script");
    expect(resendState.send).not.toHaveBeenCalled();
  });

  it("sends through Resend with env from/to and visitor Reply-To", async () => {
    process.env.CONTACT_EMAIL_TO = "contact@example.test";
    process.env.CONTACT_EMAIL_FROM =
      "River Aftercare <website@mail.example.test>";
    process.env.CONTACT_MAILER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    resendState.send.mockResolvedValue({
      data: { id: "msg_hidden" },
      error: null,
    });

    const result = await deliverMarketingContactEnquiry(enquiry);
    expect(result).toEqual({ ok: true });
    expect(resendState.keys).toEqual(["re_test_key"]);
    expect(resendState.send).toHaveBeenCalledOnce();
    const payload = resendState.send.mock.calls[0]?.[0] as {
      from: string;
      to: string[];
      replyTo: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(payload.from).toBe("River Aftercare <website@mail.example.test>");
    expect(payload.to).toEqual(["contact@example.test"]);
    expect(payload.replyTo).toBe("alex@clinic.example.test");
    expect(payload.subject).toBe("River Aftercare enquiry — Harbour Dental");
    expect(payload.text).toContain("Practice: Harbour Dental");
    expect(payload.html).toContain("Harbour Dental");
    expect(JSON.stringify(payload)).not.toContain("re_test_key");
    expect(JSON.stringify(result)).not.toContain("msg_hidden");
  });

  it("returns a generic error when Resend fails and hides provider details", async () => {
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "website@example.test";
    process.env.CONTACT_MAILER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    resendState.send.mockResolvedValue({
      data: null,
      error: { message: "rate limited by resend", name: "rate_limit_exceeded" },
    });

    const result = await deliverMarketingContactEnquiry(enquiry);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe(CONTACT_DELIVERY_FAILED);
    expect(result.error).not.toMatch(/resend|rate limited|re_test_key/i);
  });

  it("ignores AUTH_EMAIL_FROM for marketing Contact delivery", async () => {
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "River Aftercare <website@example.test>";
    process.env.CONTACT_MAILER = "memory";
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.AUTH_EMAIL_REPLY_TO = "noreply@example.test";

    const result = await deliverMarketingContactEnquiry(enquiry);
    expect(result).toEqual({ ok: true });
    const message = getMarketingContactMemoryInbox()[0];
    expect(message?.from).toBe("River Aftercare <website@example.test>");
    expect(message?.to).toBe("hello@example.test");
    expect(message?.from).not.toContain("accounts@");
    expect(resendState.send).not.toHaveBeenCalled();
  });

  it("refuses the memory mailer on Vercel production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CONTACT_MAILER = "memory";
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "website@example.test";
    delete process.env.RESEND_API_KEY;
    const config = getMarketingContactDeliveryConfig();
    expect(config.ready).toBe(false);
    expect(config.kind).toBe("resend");
  });

  it("reads to/from addresses and rejects malformed values", () => {
    expect(
      getMarketingContactToEmail({
        CONTACT_EMAIL_TO: "hello@example.test",
      })
    ).toBe("hello@example.test");
    expect(
      getMarketingContactToEmail({
        MARKETING_CONTACT_EMAIL: "legacy@example.test",
      })
    ).toBe("legacy@example.test");
    expect(
      getMarketingContactFromEmail({
        CONTACT_EMAIL_FROM: "River Aftercare <website@mail.example.test>",
      })
    ).toBe("River Aftercare <website@mail.example.test>");
    expect(
      getMarketingContactFromEmail({
        CONTACT_EMAIL_FROM: "not-an-email",
      })
    ).toBeNull();
    expect(
      getMarketingContactFromEmail({
        CONTACT_EMAIL_FROM:
          "River Aftercare <website@mail.example.test>\nBcc: a@b.c",
      })
    ).toBeNull();
  });

  it("uses a dummy Turnstile sitekey only outside Vercel production", () => {
    expect(getTurnstileSiteKey({})).toBe(TURNSTILE_DUMMY_PASS_SITE_KEY);
    expect(getTurnstileSiteKey({ VERCEL_ENV: "production" })).toBe("");
    expect(
      getTurnstileSiteKey({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAA-real",
      })
    ).toBe("0x4AAAA-real");
  });
});

describe("compose marketing contact message", () => {
  it("omits optional blanks and escapes HTML", () => {
    const message = composeMarketingContactMessage({
      enquiry: {
        ...enquiry,
        phone: null,
        message: "We use <b>custom</b> chairs",
      },
      toEmail: "hello@example.test",
      fromEmail: "website@example.test",
    });
    expect(message.text).not.toContain("Phone:");
    expect(message.html).toContain("&lt;b&gt;custom&lt;/b&gt;");
    expect(message.html).not.toContain("<b>custom</b>");
    expect(message.html).toContain('<th align="left">Email</th>');
    expect(message.html).not.toContain("Work email");
    expect(message.html).not.toContain("Number of locations");
    expect(message.subject).toBe("River Aftercare enquiry — Harbour Dental");
  });

  it("falls back to a bounded subject when the practice name is blank", () => {
    const message = composeMarketingContactMessage({
      enquiry: {
        ...enquiry,
        clinicName: "\n\n",
      },
      toEmail: "hello@example.test",
      fromEmail: "website@example.test",
    });
    expect(message.subject).toBe("River Aftercare enquiry");
    expect(message.subject).not.toMatch(/[\r\n]/);
  });
});
