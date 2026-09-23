import { afterEach, describe, expect, it, vi } from "vitest";

const sentryState = vi.hoisted(() => ({
  init: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  init: sentryState.init,
}));

import {
  getServerErrorTrackingConfig,
  isServerErrorTrackingEnabled,
  isValidSentryDsn,
  readErrorTrackingRelease,
  readSentryDsn,
} from "@/lib/observability/error-tracking-env";
import { getErrorTrackingConfig } from "@/lib/observability/error-tracking-runtime";
import {
  createErrorTrackingInitOptions,
  initServerErrorTracking,
} from "@/lib/observability/init-server-error-tracking";
import { initClientErrorTracking } from "@/lib/observability/init-client-error-tracking";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("Sentry error tracking configuration", () => {
  const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    publicVercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    dsn: process.env.SENTRY_DSN,
    publicDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    sha: process.env.VERCEL_GIT_COMMIT_SHA,
    publicSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  };

  afterEach(() => {
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("NEXT_PUBLIC_VERCEL_ENV", previous.publicVercelEnv);
    restore("SENTRY_DSN", previous.dsn);
    restore("NEXT_PUBLIC_SENTRY_DSN", previous.publicDsn);
    restore("VERCEL_GIT_COMMIT_SHA", previous.sha);
    restore("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", previous.publicSha);
    sentryState.init.mockReset();
  });

  it("enables production when a valid DSN is present", () => {
    const enabled = getServerErrorTrackingConfig({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      VERCEL_GIT_COMMIT_SHA: "abc1234def",
    });
    expect(enabled).toEqual({
      enabled: true,
      dsn: FAKE_DSN,
      environment: "production",
      release: "abc1234def",
    });
    expect(
      isServerErrorTrackingEnabled({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      })
    ).toBe(true);
  });

  it("uses SENTRY_DSN on the server when both DSNs are set", () => {
    const serverDsn = "https://serverKey@o0.ingest.example.test/1";
    expect(
      readSentryDsn(
        {
          SENTRY_DSN: serverDsn,
          NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
        },
        "server"
      )
    ).toBe(serverDsn);
    expect(
      getErrorTrackingConfig(
        {
          VERCEL_ENV: "production",
          SENTRY_DSN: serverDsn,
          NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
        },
        "client"
      )
    ).toMatchObject({ enabled: true, dsn: FAKE_DSN });
  });

  it("labels Preview as preview when a DSN is present", () => {
    expect(
      getServerErrorTrackingConfig({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      })
    ).toEqual({
      enabled: true,
      dsn: FAKE_DSN,
      environment: "preview",
      release: undefined,
    });
  });

  it("stays disabled in production when the DSN is absent and does not throw", () => {
    expect(
      getServerErrorTrackingConfig({
        VERCEL_ENV: "production",
      })
    ).toEqual({ enabled: false });
    expect(() =>
      initServerErrorTracking({
        VERCEL_ENV: "production",
      })
    ).not.toThrow();
    expect(() =>
      initClientErrorTracking({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_VERCEL_ENV: "production",
      })
    ).not.toThrow();
    expect(sentryState.init).not.toHaveBeenCalled();
  });

  it("stays disabled in development even with a DSN", () => {
    expect(
      getServerErrorTrackingConfig({
        VERCEL_ENV: "development",
        NODE_ENV: "development",
        NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      })
    ).toEqual({ enabled: false });
    expect(
      getErrorTrackingConfig(
        {
          NEXT_PUBLIC_VERCEL_ENV: "development",
          NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
        },
        "client"
      )
    ).toEqual({ enabled: false });
  });

  it("stays disabled in test even with a DSN", () => {
    expect(
      getServerErrorTrackingConfig({
        NODE_ENV: "test",
        NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      })
    ).toEqual({ enabled: false });
  });

  it("does not fabricate a release identifier", () => {
    expect(readErrorTrackingRelease({})).toBeUndefined();
    expect(readErrorTrackingRelease({ VERCEL_GIT_COMMIT_SHA: "not sha" })).toBe(
      undefined
    );
    expect(
      getServerErrorTrackingConfig({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      })
    ).toMatchObject({ release: undefined });
  });

  it("rejects non-https or malformed DSNs without echoing them", () => {
    expect(isValidSentryDsn("http://examplePublicKey@host/1")).toBe(false);
    expect(readSentryDsn({ SENTRY_DSN: " " }, "server")).toBeNull();
    expect(
      JSON.stringify(
        getServerErrorTrackingConfig({
          VERCEL_ENV: "production",
          NEXT_PUBLIC_SENTRY_DSN: "not-a-dsn",
        })
      )
    ).not.toContain("not-a-dsn");
  });

  it("initializes Sentry with privacy-minimal production options", () => {
    initServerErrorTracking({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
      VERCEL_GIT_COMMIT_SHA: "deadbeefcafebabe",
    });
    expect(sentryState.init).toHaveBeenCalledOnce();
    const options = sentryState.init.mock.calls[0]?.[0] as {
      enabled: boolean;
      environment: string;
      release: string;
      sendDefaultPii: boolean;
      tracesSampleRate: number;
      maxBreadcrumbs: number;
      enableLogs: boolean;
      includeLocalVariables: boolean;
      includeServerName: boolean;
      skipOpenTelemetrySetup: boolean;
      replaysSessionSampleRate: number;
      replaysOnErrorSampleRate: number;
      profilesSampleRate: number;
    };
    expect(options.enabled).toBe(true);
    expect(options.environment).toBe("production");
    expect(options.release).toBe("deadbeefcafebabe");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.enableLogs).toBe(false);
    expect(options.includeLocalVariables).toBe(false);
    expect(options.includeServerName).toBe(false);
    expect(options.skipOpenTelemetrySetup).toBe(true);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
    expect(options.profilesSampleRate).toBe(0);
  });

  it("does not initialize when Vitest is running against process env", () => {
    initServerErrorTracking({
      VITEST: "true",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
    });
    initClientErrorTracking({
      VITEST: "true",
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN,
    });
    expect(sentryState.init).not.toHaveBeenCalled();
  });

  it("labels verification init as verification, not production", () => {
    const options = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "verification",
    });
    expect(options.environment).toBe("verification");
    expect(options).not.toHaveProperty("release");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.includeServerName).toBe(false);
    expect(options.replaysSessionSampleRate).toBe(0);
  });
});
