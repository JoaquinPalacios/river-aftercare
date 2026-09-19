import { readFileSync } from "node:fs";

import type { BeforeSendEvent } from "@vercel/analytics/next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { vercelWebAnalyticsBeforeSend } from "@/lib/telemetry/vercel-web-analytics";

const ROOT_LAYOUTS = [
  "app/(marketing)/layout.tsx",
  "app/(staff)/layout.tsx",
  "app/(aftercare)/layout.tsx",
] as const;

const pageview: BeforeSendEvent = {
  type: "pageview",
  url: "https://example.test/",
};

describe("Vercel platform telemetry", () => {
  it("loads Analytics and Speed Insights from every root layout", () => {
    for (const path of ROOT_LAYOUTS) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(
        'from "@/lib/telemetry/vercel-web-analytics"'
      );
      expect(source, path).toContain(
        'import { SpeedInsights } from "@vercel/speed-insights/next"'
      );
      expect(source, path).toContain("<VercelWebAnalytics />");
      expect(source, path).toContain("<SpeedInsights />");
      expect(source, path).not.toMatch(/['"]use client['"]/);
    }
  });

  it("opts Web Analytics out through the official beforeSend API", () => {
    const source = readFileSync(
      "lib/telemetry/vercel-web-analytics.tsx",
      "utf8"
    );
    expect(source).toContain(
      'import { Analytics } from "@vercel/analytics/next"'
    );
    expect(source).toContain("beforeSend={vercelWebAnalyticsBeforeSend}");
    expect(source).toContain('localStorage.getItem("va-disable") === "1"');
    expect(source).not.toContain("SpeedInsights");
  });
});

describe("vercelWebAnalyticsBeforeSend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when localStorage va-disable is 1", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "va-disable" ? "1" : null),
    });

    expect(vercelWebAnalyticsBeforeSend(pageview)).toBeNull();
  });

  it("returns the event unchanged otherwise", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
    });

    expect(vercelWebAnalyticsBeforeSend(pageview)).toBe(pageview);

    vi.stubGlobal("localStorage", {
      getItem: () => "0",
    });
    expect(vercelWebAnalyticsBeforeSend(pageview)).toEqual(pageview);
  });

  it("strips reset-password and accept-invitation URL fragments before analytics send", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
    });

    const reset: BeforeSendEvent = {
      type: "pageview",
      url: "https://app.example.test/reset-password#token=abc",
    };
    expect(vercelWebAnalyticsBeforeSend(reset)).toEqual({
      type: "pageview",
      url: "https://app.example.test/reset-password",
    });

    const invite: BeforeSendEvent = {
      type: "pageview",
      url: "https://app.example.test/accept-invitation#token=abc",
    };
    expect(vercelWebAnalyticsBeforeSend(invite)).toEqual({
      type: "pageview",
      url: "https://app.example.test/accept-invitation",
    });
  });
});
