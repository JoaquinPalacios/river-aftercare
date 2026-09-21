import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function walk(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const BILLING_SERVER_FILES = walk("lib/billing").filter((path) =>
  path.endsWith(".ts")
);

const APP_AND_LIB_TS = [...walk("app"), ...walk("lib")].filter((path) =>
  /\.(ts|tsx)$/.test(path)
);

describe("Stripe billing security boundary", () => {
  it("keeps billing modules server-only and out of client bundles", () => {
    expect(BILLING_SERVER_FILES.length).toBeGreaterThan(0);
    for (const file of BILLING_SERVER_FILES) {
      expect(readFileSync(file, "utf8"), file).toContain(
        'import "server-only"'
      );
      expect(readFileSync(file, "utf8"), file).not.toContain("NEXT_PUBLIC_");
    }

    const webhook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
    expect(webhook).toContain("request.text()");
    expect(webhook).toContain("verifyStripeWebhookEvent");
    expect(webhook).toContain('runtime = "nodejs"');
    expect(webhook).not.toContain('from "@/auth"');
    expect(webhook).not.toContain("NEXT_PUBLIC_STRIPE");
    expect(webhook).not.toContain("auth(");

    for (const file of APP_AND_LIB_TS) {
      if (
        file.startsWith("lib/billing/") ||
        file === "app/api/stripe/webhook/route.ts"
      ) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (
        !source.includes('"use client"') &&
        !source.includes("'use client'")
      ) {
        continue;
      }
      expect(source, file).not.toContain("@/lib/billing");
      expect(source, file).not.toContain("STRIPE_SECRET_KEY");
      expect(source, file).not.toContain("STRIPE_WEBHOOK_SECRET");
    }
  });

  it("does not expose Stripe secrets on NEXT_PUBLIC_ names", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).toContain("STRIPE_SECRET_KEY");
    expect(example).toContain("STRIPE_WEBHOOK_SECRET");
    expect(example).not.toMatch(/NEXT_PUBLIC_STRIPE_/);
    expect(example).toMatch(/Never prefix with\s*\n# NEXT_PUBLIC_/);
  });

  it("keeps Checkout server-side and does not add Customer Portal", () => {
    const featureFiles = APP_AND_LIB_TS.filter(
      (path) =>
        !path.startsWith("lib/billing/") &&
        !path.startsWith("tests/") &&
        path !== "app/api/stripe/webhook/route.ts"
    );

    for (const file of featureFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("entitlementStatus");
      expect(source, file).not.toContain("checkout.sessions.create");
      expect(source, file).not.toContain("billingPortal.sessions.create");
      expect(source, file).not.toContain("@stripe/stripe-js");
    }

    expect(existsSync("app/(staff)/billing")).toBe(false);
    expect(existsSync("app/(marketing)/checkout")).toBe(false);

    const packageJson = readFileSync("package.json", "utf8");
    expect(packageJson).toContain('"stripe"');
    expect(packageJson).not.toContain("@stripe/stripe-js");
  });
});
