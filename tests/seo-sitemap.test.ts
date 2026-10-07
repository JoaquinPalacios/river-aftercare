import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  DEFAULT_MARKETING_PAGE_SEO,
  marketingPageSeoFields,
} from "@/lib/seo/defaults";
import {
  buildMarketingSitemap,
  isSitemapLastModifiedDate,
} from "@/lib/seo/sitemap";
import {
  MARKETING_SEO_PATHS,
  type MarketingPageSeoInput,
  type MarketingSeoPath,
} from "@/lib/seo/types";

const loadAllMarketingPageSeo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/seo/load-platform-seo", () => ({
  loadAllMarketingPageSeo,
}));

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/contact",
  "/about",
  "/privacy",
  "/terms",
  "/clinics",
  "/dental",
  "/physiotherapy",
  "/chiropractic",
  "/cosmetic-clinics",
] as const;

const INDEXABLE_SITEMAP_PATHS = [
  "/",
  "/pricing",
  "/contact",
  "/about",
  "/clinics",
  "/dental",
  "/physiotherapy",
  "/chiropractic",
  "/cosmetic-clinics",
] as const;

function pathFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname === "" ? "/" : parsed.pathname;
}

function storedPage(
  path: MarketingSeoPath,
  index = DEFAULT_MARKETING_PAGE_SEO[path].index,
  updatedAt: Date | null = null
): MarketingPageSeoInput {
  return {
    path,
    ...marketingPageSeoFields(path),
    index,
    updatedAt,
  };
}

describe("marketing sitemap lastmod", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousBase = process.env.CARE_GUIDE_METADATA_BASE;

  beforeEach(() => {
    loadAllMarketingPageSeo.mockReset();
    loadAllMarketingPageSeo.mockResolvedValue(
      MARKETING_SEO_PATHS.map((path) => storedPage(path))
    );
  });

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    restore("CARE_GUIDE_METADATA_BASE", previousBase);
    vi.useRealTimers();
  });

  it("lists every public marketing route from the canonical SEO config", () => {
    expect([...MARKETING_SEO_PATHS]).toEqual([...PUBLIC_PATHS]);
  });

  it("includes only marketing routes whose SEO metadata allows indexing", () => {
    expect(
      MARKETING_SEO_PATHS.filter(
        (path) => DEFAULT_MARKETING_PAGE_SEO[path].index
      )
    ).toEqual([...INDEXABLE_SITEMAP_PATHS]);
    expect(
      MARKETING_SEO_PATHS.filter(
        (path) => !DEFAULT_MARKETING_PAGE_SEO[path].index
      )
    ).toEqual(["/privacy", "/terms"]);

    const entries = buildMarketingSitemap({ origin: "http://localhost" });
    expect(entries.map((entry) => pathFromUrl(entry.url))).toEqual([
      ...INDEXABLE_SITEMAP_PATHS,
    ]);
    expect(entries.map((entry) => entry.lastModified)).toEqual(
      INDEXABLE_SITEMAP_PATHS.map(
        (path) => DEFAULT_MARKETING_PAGE_SEO[path].lastModified
      )
    );
    expect(entries[0]).toMatchObject({
      url: "http://localhost/",
      changeFrequency: "weekly",
      priority: 1,
    });
    for (const entry of entries.slice(1)) {
      expect(entry.changeFrequency).toBe("monthly");
      expect(entry.priority).toBe(0.8);
    }

    const explicit = buildMarketingSitemap({
      origin: "https://riveraftercare.com.au",
      paths: MARKETING_SEO_PATHS,
    });
    expect(explicit.map((entry) => pathFromUrl(entry.url))).toEqual([
      ...INDEXABLE_SITEMAP_PATHS,
    ]);
    expect(explicit[0]).toEqual({
      url: "https://riveraftercare.com.au/",
      lastModified: DEFAULT_MARKETING_PAGE_SEO["/"].lastModified,
      changeFrequency: "weekly",
      priority: 1,
    });
    for (const path of INDEXABLE_SITEMAP_PATHS) {
      if (path === "/") {
        continue;
      }
      expect(explicit.find((entry) => entry.url.endsWith(path))).toEqual({
        url: `https://riveraftercare.com.au${path}`,
        lastModified: DEFAULT_MARKETING_PAGE_SEO[path].lastModified,
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }
  });

  it("follows a stored index override in either direction", async () => {
    const pages = MARKETING_SEO_PATHS.map((path) => {
      if (path === "/pricing") {
        return storedPage(path, false, new Date("2024-01-02T03:04:05.000Z"));
      }
      if (path === "/privacy") {
        return storedPage(path, true, new Date("2024-06-07T08:09:10.000Z"));
      }
      return storedPage(path);
    });
    const entries = buildMarketingSitemap({
      origin: "http://localhost",
      pages,
    });
    expect(entries.map((entry) => pathFromUrl(entry.url))).toEqual([
      "/",
      "/contact",
      "/about",
      "/privacy",
      "/clinics",
      "/dental",
      "/physiotherapy",
      "/chiropractic",
      "/cosmetic-clinics",
    ]);
    expect(entries.find((entry) => entry.url.endsWith("/privacy"))).toEqual({
      url: "http://localhost/privacy",
      lastModified: DEFAULT_MARKETING_PAGE_SEO["/privacy"].lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    });
    expect(entries[0]).toEqual({
      url: "http://localhost/",
      lastModified: DEFAULT_MARKETING_PAGE_SEO["/"].lastModified,
      changeFrequency: "weekly",
      priority: 1,
    });

    loadAllMarketingPageSeo.mockResolvedValue(pages);
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    const routed = await sitemap();
    expect(routed.map((entry) => pathFromUrl(entry.url))).toEqual(
      entries.map((entry) => pathFromUrl(entry.url))
    );
    expect(routed.find((entry) => entry.url.endsWith("/privacy"))).toEqual(
      entries.find((entry) => entry.url.endsWith("/privacy"))
    );
  });

  it("keeps lastModified stable across repeated generation and clock changes", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
    const first = buildMarketingSitemap({ origin: "http://localhost" });
    const firstRoute = await sitemap();
    vi.setSystemTime(new Date("2026-12-01T23:59:59.999Z"));
    const second = buildMarketingSitemap({ origin: "http://localhost" });
    const secondRoute = await sitemap();
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
    expect(routeSource).not.toContain("updatedAt");
    expect(routeSource).toContain("loadAllMarketingPageSeo");
    expect(routeSource).not.toContain("force-dynamic");
    expect(routeSource).not.toContain("connection(");
    expect(sitemapSource).not.toContain("load-platform-seo");
    expect(sitemapSource).not.toContain("updatedAt");
    expect(loaderSource).not.toContain("getSitemapLastModifiedByPath");
  });

  it("uses valid calendar dates that are not in the future", () => {
    const entries = buildMarketingSitemap({ origin: "http://localhost" });
    const tomorrowUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1
    );
    expect(entries).toHaveLength(INDEXABLE_SITEMAP_PATHS.length);
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

  it("excludes private, operator, and tenant routes", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    const urls = (await sitemap()).map((entry) => entry.url).join(" ");
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
