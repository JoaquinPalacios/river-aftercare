import { DEFAULT_MARKETING_PAGE_SEO } from "@/lib/seo/defaults";
import {
  marketingCanonicalUrl,
  resolveMarketingSeo,
} from "@/lib/seo/resolve-marketing-seo";
import {
  MARKETING_SEO_PATHS,
  type MarketingPageSeoInput,
  type MarketingSeoPath,
} from "@/lib/seo/types";

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
  /**
   * Stored marketing rows, usually from `loadAllMarketingPageSeo()`.
   * Omitted pages use the code default inside `resolveMarketingSeo`.
   * `lastModified` stays on that code default either way.
   */
  pages?: readonly MarketingPageSeoInput[];
}): MarketingSitemapEntry[] {
  const pagesByPath = new Map(input.pages?.map((page) => [page.path, page]));
  const paths = (input.paths ?? MARKETING_SEO_PATHS).filter((path) => {
    const page = pagesByPath.get(path);
    return resolveMarketingSeo(page ? { path, page } : { path }).robots.index;
  });
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
