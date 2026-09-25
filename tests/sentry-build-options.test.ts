import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createSentryBuildOptions,
  shouldUploadSentrySourceMaps,
} from "@/lib/observability/sentry-build-options";

describe("Sentry source-map build options", () => {
  it("does not upload source maps without org, project, and auth token", () => {
    expect(shouldUploadSentrySourceMaps({})).toBe(false);
    expect(
      shouldUploadSentrySourceMaps({
        SENTRY_ORG: "river-aftercare",
        SENTRY_PROJECT: "river-aftercare",
      })
    ).toBe(false);
    expect(
      shouldUploadSentrySourceMaps({
        NODE_ENV: "test",
        SENTRY_AUTH_TOKEN: "sntrys_example",
        SENTRY_ORG: "river-aftercare",
        SENTRY_PROJECT: "river-aftercare",
      })
    ).toBe(false);

    const options = createSentryBuildOptions({
      VERCEL_GIT_COMMIT_SHA: "abc1234def",
    });
    expect(options.sourcemaps.disable).toBe(true);
    expect(options.release.create).toBe(false);
    expect(options.release.finalize).toBe(false);
    expect(options.telemetry).toBe(false);
    expect(options.routeManifestInjection).toBe(false);
    expect(options.bundleSizeOptimizations.excludeTracing).toBe(true);
    expect(options).not.toHaveProperty("authToken");
    expect(typeof options.errorHandler).toBe("function");
    expect(() => options.errorHandler()).not.toThrow();
  });

  it("enables upload only when all source-map credentials are present outside tests", () => {
    const options = createSentryBuildOptions({
      SENTRY_AUTH_TOKEN: "sntrys_example",
      SENTRY_ORG: "river-aftercare",
      SENTRY_PROJECT: "river-aftercare",
      VERCEL_GIT_COMMIT_SHA: "deadbeefcafebabe",
    });
    expect(
      shouldUploadSentrySourceMaps({
        SENTRY_AUTH_TOKEN: "sntrys_example",
        SENTRY_ORG: "river-aftercare",
        SENTRY_PROJECT: "river-aftercare",
      })
    ).toBe(true);
    expect(options.sourcemaps.disable).toBe(false);
    expect(options.release.name).toBe("deadbeefcafebabe");
    expect(options.release.create).toBe(true);
    expect(options.authToken).toBe("sntrys_example");
  });

  it("defines Sentry tree-shake flags for the Turbopack client build", () => {
    const source = readFileSync("next.config.ts", "utf8");
    expect(source).toContain("compiler:");
    expect(source).toContain("define:");
    expect(source).toContain("__SENTRY_DEBUG__: false");
    expect(source).toContain("__SENTRY_TRACING__: false");
    expect(source).toContain("__RRWEB_EXCLUDE_IFRAME__: true");
    expect(source).toContain("__RRWEB_EXCLUDE_SHADOW_DOM__: true");
    expect(source).toContain("__SENTRY_EXCLUDE_REPLAY_WORKER__: true");
    expect(source).toContain('"@sentry/nextjs"');
  });
});
