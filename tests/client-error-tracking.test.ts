import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

const sentryState = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryState.captureException,
  init: sentryState.init,
}));

import { createErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";
import {
  getErrorTrackingConfig,
  readClientErrorTrackingEnv,
} from "@/lib/observability/error-tracking-runtime";
import { initClientErrorTracking } from "@/lib/observability/init-client-error-tracking";
import { reportClientException } from "@/lib/observability/report-client-exception";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";
const RELEASE_SHA = "abcdef1234567890abcdef1234567890abcdef12";

function exportedFunction(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Could not read export function ${name}`);
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("client error tracking", () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    publicVercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    publicDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    publicSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  };

  afterEach(() => {
    restore("NODE_ENV", previous.nodeEnv);
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("NEXT_PUBLIC_VERCEL_ENV", previous.publicVercelEnv);
    restore("NEXT_PUBLIC_SENTRY_DSN", previous.publicDsn);
    restore("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", previous.publicSha);
    sentryState.captureException.mockReset();
    sentryState.init.mockReset();
  });

  it("reads browser env through direct NEXT_PUBLIC_ member expressions", () => {
    const runtime = readFileSync(
      "lib/observability/error-tracking-runtime.ts",
      "utf8"
    );
    const reader = exportedFunction(runtime, "readClientErrorTrackingEnv");
    expect(reader).toContain("process.env.NEXT_PUBLIC_VERCEL_ENV");
    expect(reader).toContain("process.env.NEXT_PUBLIC_SENTRY_DSN");
    expect(reader).toContain("process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA");
    expect(reader).toContain("process.env.NODE_ENV");
    expect(reader).not.toContain("process.env[");
    expect(reader).not.toContain("= process.env");
    expect(reader).not.toContain("process.env.VERCEL_ENV");
    expect(reader).not.toContain("env.VERCEL_ENV");
    expect(reader).not.toContain("VITEST");

    const initSource = exportedFunction(
      readFileSync("lib/observability/init-client-error-tracking.ts", "utf8"),
      "initClientErrorTracking"
    );
    expect(initSource).toContain("readClientErrorTrackingEnv()");
    expect(initSource).not.toContain("= process.env");
    expect(initSource).not.toContain("process.env[");

    const reporter = exportedFunction(
      readFileSync("lib/observability/report-client-exception.ts", "utf8"),
      "reportClientException"
    );
    expect(reporter).toContain("readClientErrorTrackingEnv()");
    expect(reporter).not.toContain("process.env");

    expect(readFileSync("instrumentation-client.ts", "utf8")).toContain(
      "initClientErrorTracking();"
    );
  });

  it("does not capture browser exceptions when Sentry is not configured", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(() => reportClientException(new Error("ui crash"))).not.toThrow();
    expect(sentryState.captureException).not.toHaveBeenCalled();
  });

  it("captures browser exceptions in production when the public DSN is set", () => {
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    const error = new Error("client exploded");
    reportClientException(error);
    expect(sentryState.captureException).toHaveBeenCalledOnce();
    expect(sentryState.captureException.mock.calls[0]?.[0]).toBe(error);
  });

  it("does not treat server-only VERCEL_ENV as the browser gate", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    reportClientException(new Error("ui crash"));
    expect(sentryState.captureException).not.toHaveBeenCalled();
  });

  it("never lets a client telemetry failure escape", () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    sentryState.captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });
    expect(() => reportClientException(new Error("ui crash"))).not.toThrow();
  });

  it("does not initialize the browser SDK from tests", () => {
    initClientErrorTracking({
      VITEST: "true",
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
    });
    expect(sentryState.init).not.toHaveBeenCalled();
  });

  it("initializes production and preview clients from the public env", () => {
    restore("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = RELEASE_SHA;

    expect(readClientErrorTrackingEnv()).toMatchObject({
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
    });
    expect(
      getErrorTrackingConfig(readClientErrorTrackingEnv(), "client")
    ).toMatchObject({
      enabled: true,
      dsn: FAKE_DSN,
      environment: "production",
      release: RELEASE_SHA,
    });

    initClientErrorTracking();
    expect(sentryState.init).toHaveBeenCalledOnce();
    const options = sentryState.init.mock.calls[0]?.[0] as {
      dsn: string;
      environment: string;
      release: string;
      sendDefaultPii: boolean;
      tracesSampleRate: number;
      profilesSampleRate: number;
      replaysSessionSampleRate: number;
    };
    expect(options.dsn).toBe(FAKE_DSN);
    expect(options.environment).toBe("production");
    expect(options.release).toBe(RELEASE_SHA);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.profilesSampleRate).toBe(0);
    expect(options.replaysSessionSampleRate).toBe(0);

    sentryState.init.mockClear();
    initClientErrorTracking({
      NODE_ENV: "production",
      NEXT_PUBLIC_VERCEL_ENV: "preview",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
    });
    expect(sentryState.init).toHaveBeenCalledOnce();
    expect(sentryState.init.mock.calls[0]?.[0]).toMatchObject({
      environment: "preview",
      dsn: FAKE_DSN,
    });
    expect(sentryState.init.mock.calls[0]?.[0]).not.toHaveProperty("release");
  });

  it("stays disabled without a DSN or with an unexpected environment", () => {
    expect(
      getErrorTrackingConfig(
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_VERCEL_ENV: "production",
        },
        "client"
      )
    ).toEqual({ enabled: false });
    expect(
      getErrorTrackingConfig(
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_VERCEL_ENV: "staging",
          NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
        },
        "client"
      )
    ).toEqual({ enabled: false });

    restore("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    initClientErrorTracking();
    expect(sentryState.init).not.toHaveBeenCalled();
  });

  it("keeps a normal browser exception after beforeSend", () => {
    const options = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "production",
      release: RELEASE_SHA,
    });
    const sent = options.beforeSend({
      exception: {
        values: [
          {
            type: "Error",
            value: "river_aftercare_sentry_production_verification",
            mechanism: {
              type: "auto.browser.global_handlers.onerror",
              handled: false,
            },
          },
        ],
      },
      request: {
        url: "https://riveraftercare.com.au/?email=person@example.test#token=SECRET",
      },
      user: { email: "person@example.test" },
    });
    expect(options.release).toBe(RELEASE_SHA);
    expect(sent).toMatchObject({
      exception: {
        values: [
          {
            type: "Error",
            value: "river_aftercare_sentry_production_verification",
          },
        ],
      },
    });
    expect(sent?.user).toBeUndefined();
    expect(sent?.request).toEqual({
      url: "https://riveraftercare.com.au/",
    });
    expect(JSON.stringify(sent)).not.toContain("SECRET");
    expect(JSON.stringify(sent)).not.toContain("person@example.test");
  });

  it("omits an absent release instead of sending release: undefined", () => {
    const options = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "production",
    });
    expect(options).not.toHaveProperty("release");
    expect(JSON.stringify(options)).not.toContain('"release":null');
    expect(JSON.stringify(options)).not.toContain('"release":undefined');
  });
});
