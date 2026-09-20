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
    "sentry.server.config.ts",
    "next.config.ts",
    "proxy.ts",
    ".env.example",
    "package.json",
  ].filter((path) => existsSync(path));
}

describe("server error tracking source boundary", () => {
  it("does not add client Sentry initialization files", () => {
    expect(existsSync("instrumentation-client.ts")).toBe(false);
    expect(existsSync("instrumentation-client.js")).toBe(false);
    expect(existsSync("sentry.client.config.ts")).toBe(false);
    expect(existsSync("sentry.client.config.js")).toBe(false);
    expect(existsSync("sentry.edge.config.ts")).toBe(false);
  });

  it("does not expose the DSN through NEXT_PUBLIC or a Better Stack JS tag", () => {
    for (const file of sourceFiles()) {
      if (!/\.(ts|tsx|js|mjs|md|example|json)$/.test(file)) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("NEXT_PUBLIC_BETTER_STACK_ERROR_DSN");
      expect(source, file).not.toMatch(
        /js\.betterstack\.com|betterstack\.com\/s\//
      );
      expect(source, file).not.toContain("replayIntegration");
      expect(source, file).not.toContain("browserTracingIntegration");
      expect(source, file).not.toContain("@sentry/replay");
    }
  });

  it("keeps error boundaries free of Sentry", () => {
    for (const file of ERROR_UI_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("@sentry/nextjs");
      expect(source, file).not.toContain("captureException");
      expect(source, file).not.toContain("reportServerException");
    }
  });

  it("does not report telemetry from /api/health", () => {
    const source = readFileSync("app/api/health/route.ts", "utf8");
    expect(source).not.toContain("reportServerException");
    expect(source).not.toContain("reportOperationalFailure");
    expect(source).not.toContain("@sentry/nextjs");
  });

  it("does not wrap next.config with the Sentry wizard client toolchain", () => {
    const source = readFileSync("next.config.ts", "utf8");
    expect(source).not.toContain("withSentryConfig");
    expect(source).toContain('"@sentry/nextjs"');
  });

  it("registers Node server instrumentation only", () => {
    const instrumentation = readFileSync("instrumentation.ts", "utf8");
    expect(instrumentation).toContain('process.env.NEXT_RUNTIME === "nodejs"');
    expect(instrumentation).toContain('NEXT_RUNTIME !== "nodejs"');
    expect(instrumentation).not.toContain("instrumentation-client");
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
