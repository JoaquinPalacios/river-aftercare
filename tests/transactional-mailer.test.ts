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

import {
  clearTransactionalEmailMemoryInbox,
  getTransactionalEmailMemoryInbox,
  sendTransactionalEmail,
  type TransactionalEmailMessage,
} from "@/lib/email/transactional-mailer";
import {
  getAuthEmailDeliveryConfig,
  getAuthEmailFrom,
  getAuthEmailReplyTo,
  sendAuthTransactionalEmail,
} from "@/lib/email/auth-email";
import { CONTACT_DELIVERY_FAILED } from "@/lib/marketing/contact-mailer";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const message = {
  from: "River Aftercare <accounts@example.test>",
  to: "user@example.test",
  replyTo: "hello@example.test",
  subject: "Test message",
  text: "Plain body",
  html: "<p>HTML body</p>",
};

describe("transactional email foundation", () => {
  const previous = {
    from: process.env.AUTH_EMAIL_FROM,
    replyTo: process.env.AUTH_EMAIL_REPLY_TO,
    resend: process.env.RESEND_API_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  };

  afterEach(() => {
    restore("AUTH_EMAIL_FROM", previous.from);
    restore("AUTH_EMAIL_REPLY_TO", previous.replyTo);
    restore("RESEND_API_KEY", previous.resend);
    restore("VERCEL_ENV", previous.vercelEnv);
    clearTransactionalEmailMemoryInbox();
    resendState.send.mockReset();
    resendState.keys.length = 0;
  });

  it("captures memory messages without calling Resend", async () => {
    const inbox: TransactionalEmailMessage[] = [];
    const result = await sendTransactionalEmail(message, {
      kind: "memory",
      inbox,
    });
    expect(result).toEqual({ ok: true });
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toEqual(message);
    expect(resendState.send).not.toHaveBeenCalled();
  });

  it("sends the sanitized payload through Resend and hides provider details", async () => {
    resendState.send.mockResolvedValue({
      data: { id: "msg_hidden" },
      error: null,
    });

    const result = await sendTransactionalEmail(message, {
      kind: "resend",
      apiKey: "re_test_key",
    });

    expect(result).toEqual({ ok: true });
    expect(resendState.keys).toEqual(["re_test_key"]);
    expect(resendState.send).toHaveBeenCalledOnce();
    const payload = resendState.send.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload.from).toBe(message.from);
    expect(payload.to).toEqual([message.to]);
    expect(payload.replyTo).toBe(message.replyTo);
    expect(payload.subject).toBe(message.subject);
    expect(JSON.stringify(payload)).not.toContain("re_test_key");
    expect(JSON.stringify(result)).not.toContain("msg_hidden");
    expect(JSON.stringify(result)).not.toContain(message.html);
  });

  it("returns a controlled failure when Resend errors", async () => {
    resendState.send.mockResolvedValue({
      data: null,
      error: { message: "rate limited by resend", name: "rate_limit_exceeded" },
    });

    const result = await sendTransactionalEmail(message, {
      kind: "resend",
      apiKey: "re_test_key",
    });
    expect(result).toEqual({ ok: false, code: "delivery_failed" });
    expect(JSON.stringify(result)).not.toMatch(
      /resend|rate limited|re_test_key/i
    );
    expect(JSON.stringify(result)).not.toBe(
      JSON.stringify({ ok: false, error: CONTACT_DELIVERY_FAILED })
    );
  });

  it("rejects header injection and empty recipients without calling Resend", async () => {
    const injected = await sendTransactionalEmail(
      {
        ...message,
        to: "user@example.test\nBcc: attacker@example.test",
      },
      { kind: "resend", apiKey: "re_test_key" }
    );
    const emptyTo = await sendTransactionalEmail(
      { ...message, to: "" },
      { kind: "resend", apiKey: "re_test_key" }
    );
    const badFrom = await sendTransactionalEmail(
      { ...message, from: "not-an-email" },
      { kind: "memory" }
    );

    expect(injected).toEqual({ ok: false, code: "invalid_message" });
    expect(emptyTo).toEqual({ ok: false, code: "invalid_message" });
    expect(badFrom).toEqual({ ok: false, code: "invalid_message" });
    expect(resendState.send).not.toHaveBeenCalled();
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);
  });

  it("parses AUTH_EMAIL_FROM and optional AUTH_EMAIL_REPLY_TO lazily", async () => {
    delete process.env.AUTH_EMAIL_FROM;
    delete process.env.AUTH_EMAIL_REPLY_TO;
    delete process.env.RESEND_API_KEY;
    delete process.env.VERCEL_ENV;

    expect(getAuthEmailFrom()).toBeNull();
    expect(getAuthEmailReplyTo()).toBeNull();
    expect(getAuthEmailDeliveryConfig()).toEqual({
      ready: false,
      reason: "missing_from",
    });

    process.env.AUTH_EMAIL_FROM =
      "River Aftercare <accounts@mail.example.test>\nBcc: a@b.c";
    expect(getAuthEmailDeliveryConfig()).toEqual({
      ready: false,
      reason: "malformed_from",
    });

    process.env.AUTH_EMAIL_FROM =
      "River Aftercare <accounts@mail.example.test>";
    process.env.AUTH_EMAIL_REPLY_TO = "not-an-email";
    expect(getAuthEmailDeliveryConfig()).toEqual({
      ready: false,
      reason: "malformed_reply_to",
    });

    process.env.AUTH_EMAIL_REPLY_TO = "hello@example.test";
    const local = getAuthEmailDeliveryConfig();
    expect(local).toMatchObject({
      ready: true,
      from: "River Aftercare <accounts@mail.example.test>",
      replyTo: "hello@example.test",
      transport: { kind: "memory" },
    });

    process.env.VERCEL_ENV = "production";
    delete process.env.RESEND_API_KEY;
    expect(getAuthEmailDeliveryConfig()).toEqual({
      ready: false,
      reason: "missing_api_key",
    });
  });

  it("does not throw when AUTH_EMAIL_FROM is missing and only fails when sending", async () => {
    delete process.env.AUTH_EMAIL_FROM;
    delete process.env.VERCEL_ENV;
    const config = getAuthEmailDeliveryConfig();
    const result = await sendAuthTransactionalEmail(
      {
        to: "user@example.test",
        subject: "Reset",
        text: "Reset",
        html: "<p>Reset</p>",
      },
      config
    );

    expect(config.ready).toBe(false);
    expect(result).toEqual({ ok: false, code: "not_configured" });
    expect(JSON.stringify(result)).not.toMatch(
      /AUTH_EMAIL_FROM|RESEND_API_KEY/i
    );
    expect(resendState.send).not.toHaveBeenCalled();
  });

  it("uses memory locally and Resend on Vercel production for auth mail", async () => {
    process.env.AUTH_EMAIL_FROM = "accounts@example.test";
    process.env.AUTH_EMAIL_REPLY_TO = "hello@example.test";
    delete process.env.VERCEL_ENV;

    const local = await sendAuthTransactionalEmail({
      to: "user@example.test",
      subject: "Hello",
      text: "Hello",
      html: "<p>Hello</p>",
    });
    expect(local).toEqual({ ok: true });
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(1);
    expect(getTransactionalEmailMemoryInbox()[0]?.from).toBe(
      "accounts@example.test"
    );
    expect(resendState.send).not.toHaveBeenCalled();

    process.env.VERCEL_ENV = "production";
    process.env.RESEND_API_KEY = "re_auth_key";
    resendState.send.mockResolvedValue({
      data: { id: "msg_hidden" },
      error: null,
    });
    const production = await sendAuthTransactionalEmail({
      to: "user@example.test",
      subject: "Hello",
      text: "Hello",
      html: "<p>Hello</p>",
    });
    expect(production).toEqual({ ok: true });
    expect(resendState.keys).toEqual(["re_auth_key"]);
    expect(JSON.stringify(production)).not.toContain("re_auth_key");
  });

  it("refuses memory auth delivery on Vercel production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.AUTH_EMAIL_FROM = "accounts@example.test";
    process.env.AUTH_EMAIL_REPLY_TO = "hello@example.test";
    delete process.env.RESEND_API_KEY;
    const config = getAuthEmailDeliveryConfig();
    expect(config.ready).toBe(false);
    expect(config).toMatchObject({ reason: "missing_api_key" });
  });
});
