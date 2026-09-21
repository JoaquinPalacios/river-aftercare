import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ERROR_UI_FILES = [
  "app/global-error.tsx",
  "app/(marketing)/error.tsx",
  "app/(marketing)/global-error.tsx",
  "app/(staff)/error.tsx",
  "app/(staff)/global-error.tsx",
  "app/(aftercare)/error.tsx",
  "app/(aftercare)/global-error.tsx",
  "app/(aftercare)/%5Fsites/[tenant]/error.tsx",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") {
      return [];
    }
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sourceFiles(): string[] {
  return [
    ...walk("app"),
    ...walk("lib"),
    ...walk("scripts"),
    "instrumentation.ts",
    "instrumentation-client.ts",
    "sentry.server.config.ts",
    "next.config.ts",
    "proxy.ts",
    ".env.example",
    "package.json",
  ].filter((path) => existsSync(path));
}

describe("Sentry error tracking source boundary", () => {
  it("initializes the client SDK through instrumentation-client.ts", () => {
    expect(existsSync("instrumentation-client.ts")).toBe(true);
    expect(existsSync("sentry.edge.config.ts")).toBe(false);
    const source = readFileSync("instrumentation-client.ts", "utf8");
    expect(source).toContain("initClientErrorTracking");
    expect(source).not.toContain("captureRouterTransitionStart");
    expect(source).not.toContain("replayIntegration");
  });

  it("does not expose source-map secrets or enable Session Replay", () => {
    for (const file of sourceFiles()) {
      if (!/\.(ts|tsx|js|mjs|md|example|json)$/.test(file)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("NEXT_PUBLIC_SENTRY_AUTH_TOKEN");
      expect(source, file).not.toContain("NEXT_PUBLIC_BETTER_STACK_ERROR_DSN");
      expect(source, file).not.toMatch(
        /js\.betterstack\.com|betterstack\.com\/s\//
      );
      expect(source, file).not.toContain("replayIntegration");
      expect(source, file).not.toContain("browserTracingIntegration");
      expect(source, file).not.toContain("@sentry/replay");
    }
  });

  it("keeps error UI on the River Aftercare reporter without Sentry internals", () => {
    expect(
      readFileSync("app/components/global-error-document.tsx", "utf8")
    ).toContain("ClientErrorReporter");

    for (const file of ERROR_UI_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("@sentry/nextjs");
      expect(source, file).not.toContain("eventId");
      expect(source, file).not.toContain("reportServerException");
    }

    expect(readFileSync("app/(marketing)/error.tsx", "utf8")).toContain(
      "ClientErrorReporter"
    );
    expect(readFileSync("app/(staff)/error.tsx", "utf8")).toContain(
      "ClientErrorReporter"
    );
    expect(readFileSync("app/(aftercare)/error.tsx", "utf8")).toContain(
      "ClientErrorReporter"
    );
  });

  it("does not report telemetry from /api/health", () => {
    const source = readFileSync("app/api/health/route.ts", "utf8");
    expect(source).not.toContain("reportServerException");
    expect(source).not.toContain("reportOperationalFailure");
    expect(source).not.toContain("@sentry/nextjs");
  });

  it("wraps next.config for optional source maps without requiring secrets", () => {
    const source = readFileSync("next.config.ts", "utf8");
    expect(source).toContain("withSentryConfig");
    expect(source).toContain("createSentryBuildOptions");
    expect(source).toContain('"@sentry/nextjs"');
  });

  it("registers Node server instrumentation only", () => {
    const instrumentation = readFileSync("instrumentation.ts", "utf8");
    expect(instrumentation).toContain('process.env.NEXT_RUNTIME === "nodejs"');
    expect(instrumentation).toContain('NEXT_RUNTIME !== "nodejs"');
    expect(instrumentation).not.toMatch(/NEXT_RUNTIME === ["']edge["']/);
    expect(instrumentation).not.toContain("@sentry/nextjs");
    expect(readFileSync("sentry.server.config.ts", "utf8")).toContain(
      "initServerErrorTracking"
    );
    expect(readFileSync("proxy.ts", "utf8")).not.toContain("@sentry/nextjs");
  });

  it("keeps business modules on the River Aftercare wrapper", () => {
    const files = [
      "lib/marketing/contact-mailer.ts",
      "lib/auth/request-password-reset.ts",
      "lib/operator/deliver-clinic-invitation-email.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain(
        "@/lib/observability/report-server-exception"
      );
      expect(source, file).not.toContain("@sentry/nextjs");
    }
  });
});
