import { describe, expect, it } from "vitest";

import {
  createErrorTrackingInitOptions,
  filterErrorTrackingIntegrations,
} from "@/lib/observability/error-tracking-privacy";
import { sanitizeErrorEvent } from "@/lib/observability/sanitize-error-event";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

const UNWANTED_INTEGRATIONS = [
  "RequestData",
  "Console",
  "CaptureConsole",
  "LocalVariables",
  "LocalVariablesAsync",
  "Modules",
  "Context",
  "Prisma",
  "Postgres",
  "Mysql",
  "Mongo",
  "Redis",
  "Http",
  "NodeFetch",
  "Replay",
  "BrowserTracing",
  "Profiling",
];

describe("shared error-tracking privacy floor", () => {
  it("filters unwanted Sentry integrations for production and verification", () => {
    const filtered = filterErrorTrackingIntegrations([
      { name: "InboundFilters" },
      { name: "FunctionToString" },
      { name: "LinkedErrors" },
      { name: "ContextLines" },
      { name: "OnUncaughtException" },
      { name: "OnUnhandledRejection" },
      { name: "SystemError" },
      ...UNWANTED_INTEGRATIONS.map((name) => ({ name })),
    ]);

    const names = filtered.map((integration) => integration.name);
    expect(names).toEqual([
      "InboundFilters",
      "FunctionToString",
      "LinkedErrors",
      "ContextLines",
      "OnUncaughtException",
      "OnUnhandledRejection",
      "SystemError",
    ]);
    for (const name of UNWANTED_INTEGRATIONS) {
      expect(names).not.toContain(name);
    }
  });

  it("uses the same beforeSend sanitizer for production and verification", () => {
    const production = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "production",
      release: "deadbeefcafebabe",
    });
    const verification = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "verification",
    });

    const dirty = {
      user: { ip_address: "203.0.113.9" },
      server_name: "mac.lan",
      modules: { next: "16.3.5" },
      tags: { user: "anonymous", component: "observability-verification" },
      message: "river_aftercare_error_tracking_verification",
    };

    const fromProduction = production.beforeSend(dirty);
    const fromVerification = verification.beforeSend({ ...dirty });
    const fromSanitizer = sanitizeErrorEvent({ ...dirty });

    expect(fromProduction).toEqual(fromSanitizer);
    expect(fromVerification).toEqual(fromSanitizer);
    expect(fromVerification?.user).toBeUndefined();
    expect(fromVerification).not.toHaveProperty("user");
    expect(JSON.stringify(fromVerification)).not.toContain("203.0.113.9");
    expect(JSON.stringify(fromVerification)).not.toContain(FAKE_DSN);
  });

  it("does not put an IP address on the sanitized payload", () => {
    const options = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "verification",
    });
    const sanitized = options.beforeSend({
      user: { ip_address: "{{auto}}" },
      tags: { user: "anonymous" },
      request: {
        headers: { "x-forwarded-for": "198.51.100.10" },
      },
    });

    expect(sanitized?.user).toBeUndefined();
    expect(sanitized?.request).toBeUndefined();
    expect(JSON.stringify(sanitized ?? {})).not.toContain("ip_address");
    expect(JSON.stringify(sanitized ?? {})).not.toContain("198.51.100.10");
    expect(JSON.stringify(sanitized ?? {})).not.toContain("{{auto}}");
  });

  it("inspects the real SDK envelope before transport and omits identifying metadata", async () => {
    const envelopes: unknown[] = [];
    const namespace = await import("@sentry/nextjs");
    const sdk =
      typeof namespace.captureEvent === "function"
        ? namespace
        : namespace.default;

    const options = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "verification",
    });

    sdk.init({
      ...options,
      transport: () => ({
        send(envelope: unknown) {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as unknown as Parameters<typeof sdk.init>[0]);

    const integrationNames = (
      sdk.getClient()?.getOptions().integrations ?? []
    ).map((integration: { name: string }) => integration.name);

    for (const name of UNWANTED_INTEGRATIONS) {
      expect(integrationNames).not.toContain(name);
    }

    sdk.captureEvent({
      message: "river_aftercare_error_tracking_verification",
      level: "info",
      tags: {
        environment: "verification",
        component: "observability-verification",
      },
    });

    await sdk.flush(2000);
    if (typeof sdk.close === "function") {
      await sdk.close(2000);
    }

    expect(envelopes.length).toBeGreaterThan(0);
    const payload = JSON.stringify(envelopes);
    expect(payload).not.toContain(FAKE_DSN);
    expect(payload).not.toContain("ip_address");
    expect(payload).not.toContain("{{auto}}");
    expect(payload).not.toContain("server_name");
    expect(payload).not.toMatch(/"modules"\s*:/);
    expect(payload).not.toMatch(/"user"\s*:/);
    expect(payload).not.toContain('"user":"anonymous"');
    expect(payload).not.toMatch(/"device"\s*:/);
    expect(payload).not.toMatch(/"culture"\s*:/);
    expect(payload).not.toContain("RequestData");
    expect(payload).not.toContain("LocalVariables");
    expect(payload).not.toContain("Prisma");
    expect(payload).toContain("river_aftercare_error_tracking_verification");
  });
});
