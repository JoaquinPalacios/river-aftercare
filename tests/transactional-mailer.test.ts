import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  MAILPIT_SEND_TIMEOUT_MS,
  MAILPIT_SEND_URL,
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
    vercel: process.env.VERCEL,
    transport: process.env.AUTH_EMAIL_TRANSPORT,
    nodeEnv: process.env.NODE_ENV,
  };

  beforeEach(() => {
    delete process.env.AUTH_EMAIL_TRANSPORT;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    restore("AUTH_EMAIL_FROM", previous.from);
    restore("AUTH_EMAIL_REPLY_TO", previous.replyTo);
    restore("RESEND_API_KEY", previous.resend);
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("VERCEL", previous.vercel);
    restore("AUTH_EMAIL_TRANSPORT", previous.transport);
    restore("NODE_ENV", previous.nodeEnv);
    clearTransactionalEmailMemoryInbox();
    resendState.send.mockReset();
    resendState.keys.length = 0;
    vi.unstubAllGlobals();
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

  function developmentAuthEnv(
    overrides: Record<string, string | undefined> = {}
  ): Record<string, string | undefined> {
    return {
      NODE_ENV: "development",
      AUTH_EMAIL_FROM: "River Aftercare <accounts@example.test>",
      AUTH_EMAIL_REPLY_TO: "Hello <hello@example.test>",
      AUTH_EMAIL_TRANSPORT: "mailpit",
      ...overrides,
    };
  }

  it("selects Mailpit only for local development", () => {
    const selected = getAuthEmailDeliveryConfig(developmentAuthEnv());
    expect(selected).toMatchObject({
      ready: true,
      from: "River Aftercare <accounts@example.test>",
      replyTo: "Hello <hello@example.test>",
      transport: { kind: "mailpit" },
    });

    expect(
      getAuthEmailDeliveryConfig(
        developmentAuthEnv({ AUTH_EMAIL_TRANSPORT: "  MAILPIT  " })
      )
    ).toMatchObject({ transport: { kind: "mailpit" } });

    expect(
      getAuthEmailDeliveryConfig(
        developmentAuthEnv({ AUTH_EMAIL_TRANSPORT: undefined })
      )
    ).toMatchObject({ transport: { kind: "memory" } });

    expect(
      getAuthEmailDeliveryConfig(developmentAuthEnv({ NODE_ENV: "test" }))
    ).toMatchObject({ transport: { kind: "memory" } });

    expect(
      getAuthEmailDeliveryConfig(developmentAuthEnv({ NODE_ENV: "production" }))
    ).toMatchObject({ transport: { kind: "memory" } });
  });

  it("does not let Mailpit replace Resend or run on Vercel", () => {
    const production = getAuthEmailDeliveryConfig(
      developmentAuthEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        RESEND_API_KEY: "re_prod_key",
      })
    );
    expect(production).toMatchObject({
      ready: true,
      transport: { kind: "resend", apiKey: "re_prod_key" },
    });

    expect(
      getAuthEmailDeliveryConfig(
        developmentAuthEnv({
          VERCEL_ENV: "production",
          RESEND_API_KEY: undefined,
        })
      )
    ).toEqual({ ready: false, reason: "missing_api_key" });

    for (const vercelEnv of ["preview", "development", "production"]) {
      const config = getAuthEmailDeliveryConfig(
        developmentAuthEnv({
          VERCEL_ENV: vercelEnv,
          RESEND_API_KEY:
            vercelEnv === "production" ? "re_prod_key" : undefined,
        })
      );
      const selected = config.ready ? config.transport.kind : config.reason;
      expect(selected).not.toBe("mailpit");
    }

    expect(
      getAuthEmailDeliveryConfig(developmentAuthEnv({ VERCEL: "1" }))
    ).toMatchObject({ transport: { kind: "memory" } });
  });

  it("posts a Mailpit send payload and does not treat failure as delivered", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response('{"ID":"hidden"}', { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTransactionalEmail(message, { kind: "mailpit" });

    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);
    expect(resendState.send).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(MAILPIT_SEND_URL);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(MAILPIT_SEND_TIMEOUT_MS).toBe(8000);
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      From: { Name: "River Aftercare", Email: "accounts@example.test" },
      To: [{ Name: "", Email: "user@example.test" }],
      ReplyTo: [{ Name: "", Email: "hello@example.test" }],
      Subject: "Test message",
      Text: "Plain body",
      HTML: "<p>HTML body</p>",
    });

    fetchMock.mockResolvedValueOnce(
      new Response("mailbox secret token=abc", { status: 503 })
    );
    const unavailable = await sendTransactionalEmail(message, {
      kind: "mailpit",
    });
    expect(unavailable).toEqual({ ok: false, code: "delivery_failed" });
    expect(JSON.stringify(unavailable)).not.toMatch(/secret|token=|8025/i);
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);

    fetchMock.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 127.0.0.1:8025")
    );
    const refused = await sendTransactionalEmail(message, { kind: "mailpit" });
    expect(refused).toEqual({ ok: false, code: "delivery_failed" });
    expect(JSON.stringify(refused)).not.toMatch(/ECONNREFUSED|8025/);
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);
  });

  it("does not call Mailpit for an invalid message or while only reading config", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invalid = await sendTransactionalEmail(
      { ...message, to: "" },
      { kind: "mailpit" }
    );
    expect(invalid).toEqual({ ok: false, code: "invalid_message" });

    const config = getAuthEmailDeliveryConfig(developmentAuthEnv());
    expect(config).toMatchObject({ transport: { kind: "mailpit" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);
  });

  it("returns a controlled failure when the selected Mailpit transport cannot deliver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8025");
      })
    );

    const config = getAuthEmailDeliveryConfig(developmentAuthEnv());
    const result = await sendAuthTransactionalEmail(
      {
        to: "user@example.test",
        subject: "Hello",
        text: "Hello",
        html: "<p>Hello</p>",
      },
      config
    );

    expect(result).toEqual({ ok: false, code: "delivery_failed" });
    expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|8025|token/i);
    expect(getTransactionalEmailMemoryInbox()).toHaveLength(0);
    expect(resendState.send).not.toHaveBeenCalled();
  });
});
