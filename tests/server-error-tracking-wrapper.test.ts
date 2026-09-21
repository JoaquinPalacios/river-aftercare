import { afterEach, describe, expect, it, vi } from "vitest";

const sentryState = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureEvent: vi.fn(),
  captureRequestError: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryState.captureException,
  captureEvent: sentryState.captureEvent,
  captureRequestError: sentryState.captureRequestError,
}));

import {
  OPERATIONAL_FAILURE_CODES,
  reportAuthEmailFailure,
  reportContactEmailFailure,
  reportOperationalFailure,
  reportServerException,
} from "@/lib/observability/report-server-exception";
import { captureServerRequestError } from "@/lib/observability/on-request-error";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("server error tracking wrapper", () => {
  const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    serverDsn: process.env.SENTRY_DSN,
  };

  afterEach(() => {
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("NEXT_PUBLIC_SENTRY_DSN", previous.dsn);
    restore("SENTRY_DSN", previous.serverDsn);
    sentryState.captureException.mockReset();
    sentryState.captureEvent.mockReset();
    sentryState.captureRequestError.mockReset();
  });

  it("captures exceptions when production tracking is enabled", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    const error = new Error("server exploded");
    reportServerException(error, { tags: { component: "auth-email" } });
    expect(sentryState.captureException).toHaveBeenCalledOnce();
    expect(sentryState.captureException.mock.calls[0]?.[0]).toBe(error);
    expect(sentryState.captureException.mock.calls[0]?.[1]).toEqual({
      tags: { component: "auth-email" },
    });
  });

  it("is a no-op when tracking is disabled", () => {
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    reportServerException(new Error("ignored"));
    reportContactEmailFailure("delivery_failed");
    expect(sentryState.captureException).not.toHaveBeenCalled();
    expect(sentryState.captureEvent).not.toHaveBeenCalled();
  });

  it("never lets a telemetry failure escape", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    sentryState.captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });
    expect(() => reportServerException(new Error("app error"))).not.toThrow();
  });

  it("allow-lists and sanitizes operational metadata", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    reportOperationalFailure(
      OPERATIONAL_FAILURE_CODES.CONTACT_EMAIL_DELIVERY_FAILED,
      {
        component: "contact-email",
        failure_code: "delivery_failed",
      }
    );
    expect(sentryState.captureEvent).toHaveBeenCalledOnce();
    const event = sentryState.captureEvent.mock.calls[0]?.[0] as {
      message: string;
      tags: Record<string, string>;
    };
    expect(event.message).toBe("contact_email_delivery_failed");
    expect(event.tags).toEqual({
      component: "contact-email",
      failure_code: "delivery_failed",
      environment: "production",
    });
    expect(JSON.stringify(event)).not.toContain("@");
    expect(JSON.stringify(event)).not.toContain("token");
  });

  it("does not forward arbitrary request or recipient fields", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    reportAuthEmailFailure("not_configured");
    const event = sentryState.captureEvent.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(event.message).toBe("auth_email_not_configured");
    expect(event).not.toHaveProperty("extra");
    expect(event).not.toHaveProperty("user");
    expect(JSON.stringify(event)).not.toMatch(/recipient|subject|html|to:/i);
  });

  it("strips headers before captureRequestError and swallows SDK failures", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
    await captureServerRequestError(
      new Error("rsc failed"),
      {
        path: "/guides?email=a@b.c",
        method: "GET",
        headers: {
          cookie: "authjs.session-token=secret",
          authorization: "Bearer abc",
        },
      },
      { routePath: "/guides", routerKind: "App Router", routeType: "render" }
    );
    expect(sentryState.captureRequestError).toHaveBeenCalledOnce();
    const request = sentryState.captureRequestError.mock.calls[0]?.[1] as {
      path: string;
      headers: Record<string, string>;
    };
    expect(request.headers).toEqual({});
    expect(request.path).not.toContain("email=");
    expect(
      JSON.stringify(sentryState.captureRequestError.mock.calls)
    ).not.toContain("authjs.session-token");

    sentryState.captureRequestError.mockClear();
    await captureServerRequestError(
      new Error("reset exploded"),
      {
        path: "/reset-password#token=SECRET",
        method: "GET",
        headers: { cookie: "authjs.session-token=secret" },
      },
      {
        routePath: "/reset-password",
        routerKind: "App Router",
        routeType: "render",
      }
    );
    expect(sentryState.captureRequestError.mock.calls[0]?.[1]).toMatchObject({
      path: "/reset-password",
      headers: {},
    });
    expect(
      JSON.stringify(sentryState.captureRequestError.mock.calls)
    ).not.toContain("SECRET");

    sentryState.captureRequestError.mockRejectedValue(new Error("timeout"));
    await expect(
      captureServerRequestError(
        new Error("still going"),
        { path: "/login", method: "POST", headers: {} },
        { routerKind: "App Router", routePath: "/login", routeType: "render" }
      )
    ).resolves.toBeUndefined();
  });
});
