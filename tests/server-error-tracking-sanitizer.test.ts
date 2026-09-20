import { describe, expect, it } from "vitest";

import { sanitizeErrorEvent } from "@/lib/observability/sanitize-error-event";
import {
  REDACTED_MARKER,
  isSensitiveKey,
  sanitizeErrorMessage,
  sanitizeErrorTrackingUrl,
  sanitizeSensitiveValue,
} from "@/lib/observability/sensitive-value-sanitizer";

describe("sensitive value sanitizer", () => {
  it("redacts listed sensitive keys case-insensitively without mutating the source", () => {
    const input = {
      password: "secret-pass",
      passwordHash: "scrypt:hash",
      currentPassword: "old",
      newPassword: "new",
      confirmPassword: "new",
      token: "tok_live",
      rawToken: "raw-token-value",
      tokenHash: "abc",
      session: "sess",
      sessionToken: "session-token",
      authorization: "Bearer abc",
      cookie: "authjs.session-token=secret",
      secret: "shhh",
      apiKey: "re_1234567890",
      api_key: "re_1234567890",
      accessKey: "AKIA",
      access_key: "AKIA",
      credential: "cred",
      dsn: "https://examplePublicKey@o0.ingest.example.test/0",
      email: "user@example.test",
      name: "Alex Rivera",
      phone: "0400 000 000",
      address: "1 Harbour St",
      statusCode: 500,
      route: "/guides",
    };
    const copy = structuredClone(input);
    const sanitized = sanitizeSensitiveValue(input) as Record<string, unknown>;

    expect(input).toEqual(copy);
    expect(sanitized.statusCode).toBe(500);
    expect(sanitized.route).toBe("/guides");
    for (const key of [
      "password",
      "passwordHash",
      "token",
      "rawToken",
      "email",
      "name",
      "phone",
      "address",
      "dsn",
      "apiKey",
      "cookie",
    ]) {
      expect(sanitized[key]).toBe(REDACTED_MARKER);
    }
    expect(JSON.stringify(sanitized)).not.toContain("secret-pass");
    expect(JSON.stringify(sanitized)).not.toContain("user@example.test");
    expect(JSON.stringify(sanitized)).not.toContain("raw-token-value");
  });

  it("does not treat stack filenames as personal names", () => {
    expect(isSensitiveKey("filename")).toBe(false);
    expect(isSensitiveKey("name", "os")).toBe(false);
    expect(isSensitiveKey("name")).toBe(true);
    expect(isSensitiveKey("workEmail")).toBe(true);
  });

  it("redacts emails, bearer tokens, DB URLs and token query values in messages", () => {
    const message = [
      "Failed for alex@clinic.example.test",
      "Authorization: Bearer super-secret-token",
      "postgres://river:secret@db.example.test:5432/app",
      "https://app.example.test/reset-password#token=abcDEF123_-",
      "jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.signaturepaddingvalue",
    ].join(" | ");
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toContain(REDACTED_MARKER);
    expect(sanitized).not.toContain("alex@clinic.example.test");
    expect(sanitized).not.toContain("super-secret-token");
    expect(sanitized).not.toContain("postgres://");
    expect(sanitized).not.toContain("abcDEF123_-");
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(sanitized).toMatch(/\[REDACTED\]/);
  });

  it("keeps a safe URL path and strips query and fragment", () => {
    expect(
      sanitizeErrorTrackingUrl(
        "https://app.example.test/guides/extraction?email=a@b.c#token=abc"
      )
    ).toBe("https://app.example.test/guides/extraction");
    expect(sanitizeErrorTrackingUrl("/login?next=%2Fdashboard#frag")).toBe(
      "/login"
    );
  });

  it("caps recursion and does not explode on cycles", () => {
    const cyclic: { self?: unknown; items: unknown[] } = { items: [] };
    cyclic.self = cyclic;
    cyclic.items.push(cyclic);
    expect(() => sanitizeSensitiveValue(cyclic)).not.toThrow();
  });
});

describe("beforeSend error event sanitization", () => {
  it("removes user, headers, cookies, query, and request bodies", () => {
    const sanitized = sanitizeErrorEvent({
      message: "boom for alex@clinic.example.test",
      user: { email: "alex@clinic.example.test", ip_address: "203.0.113.9" },
      request: {
        url: "https://app.example.test/login?email=alex@clinic.example.test#token=abc",
        method: "POST",
        headers: {
          authorization: "Bearer super-secret",
          cookie: "authjs.session-token=secret",
          "set-cookie": "x=1",
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "203.0.113.9",
          host: "app.example.test",
        },
        cookies: { session: "secret" },
        data: { password: "hunter2", email: "alex@clinic.example.test" },
        query_string: "email=alex@clinic.example.test",
        env: { DATABASE_URL: "postgres://river:secret@db/app" },
      },
      extra: {
        email: "alex@clinic.example.test",
        name: "Alex",
        phone: "0400 000 000",
        address: "1 Harbour St",
        password: "hunter2",
        token: "raw-token-value",
        note: "route=/guides",
      },
      tags: { email: "alex@clinic.example.test", component: "auth-email" },
      contexts: {
        os: { name: "linux" },
        user: { email: "alex@clinic.example.test" },
      },
      breadcrumbs: [{ message: "typed password hunter2" }],
      exception: {
        values: [
          {
            type: "Error",
            value:
              "connect postgres://river:secret@db.example.test/app as alex@clinic.example.test with Bearer abcdef",
            stacktrace: {
              frames: [
                {
                  filename: "lib/email/transactional-mailer.ts",
                  lineno: 148,
                  colno: 12,
                  function: "sendTransactionalEmail",
                },
              ],
            },
          },
        ],
      },
    });

    expect(sanitized.user).toBeUndefined();
    expect(sanitized.request?.url).toBe("https://app.example.test/login");
    expect(sanitized.request?.method).toBe("POST");
    expect(sanitized.request).toEqual({
      url: "https://app.example.test/login",
      method: "POST",
    });
    expect(sanitized.breadcrumbs).toEqual([]);
    expect(sanitized.message).not.toContain("alex@clinic.example.test");
    expect(sanitized.exception?.values?.[0]?.value).not.toContain(
      "postgres://"
    );
    expect(sanitized.exception?.values?.[0]?.value).not.toContain(
      "alex@clinic.example.test"
    );
    expect(sanitized.exception?.values?.[0]?.value).not.toContain(
      "Bearer abcdef"
    );
    expect(
      sanitized.exception?.values?.[0]?.stacktrace as {
        frames: Array<{ filename: string; lineno: number }>;
      }
    ).toEqual({
      frames: [
        {
          filename: "lib/email/transactional-mailer.ts",
          lineno: 148,
          colno: 12,
          function: "sendTransactionalEmail",
        },
      ],
    });
    expect(sanitized.contexts?.os).toMatchObject({ name: "linux" });
    const payload = JSON.stringify(sanitized);
    expect(payload).not.toContain("hunter2");
    expect(payload).not.toContain("authjs.session-token=secret");
    expect(payload).not.toContain("203.0.113.9");
    expect(payload).not.toContain("raw-token-value");
    expect(payload).not.toContain("alex@clinic.example.test");
    expect(payload).toContain(REDACTED_MARKER);
  });
});
