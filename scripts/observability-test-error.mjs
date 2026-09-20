#!/usr/bin/env node

/**
 * Trusted-machine verification for Better Stack Error Tracking.
 *
 * Not an HTTP route. Not reachable by production users. Does not touch
 * the application database. Sends one synthetic event only.
 *
 * Usage:
 *   BETTER_STACK_ERROR_DSN="https://…@…" pnpm observability:test-error
 *
 * The event is labelled environment=verification so it cannot be confused
 * with a production incident. Do not run this from CI or during app tests.
 */

import * as Sentry from "@sentry/nextjs";

const EVENT_NAME = "river_aftercare_error_tracking_verification";
const FLUSH_TIMEOUT_MS = 4000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readDsn() {
  const dsn = process.env.BETTER_STACK_ERROR_DSN?.trim();
  if (!dsn) {
    fail(
      "BETTER_STACK_ERROR_DSN is required. This script does not read Production Vercel env automatically."
    );
  }
  if (dsn.length > 512 || /\s/.test(dsn) || !dsn.startsWith("https://")) {
    fail("BETTER_STACK_ERROR_DSN is not a valid https DSN.");
  }
  try {
    const url = new URL(dsn);
    if (!url.username || !url.hostname || url.search || url.hash) {
      fail("BETTER_STACK_ERROR_DSN is not a valid https DSN.");
    }
  } catch {
    fail("BETTER_STACK_ERROR_DSN is not a valid https DSN.");
  }
  return dsn;
}

function assertNotCi() {
  if (process.env.CI === "true" || process.env.VITEST) {
    fail("Refusing to send a verification event from CI or Vitest.");
  }
}

async function main() {
  assertNotCi();
  const dsn = readDsn();

  Sentry.init({
    dsn,
    enabled: true,
    environment: "verification",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    enableLogs: false,
    includeLocalVariables: false,
    sendClientReports: false,
    skipOpenTelemetrySetup: true,
    beforeSend(event) {
      return {
        ...event,
        user: undefined,
        request: undefined,
        breadcrumbs: [],
        extra: undefined,
        message: EVENT_NAME,
      };
    },
  });

  Sentry.captureEvent({
    message: EVENT_NAME,
    level: "info",
    tags: {
      environment: "verification",
      component: "error-tracking-verification",
    },
    fingerprint: [EVENT_NAME],
  });

  await Sentry.flush(FLUSH_TIMEOUT_MS);
  await Sentry.close(FLUSH_TIMEOUT_MS);
  console.log(`Sent ${EVENT_NAME} (environment=verification).`);
}

main().catch(() => {
  fail("Verification event could not be sent.");
});
