import { afterEach, describe, expect, it, vi } from "vitest";

const sentryState = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryState.captureException,
  init: sentryState.init,
}));

import { initClientErrorTracking } from "@/lib/observability/init-client-error-tracking";
import { reportClientException } from "@/lib/observability/report-client-exception";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("client error tracking", () => {
  const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    publicVercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    publicDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  };

  afterEach(() => {
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("NEXT_PUBLIC_VERCEL_ENV", previous.publicVercelEnv);
    restore("NEXT_PUBLIC_SENTRY_DSN", previous.publicDsn);
    sentryState.captureException.mockReset();
    sentryState.init.mockReset();
  });

  it("does not capture browser exceptions when Sentry is not configured", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(() => reportClientException(new Error("ui crash"))).not.toThrow();
    expect(sentryState.captureException).not.toHaveBeenCalled();
  });

  it("captures browser exceptions in production when the public DSN is set", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    const error = new Error("client exploded");
    reportClientException(error);
    expect(sentryState.captureException).toHaveBeenCalledOnce();
    expect(sentryState.captureException.mock.calls[0]?.[0]).toBe(error);
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
});
