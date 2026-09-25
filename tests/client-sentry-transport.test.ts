import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

import { createErrorTrackingInitOptions } from "@/lib/observability/error-tracking-privacy";

const require = createRequire(import.meta.url);

type SentryClient = {
  init: (options: Record<string, unknown>) => unknown;
  captureException: (error: unknown) => string;
  flush: (timeout?: number) => Promise<boolean>;
  close: (timeout?: number) => Promise<boolean>;
  getClient: () =>
    | {
        getIntegrationByName: (name: string) => unknown;
      }
    | undefined;
};

// Node resolves `@sentry/nextjs` to the server build. This test loads the
// browser client the production instrumentation-client entry uses.
const Sentry =
  require("../node_modules/@sentry/nextjs/build/cjs/client/index.js") as SentryClient;

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

function envelopeText(envelopes: unknown[]): string {
  return JSON.stringify(envelopes);
}

describe("browser Sentry client transport", () => {
  const sent: unknown[] = [];
  const previousOnError = globalThis.onerror;
  const previousOnUnhandledRejection = globalThis.onunhandledrejection;

  afterEach(async () => {
    await Sentry.close(2000);
    globalThis.onerror = previousOnError;
    globalThis.onunhandledrejection = previousOnUnhandledRejection;
    sent.length = 0;
  });

  function init() {
    Sentry.init({
      ...createErrorTrackingInitOptions({
        dsn: FAKE_DSN,
        environment: "production",
      }),
      transport() {
        return {
          send(envelope: unknown) {
            sent.push(envelope);
            return Promise.resolve({});
          },
          flush() {
            return Promise.resolve(true);
          },
        };
      },
    });
  }

  it("sends explicit captureException, onerror, and unhandledrejection", async () => {
    init();
    const client = Sentry.getClient();
    expect(client?.getIntegrationByName("GlobalHandlers")).toBeTruthy();
    expect(client?.getIntegrationByName("LinkedErrors")).toBeTruthy();
    expect(
      client?.getIntegrationByName("NextjsClientStackFrameNormalization")
    ).toBeTruthy();
    expect(client?.getIntegrationByName("BrowserTracing")).toBeFalsy();
    expect(client?.getIntegrationByName("Breadcrumbs")).toBeFalsy();
    expect(client?.getIntegrationByName("Replay")).toBeFalsy();

    // React render and hydration failures reach this same captureException
    // call from ClientErrorReporter after the error boundary commits.
    Sentry.captureException(new Error("river client captureException"));
    const onerror = globalThis.onerror as
      | ((
          message: string,
          source?: string,
          lineno?: number,
          colno?: number,
          error?: Error
        ) => void)
      | null;
    const onunhandledrejection = globalThis.onunhandledrejection as
      ((event: { reason: unknown }) => void) | null;
    expect(onerror).toEqual(expect.any(Function));
    expect(onunhandledrejection).toEqual(expect.any(Function));
    onerror?.(
      "river client onerror",
      "https://riveraftercare.com.au/login?email=person@example.test#token=SECRET",
      1,
      1,
      new Error("river client onerror")
    );
    onunhandledrejection?.({
      reason: new Error("river client unhandledrejection"),
    });

    await Sentry.flush(2000);
    const body = envelopeText(sent);
    expect(body).toContain("sentry.javascript.nextjs");
    expect(body).toContain("river client captureException");
    expect(body).toContain("river client onerror");
    expect(body).toContain("river client unhandledrejection");
    expect(body).not.toContain("person@example.test");
    expect(body).not.toContain("SECRET");
  });
});
