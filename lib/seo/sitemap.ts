import { DEFAULT_MARKETING_PAGE_SEO } from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS, type MarketingSeoPath } from "@/lib/seo/types";
import { marketingCanonicalUrl } from "@/lib/seo/resolve-marketing-seo";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface MarketingSitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}

export function isSitemapLastModifiedDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function configuredSitemapLastModified(
  path: MarketingSeoPath
): string | undefined {
  const value = DEFAULT_MARKETING_PAGE_SEO[path].lastModified;
  return isSitemapLastModifiedDate(value) ? value : undefined;
}

export function buildMarketingSitemap(input: {
  origin: string;
  paths?: readonly MarketingSeoPath[];
}): MarketingSitemapEntry[] {
  const paths = input.paths ?? MARKETING_SEO_PATHS;
  return paths.map((path) => {
    const lastModified = configuredSitemapLastModified(path);
    return {
      url: marketingCanonicalUrl(path, input.origin),
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.8,
      ...(lastModified ? { lastModified } : {}),
    };
  });
}
