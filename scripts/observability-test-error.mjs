#!/usr/bin/env node

/**
 * Trusted-machine verification for Better Stack Error Tracking.
 *
 * Not an HTTP route. Not reachable by production users. Does not touch
 * the application database. Sends one synthetic event only.
 *
 * Usage:
 *   pnpm observability:test-error
 *
 * Loads BETTER_STACK_ERROR_DSN from the environment, or from ignored
 * `.env` via dotenv (same convention as other local scripts). Does not
 * require VERCEL_ENV=production and does not enable application telemetry.
 *
 * The event is labelled environment=verification so it cannot be confused
 * with a production incident. Do not run this from CI or during app tests.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

export const EVENT_NAME = "river_aftercare_error_tracking_verification";
export const FLUSH_TIMEOUT_MS = 8000;
export const VERIFICATION_ENVIRONMENT = "verification";
export const VERIFICATION_COMPONENT = "observability-verification";

const MAX_DSN_LENGTH = 512;

const FAILURE_MESSAGES = {
  missing_dsn:
    "BETTER_STACK_ERROR_DSN is required. This script does not read Production Vercel env automatically.",
  malformed_dsn: "BETTER_STACK_ERROR_DSN is not a valid https DSN.",
  ci_refused: "Refusing to send a verification event from CI or Vitest.",
  sdk_api_unavailable:
    "Verification event could not be sent (SDK API unavailable).",
  sdk_init_failed:
    "Verification event could not be sent (SDK initialization failed).",
  event_not_queued:
    "Verification event could not be sent (event was not queued).",
  flush_timeout: "Verification event could not be sent (flush timed out).",
  dns_failure: "Verification event could not be sent (ingest host DNS failed).",
  network_failure:
    "Verification event could not be sent (network/transport failed).",
  sdk_error: "Verification event could not be sent.",
};

export function isValidVerificationDsn(value) {
  if (typeof value !== "string") {
    return false;
  }

  const dsn = value.trim();
  if (!dsn || dsn.length > MAX_DSN_LENGTH || /\s/.test(dsn)) {
    return false;
  }

  try {
    const url = new URL(dsn);
    return (
      url.protocol === "https:" &&
      url.username.length > 0 &&
      url.hostname.length > 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

/** @param {Record<string, string | undefined>} [env] */
export function readVerificationDsn(env = process.env) {
  const raw = env.BETTER_STACK_ERROR_DSN;
  if (typeof raw !== "string" || !raw.trim()) {
    throw categorizedError("missing_dsn");
  }

  const dsn = raw.trim();
  if (!isValidVerificationDsn(dsn)) {
    throw categorizedError("malformed_dsn");
  }

  return dsn;
}

/** @param {Record<string, string | undefined>} [env] */
export function assertNotCi(env = process.env) {
  if (env.CI === "true" || env.VITEST) {
    throw categorizedError("ci_refused");
  }
}

export function resolveSentrySdk(namespace) {
  const sdk =
    namespace && typeof namespace.captureEvent === "function"
      ? namespace
      : namespace?.default;

  if (
    !sdk ||
    typeof sdk.init !== "function" ||
    typeof sdk.captureEvent !== "function" ||
    typeof sdk.flush !== "function"
  ) {
    throw categorizedError("sdk_api_unavailable");
  }

  return sdk;
}

export function createVerificationInitOptions(dsn) {
  return {
    dsn,
    enabled: true,
    environment: VERIFICATION_ENVIRONMENT,
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
  };
}

export function createVerificationEvent() {
  return {
    message: EVENT_NAME,
    level: "info",
    tags: {
      environment: VERIFICATION_ENVIRONMENT,
      component: VERIFICATION_COMPONENT,
    },
    fingerprint: [EVENT_NAME],
  };
}

export function categorizeError(err) {
  if (
    err &&
    typeof err.category === "string" &&
    FAILURE_MESSAGES[err.category]
  ) {
    return err.category;
  }

  const code = typeof err?.code === "string" ? err.code : "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "dns_failure";
  }
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET"
  ) {
    return "network_failure";
  }

  const message = String(err?.message || "");
  if (/Invalid Sentry Dsn/i.test(message)) {
    return "malformed_dsn";
  }
  if (err?.name === "TypeError" && /is not a function/.test(message)) {
    return "sdk_api_unavailable";
  }

  return "sdk_error";
}

export function formatVerificationFailure(err) {
  return FAILURE_MESSAGES[categorizeError(err)] || FAILURE_MESSAGES.sdk_error;
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>;
 *   sentry: {
 *     init: Function;
 *     captureEvent: Function;
 *     flush: Function;
 *     close?: Function;
 *   };
 * }} args
 */
export async function sendVerificationEvent({ env = process.env, sentry }) {
  const dsn = readVerificationDsn(env);

  try {
    sentry.init(createVerificationInitOptions(dsn));
  } catch (err) {
    throw categorizedError(
      categorizeError(err) === "malformed_dsn"
        ? "malformed_dsn"
        : "sdk_init_failed"
    );
  }

  let eventId;
  try {
    eventId = sentry.captureEvent(createVerificationEvent());
  } catch (err) {
    throw categorizedError(
      categorizeError(err) === "sdk_api_unavailable"
        ? "sdk_api_unavailable"
        : "sdk_error"
    );
  }

  if (!eventId) {
    throw categorizedError("event_not_queued");
  }

  let flushed;
  try {
    flushed = await sentry.flush(FLUSH_TIMEOUT_MS);
  } catch (err) {
    throw categorizedError(categorizeError(err));
  }

  if (flushed !== true) {
    throw categorizedError("flush_timeout");
  }

  if (typeof sentry.close === "function") {
    try {
      await sentry.close(FLUSH_TIMEOUT_MS);
    } catch {
      // Event already flushed. Closing the client must not convert a
      // successful delivery into a false failure.
    }
  }

  return { queued: true, flushed: true };
}

export function isExecutedAsCli(
  argv = process.argv,
  moduleUrl = import.meta.url
) {
  const entry = argv[1];
  if (!entry) {
    return false;
  }

  return moduleUrl === pathToFileURL(path.resolve(entry)).href;
}

function categorizedError(category) {
  const error = new Error(category);
  error.category = category;
  return error;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  assertNotCi();
  await import("dotenv/config");
  readVerificationDsn();
  const namespace = await import("@sentry/nextjs");
  const sentry = resolveSentrySdk(namespace);
  await sendVerificationEvent({ env: process.env, sentry });
  console.log("Verification event sent successfully.");
}

if (isExecutedAsCli()) {
  main().catch((err) => {
    fail(formatVerificationFailure(err));
  });
}
