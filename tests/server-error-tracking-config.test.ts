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
  isValidBetterStackErrorDsn,
  readBetterStackErrorDsn,
  readErrorTrackingRelease,
} from "@/lib/observability/error-tracking-env";
import {
  createErrorTrackingInitOptions,
  initServerErrorTracking,
} from "@/lib/observability/init-server-error-tracking";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("Better Stack error tracking configuration", () => {
  const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    dsn: process.env.BETTER_STACK_ERROR_DSN,
    sha: process.env.VERCEL_GIT_COMMIT_SHA,
  };

  afterEach(() => {
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("BETTER_STACK_ERROR_DSN", previous.dsn);
    restore("VERCEL_GIT_COMMIT_SHA", previous.sha);
    sentryState.init.mockReset();
  });

  it("enables only for production with a valid DSN", () => {
    const enabled = getServerErrorTrackingConfig({
      VERCEL_ENV: "production",
      BETTER_STACK_ERROR_DSN: FAKE_DSN,
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
        BETTER_STACK_ERROR_DSN: FAKE_DSN,
      })
    ).toBe(true);
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
    expect(sentryState.init).not.toHaveBeenCalled();
  });

  it("stays disabled in Preview even with a DSN", () => {
    expect(
      getServerErrorTrackingConfig({
        VERCEL_ENV: "preview",
        BETTER_STACK_ERROR_DSN: FAKE_DSN,
      })
    ).toEqual({ enabled: false });
  });

  it("stays disabled in development even with a DSN", () => {
    expect(
      getServerErrorTrackingConfig({
        VERCEL_ENV: "development",
        NODE_ENV: "development",
        BETTER_STACK_ERROR_DSN: FAKE_DSN,
      })
    ).toEqual({ enabled: false });
  });

  it("stays disabled in test even with a DSN", () => {
    expect(
      getServerErrorTrackingConfig({
        NODE_ENV: "test",
        BETTER_STACK_ERROR_DSN: FAKE_DSN,
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
        BETTER_STACK_ERROR_DSN: FAKE_DSN,
      }).enabled
        ? getServerErrorTrackingConfig({
            VERCEL_ENV: "production",
            BETTER_STACK_ERROR_DSN: FAKE_DSN,
          })
        : null
    ).toMatchObject({ release: undefined });
  });

  it("rejects non-https or malformed DSNs without echoing them", () => {
    expect(isValidBetterStackErrorDsn("http://examplePublicKey@host/1")).toBe(
      false
    );
    expect(readBetterStackErrorDsn({ BETTER_STACK_ERROR_DSN: " " })).toBeNull();
    expect(
      JSON.stringify(
        getServerErrorTrackingConfig({
          VERCEL_ENV: "production",
          BETTER_STACK_ERROR_DSN: "not-a-dsn",
        })
      )
    ).not.toContain("not-a-dsn");
  });

  it("initializes Sentry with privacy-minimal production options", () => {
    initServerErrorTracking({
      VERCEL_ENV: "production",
      BETTER_STACK_ERROR_DSN: FAKE_DSN,
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
      skipOpenTelemetrySetup: boolean;
    };
    expect(options.enabled).toBe(true);
    expect(options.environment).toBe("production");
    expect(options.release).toBe("deadbeefcafebabe");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.enableLogs).toBe(false);
    expect(options.includeLocalVariables).toBe(false);
    expect(options.skipOpenTelemetrySetup).toBe(true);
  });

  it("does not initialize when Vitest is running against process env", () => {
    initServerErrorTracking({
      VITEST: "true",
      VERCEL_ENV: "production",
      BETTER_STACK_ERROR_DSN: FAKE_DSN,
    });
    expect(sentryState.init).not.toHaveBeenCalled();
  });

  it("labels verification init as verification, not production", () => {
    const options = createErrorTrackingInitOptions({
      dsn: FAKE_DSN,
      environment: "verification",
    });
    expect(options.environment).toBe("verification");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.maxBreadcrumbs).toBe(0);
  });
});
