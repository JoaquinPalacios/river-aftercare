import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerState = vi.hoisted(() => ({
  host: "localhost:3000",
  forwardedFor: "203.0.113.10",
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    const requestHeaders = new Headers();
    requestHeaders.set("host", headerState.host);
    if (headerState.forwardedFor) {
      requestHeaders.set("x-forwarded-for", headerState.forwardedFor);
    }
    return requestHeaders;
  },
}));

import { submitMarketingContactAction } from "@/app/(marketing)/%5Fmarketing/contact/actions";
import {
  CONTACT_VERIFICATION_EXPIRED,
  initialContactActionState,
} from "@/app/(marketing)/%5Fmarketing/contact/state";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-enquiry";
import {
  CONTACT_DELIVERY_FAILED,
  clearMarketingContactMemoryInbox,
  getMarketingContactMemoryInbox,
} from "@/lib/marketing/contact-mailer";
import {
  TURNSTILE_DUMMY_FAIL_SECRET,
  TURNSTILE_DUMMY_PASS_SECRET,
  TURNSTILE_DUMMY_SPENT_SECRET,
} from "@/lib/marketing/contact-turnstile";
import {
  CONTACT_TURNSTILE_FIELD,
  TURNSTILE_DUMMY_PASS_TOKEN,
} from "@/lib/marketing/contact-turnstile-public";

function enquiryData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("fullName", "Alex Rivera");
  data.set("workEmail", "alex@clinic.example.test");
  data.set("clinicName", "Harbour Dental");
  data.set("phone", "");
  data.set("message", "");
  data.set(CONTACT_HONEYPOT_FIELD, "");
  data.set(CONTACT_TURNSTILE_FIELD, TURNSTILE_DUMMY_PASS_TOKEN);
  for (const [key, value] of Object.entries(overrides)) {
    data.set(key, value);
  }
  return data;
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("submitMarketingContactAction", () => {
  const previous = {
    root: process.env.CARE_GUIDE_ROOT_DOMAIN,
    to: process.env.CONTACT_EMAIL_TO,
    from: process.env.CONTACT_EMAIL_FROM,
    mailer: process.env.CONTACT_MAILER,
    legacyTo: process.env.MARKETING_CONTACT_TO_EMAIL,
    legacyFrom: process.env.MARKETING_CONTACT_FROM_EMAIL,
    legacyMailer: process.env.MARKETING_CONTACT_MAILER,
    resend: process.env.RESEND_API_KEY,
    turnstile: process.env.TURNSTILE_SECRET_KEY,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  };

  beforeEach(() => {
    headerState.host = "localhost:3000";
    headerState.forwardedFor = "203.0.113.10";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "River Aftercare <website@example.test>";
    process.env.CONTACT_MAILER = "memory";
    delete process.env.MARKETING_CONTACT_TO_EMAIL;
    delete process.env.MARKETING_CONTACT_FROM_EMAIL;
    delete process.env.MARKETING_CONTACT_MAILER;
    delete process.env.RESEND_API_KEY;
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_DUMMY_PASS_SECRET;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.VERCEL_ENV;
    clearMarketingContactMemoryInbox();
  });

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previous.root);
    restore("CONTACT_EMAIL_TO", previous.to);
    restore("CONTACT_EMAIL_FROM", previous.from);
    restore("CONTACT_MAILER", previous.mailer);
    restore("MARKETING_CONTACT_TO_EMAIL", previous.legacyTo);
    restore("MARKETING_CONTACT_FROM_EMAIL", previous.legacyFrom);
    restore("MARKETING_CONTACT_MAILER", previous.legacyMailer);
    restore("RESEND_API_KEY", previous.resend);
    restore("TURNSTILE_SECRET_KEY", previous.turnstile);
    restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", previous.siteKey);
    restore("VERCEL_ENV", previous.vercelEnv);
    clearMarketingContactMemoryInbox();
  });

  it("delivers a valid enquiry through the mailer boundary", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({ phone: "0400 000 000" })
    );
    expect(state).toEqual({ status: "success" });
    expect(getMarketingContactMemoryInbox()).toHaveLength(1);
    const message = getMarketingContactMemoryInbox()[0];
    expect(message?.to).toBe("hello@example.test");
    expect(message?.from).toBe("River Aftercare <website@example.test>");
    expect(message?.replyTo).toBe("alex@clinic.example.test");
    expect(message?.subject).toBe("River Aftercare enquiry — Harbour Dental");
  });

  it("ignores attacker-supplied recipient and sender fields", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({
        to: "attacker@evil.test",
        from: "attacker@evil.test",
        replyTo: "attacker@evil.test",
        CONTACT_EMAIL_TO: "attacker@evil.test",
        CONTACT_EMAIL_FROM: "attacker@evil.test",
      })
    );
    expect(state).toEqual({ status: "success" });
    const message = getMarketingContactMemoryInbox()[0];
    expect(message?.to).toBe("hello@example.test");
    expect(message?.from).toBe("River Aftercare <website@example.test>");
    expect(message?.replyTo).toBe("alex@clinic.example.test");
  });

  it("returns field errors without claiming success", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({ fullName: "", workEmail: "nope" })
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.fieldErrors.fullName).toBeTruthy();
    expect(state.fieldErrors.workEmail).toBeTruthy();
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("rejects an invalid email without sending", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({ workEmail: "not-an-email" })
    );
    expect(state.status).toBe("error");
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("rejects overlong fields without sending", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({ fullName: "A".repeat(121), message: "B".repeat(2001) })
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.fieldErrors.fullName).toMatch(/too long/i);
    expect(state.fieldErrors.message).toMatch(/too long/i);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("does not deliver honeypot submissions or report success", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({ [CONTACT_HONEYPOT_FIELD]: "https://spam.test" })
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.error).toBe(CONTACT_DELIVERY_FAILED);
    expect(state.error).not.toMatch(/honeypot|website|spam/i);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("rejects a missing Turnstile token without sending", async () => {
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData({ [CONTACT_TURNSTILE_FIELD]: "" })
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.error).toBe(CONTACT_VERIFICATION_EXPIRED);
    expect(state.error).not.toMatch(/turnstile|cloudflare|secret/i);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("rejects an invalid Turnstile token without sending", async () => {
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_DUMMY_FAIL_SECRET;
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData()
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.error).toBe(CONTACT_DELIVERY_FAILED);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("rejects an expired or already-used Turnstile token without sending", async () => {
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_DUMMY_SPENT_SECRET;
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData()
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.error).toBe(CONTACT_VERIFICATION_EXPIRED);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("does not pretend success when Resend is missing", async () => {
    process.env.CONTACT_MAILER = "resend";
    delete process.env.RESEND_API_KEY;
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData()
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") {
      return;
    }
    expect(state.error).toBe(CONTACT_DELIVERY_FAILED);
    expect(state.error).not.toMatch(/RESEND_API_KEY|not configured/i);
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });

  it("does not run the marketing mutation on a tenant host", async () => {
    headerState.host = "demodental.localhost:3000";
    const state = await submitMarketingContactAction(
      initialContactActionState,
      enquiryData()
    );
    expect(state.status).toBe("error");
    expect(getMarketingContactMemoryInbox()).toHaveLength(0);
  });
});
