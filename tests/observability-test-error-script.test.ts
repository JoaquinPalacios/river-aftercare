import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  EVENT_NAME,
  VERIFICATION_COMPONENT,
  VERIFICATION_ENVIRONMENT,
  assertNotCi,
  categorizeError,
  createVerificationEvent,
  createVerificationInitOptions,
  formatVerificationFailure,
  isExecutedAsCli,
  isValidVerificationDsn,
  readVerificationDsn,
  resolveSentrySdk,
  sendVerificationEvent,
} from "../scripts/observability-test-error.mjs";

const SCRIPT = "scripts/observability-test-error.mjs";
const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";
const SECRET_DSN = "https://supersecretpublickey@o0.ingest.example.test/99";

function spawnScript(envOverrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.VITEST;
  delete env.CI;
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env,
  });
}

function combinedOutput(result: ReturnType<typeof spawnSync>) {
  return `${result.stdout}\n${result.stderr}`;
}

function mockSentry(overrides: Record<string, unknown> = {}) {
  return {
    init: vi.fn(),
    captureEvent: vi.fn(() => "event-id"),
    flush: vi.fn(async () => true),
    close: vi.fn(async () => true),
    ...overrides,
  };
}

describe("observability:test-error script", () => {
  it("is a CLI-only verifier and refuses CI or a missing DSN", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain("environment: VERIFICATION_ENVIRONMENT");
    expect(source).toContain("river_aftercare_error_tracking_verification");
    expect(source).toContain("component: VERIFICATION_COMPONENT");
    expect(source).not.toMatch(/app\/api|debug\/error|NEXT_PUBLIC_/);
    expect(source).not.toContain("DATABASE_URL");
    expect(source).toContain("sendDefaultPii: false");
    expect(source).toContain("tracesSampleRate: 0");
    expect(source).not.toMatch(/VERCEL_ENV\s*=\s*["']production["']/);
    expect(source).toContain("dotenv/config");

    const missing = spawnScript({ BETTER_STACK_ERROR_DSN: "" });
    expect(missing.status).not.toBe(0);
    expect(combinedOutput(missing)).toMatch(
      /BETTER_STACK_ERROR_DSN is required/
    );
    expect(combinedOutput(missing)).not.toContain(FAKE_DSN);

    const ci = spawnScript({
      CI: "true",
      BETTER_STACK_ERROR_DSN: FAKE_DSN,
    });
    expect(ci.status).not.toBe(0);
    expect(combinedOutput(ci)).toMatch(/Refusing to send/);
    expect(combinedOutput(ci)).not.toContain(FAKE_DSN);
  });

  it("fails cleanly for a malformed DSN without echoing it", () => {
    const malformed = "not-a-dsn";
    const result = spawnScript({ BETTER_STACK_ERROR_DSN: malformed });
    expect(result.status).not.toBe(0);
    expect(combinedOutput(result)).toMatch(/not a valid https DSN/);
    expect(combinedOutput(result)).not.toContain(malformed);
  });
});

describe("verification DSN validation", () => {
  it("accepts a https Sentry-compatible DSN", () => {
    expect(isValidVerificationDsn(FAKE_DSN)).toBe(true);
    expect(
      readVerificationDsn({ BETTER_STACK_ERROR_DSN: ` ${FAKE_DSN} ` })
    ).toBe(FAKE_DSN);
  });

  it("rejects missing or malformed DSNs without returning them", () => {
    expect(() => readVerificationDsn({})).toThrow(/missing_dsn/);
    expect(() => readVerificationDsn({ BETTER_STACK_ERROR_DSN: "" })).toThrow(
      /missing_dsn/
    );
    expect(() =>
      readVerificationDsn({ BETTER_STACK_ERROR_DSN: "http://key@host/1" })
    ).toThrow(/malformed_dsn/);
    expect(isValidVerificationDsn("https://host-without-key/1")).toBe(false);

    try {
      readVerificationDsn({
        BETTER_STACK_ERROR_DSN: SECRET_DSN.replace("https", "http"),
      });
    } catch (err) {
      expect(String(err)).not.toContain("supersecretpublickey");
    }
  });
});

describe("verification Sentry namespace resolution", () => {
  it("uses the namespace when captureEvent is present", () => {
    const namespace = mockSentry();
    expect(resolveSentrySdk(namespace)).toBe(namespace);
  });

  it("falls back to the CJS default export used by standalone Node ESM", () => {
    const sdk = mockSentry();
    const namespace = { init: vi.fn(), default: sdk };
    expect(resolveSentrySdk(namespace)).toBe(sdk);
  });

  it("fails safely when required SDK methods are missing", () => {
    expect(() => resolveSentrySdk({ init: vi.fn() })).toThrow(
      /sdk_api_unavailable/
    );
    expect(
      formatVerificationFailure({ category: "sdk_api_unavailable" })
    ).toMatch(/SDK API unavailable/);
  });
});

describe("verification event send path", () => {
  it("initializes a verification client without VERCEL_ENV=production", async () => {
    const sentry = mockSentry();
    const result = await sendVerificationEvent({
      env: { BETTER_STACK_ERROR_DSN: FAKE_DSN },
      sentry,
    });

    expect(result).toEqual({ queued: true, flushed: true });
    expect(sentry.init).toHaveBeenCalledOnce();
    const options = sentry.init.mock.calls[0]?.[0] as {
      environment: string;
      enabled: boolean;
      sendDefaultPii: boolean;
      tracesSampleRate: number;
      skipOpenTelemetrySetup: boolean;
    };
    expect(options.environment).toBe("verification");
    expect(options.enabled).toBe(true);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.skipOpenTelemetrySetup).toBe(true);
    expect(sentry.captureEvent).toHaveBeenCalledOnce();
    expect(sentry.flush).toHaveBeenCalledOnce();
  });

  it("sends exactly one fixed synthetic event", async () => {
    const sentry = mockSentry();
    await sendVerificationEvent({
      env: { BETTER_STACK_ERROR_DSN: FAKE_DSN },
      sentry,
    });

    expect(sentry.captureEvent).toHaveBeenCalledTimes(1);
    expect(sentry.captureEvent).toHaveBeenCalledWith(createVerificationEvent());
    expect(createVerificationEvent()).toEqual({
      message: EVENT_NAME,
      level: "info",
      tags: {
        environment: VERIFICATION_ENVIRONMENT,
        component: VERIFICATION_COMPONENT,
      },
      fingerprint: [EVENT_NAME],
    });
  });

  it("exits the send path as success only when flush returns true", async () => {
    const sentry = mockSentry({ flush: vi.fn(async () => true) });
    await expect(
      sendVerificationEvent({
        env: { BETTER_STACK_ERROR_DSN: FAKE_DSN },
        sentry,
      })
    ).resolves.toMatchObject({ flushed: true });
  });

  it("fails when flush does not complete", async () => {
    const sentry = mockSentry({ flush: vi.fn(async () => false) });
    await expect(
      sendVerificationEvent({
        env: { BETTER_STACK_ERROR_DSN: FAKE_DSN },
        sentry,
      })
    ).rejects.toThrow(/flush_timeout/);
    expect(formatVerificationFailure({ category: "flush_timeout" })).toMatch(
      /flush timed out/
    );
  });

  it("reports SDK errors as a safe category without leaking the DSN", async () => {
    const sentry = mockSentry({
      init: vi.fn(() => {
        throw new Error(`Invalid Sentry Dsn: ${SECRET_DSN}`);
      }),
    });

    await expect(
      sendVerificationEvent({
        env: { BETTER_STACK_ERROR_DSN: SECRET_DSN },
        sentry,
      })
    ).rejects.toThrow(/malformed_dsn/);

    const printed = formatVerificationFailure(
      new Error(`Invalid Sentry Dsn: ${SECRET_DSN}`)
    );
    expect(printed).toMatch(/not a valid https DSN/);
    expect(printed).not.toContain("supersecretpublickey");
    expect(printed).not.toContain(SECRET_DSN);
  });

  it("does not require VERCEL_ENV for verification init options", () => {
    const options = createVerificationInitOptions(FAKE_DSN);
    expect(options.environment).toBe("verification");
    expect(JSON.stringify(options)).not.toContain("production");
  });
});

describe("verification CLI guards", () => {
  it("refuses CI and Vitest", () => {
    expect(() => assertNotCi({ CI: "true" })).toThrow(/ci_refused/);
    expect(() => assertNotCi({ VITEST: "true" })).toThrow(/ci_refused/);
  });

  it("does not treat an imported module as the CLI entrypoint", () => {
    expect(
      isExecutedAsCli(["node", "vitest"], pathToFileURL(SCRIPT).href)
    ).toBe(false);
  });

  it("categorizes transport failures without echoing secrets", () => {
    expect(categorizeError({ code: "ENOTFOUND" })).toBe("dns_failure");
    expect(categorizeError({ code: "ECONNREFUSED" })).toBe("network_failure");
    expect(formatVerificationFailure({ code: "ENOTFOUND" })).not.toContain(
      "supersecretpublickey"
    );
  });
});
