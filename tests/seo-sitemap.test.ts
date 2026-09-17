import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DEFAULT_MARKETING_PAGE_SEO } from "@/lib/seo/defaults";
import {
  buildMarketingSitemap,
  isSitemapLastModifiedDate,
} from "@/lib/seo/sitemap";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/contact",
  "/about",
  "/privacy",
  "/terms",
  "/dental",
  "/physiotherapy",
  "/chiropractic",
  "/cosmetic-clinics",
] as const;

function pathFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname === "" ? "/" : parsed.pathname;
}

describe("marketing sitemap lastmod", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousBase = process.env.CARE_GUIDE_METADATA_BASE;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    restore("CARE_GUIDE_METADATA_BASE", previousBase);
    vi.useRealTimers();
  });

  it("lists every public marketing route from the canonical SEO config", () => {
    expect([...MARKETING_SEO_PATHS]).toEqual([...PUBLIC_PATHS]);
    const entries = buildMarketingSitemap({ origin: "http://localhost" });
    expect(entries.map((entry) => pathFromUrl(entry.url))).toEqual([
      ...MARKETING_SEO_PATHS,
    ]);
    expect(entries.map((entry) => entry.lastModified)).toEqual(
      MARKETING_SEO_PATHS.map(
        (path) => DEFAULT_MARKETING_PAGE_SEO[path].lastModified
      )
    );
  });

  it("keeps lastModified stable across repeated generation and clock changes", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
    const first = buildMarketingSitemap({ origin: "http://localhost" });
    const firstRoute = sitemap();
    vi.setSystemTime(new Date("2026-12-01T23:59:59.999Z"));
    const second = buildMarketingSitemap({ origin: "http://localhost" });
    const secondRoute = sitemap();
    expect(second).toEqual(first);
    expect(secondRoute).toEqual(firstRoute);
    expect(second.map((entry) => entry.lastModified)).toEqual(
      first.map((entry) => entry.lastModified)
    );
  });

  it("does not manufacture lastmod from the current time", () => {
    const sitemapSource = readFileSync("lib/seo/sitemap.ts", "utf8");
    const routeSource = readFileSync("app/sitemap.ts", "utf8");
    const loaderSource = readFileSync("lib/seo/load-platform-seo.ts", "utf8");
    expect(sitemapSource).not.toMatch(/new Date\(\s*\)/);
    expect(sitemapSource).not.toMatch(/Date\.now\s*\(/);
    expect(routeSource).not.toMatch(/new Date\s*\(/);
    expect(routeSource).not.toMatch(/Date\.now\s*\(/);
    expect(routeSource).not.toContain("getSitemapLastModifiedByPath");
    expect(routeSource).not.toContain("load-platform-seo");
    expect(loaderSource).not.toContain("getSitemapLastModifiedByPath");
  });

  it("uses valid calendar dates that are not in the future", () => {
    const entries = buildMarketingSitemap({ origin: "http://localhost" });
    const tomorrowUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1
    );
    expect(entries).toHaveLength(MARKETING_SEO_PATHS.length);
    for (const entry of entries) {
      expect(entry.lastModified).toEqual(expect.any(String));
      expect(isSitemapLastModifiedDate(entry.lastModified ?? "")).toBe(true);
      const parsed = new Date(`${entry.lastModified}T00:00:00.000Z`);
      expect(parsed.toISOString().slice(0, 10)).toBe(entry.lastModified);
      expect(parsed.getTime()).toBeLessThan(tomorrowUtc);
    }
    expect(isSitemapLastModifiedDate("2026-09-16")).toBe(true);
    expect(isSitemapLastModifiedDate("2026-02-31")).toBe(false);
    expect(isSitemapLastModifiedDate("2026-09-16T23:00:39.303Z")).toBe(false);
  });

  it("excludes private, operator, and tenant routes", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    const urls = sitemap()
      .map((entry) => entry.url)
      .join(" ");
    expect(urls).not.toContain("/dashboard");
    expect(urls).not.toContain("/guides");
    expect(urls).not.toContain("/operator");
    expect(urls).not.toContain("/login");
    expect(urls).not.toContain("/_sites");
    expect(urls).not.toContain("/_marketing");
    expect(urls).not.toContain("demodental");
    expect(urls).not.toContain("/practice");
  });

  it("leaves the robots sitemap URL unchanged", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    expect(robots().sitemap).toBe("http://localhost/sitemap.xml");
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
