import { cache } from "react";

import { getPrisma } from "@/lib/prisma";
import {
  DEFAULT_PLATFORM_SEO,
  marketingPageSeoFields,
} from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS, PLATFORM_SEO_ID } from "@/lib/seo/types";
import type {
  MarketingPageSeoInput,
  MarketingSeoPath,
  PlatformSeoIdentity,
} from "@/lib/seo/types";
import { mergePlatformIdentity } from "@/lib/seo/resolve-marketing-seo";

function toIdentity(
  row: {
    siteName: string;
    defaultDescription: string;
    organizationName: string;
    organizationDescription: string;
    publicContactEmail: string | null;
    defaultOgImagePath: string | null;
    sameAsUrls: string[];
    updatedAt: Date;
  } | null
): PlatformSeoIdentity {
  if (!row) {
    return DEFAULT_PLATFORM_SEO;
  }
  return mergePlatformIdentity({
    siteName: row.siteName,
    defaultDescription: row.defaultDescription,
    organizationName: row.organizationName,
    organizationDescription: row.organizationDescription,
    publicContactEmail: row.publicContactEmail,
    defaultOgImagePath: row.defaultOgImagePath,
    sameAsUrls: row.sameAsUrls,
    updatedAt: row.updatedAt,
  });
}

function toPage(row: {
  path: string;
  seoTitle: string;
  metaDescription: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImagePath: string | null;
  index: boolean;
  follow: boolean;
  updatedAt: Date;
}): MarketingPageSeoInput | null {
  if (!MARKETING_SEO_PATHS.includes(row.path as MarketingSeoPath)) {
    return null;
  }
  return {
    path: row.path as MarketingSeoPath,
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    ogImagePath: row.ogImagePath,
    index: row.index,
    follow: row.follow,
    updatedAt: row.updatedAt,
  };
}

export const loadPlatformSeoIdentity = cache(
  async (): Promise<PlatformSeoIdentity> => {
    try {
      const row = await getPrisma().platformSeoSettings.findUnique({
        where: { id: PLATFORM_SEO_ID },
      });
      return toIdentity(row);
    } catch {
      return DEFAULT_PLATFORM_SEO;
    }
  }
);

export const loadMarketingPageSeo = cache(
  async (path: MarketingSeoPath): Promise<MarketingPageSeoInput> => {
    const fallback = {
      path,
      ...marketingPageSeoFields(path),
      updatedAt: null,
    };
    try {
      const row = await getPrisma().marketingPageSeo.findUnique({
        where: { path },
      });
      return row ? (toPage(row) ?? fallback) : fallback;
    } catch {
      return fallback;
    }
  }
);

export const loadAllMarketingPageSeo = cache(
  async (): Promise<MarketingPageSeoInput[]> => {
    try {
      const rows = await getPrisma().marketingPageSeo.findMany();
      const byPath = new Map(
        rows
          .map(toPage)
          .filter((page): page is MarketingPageSeoInput => page !== null)
          .map((page) => [page.path, page])
      );
      return MARKETING_SEO_PATHS.map(
        (path) =>
          byPath.get(path) ?? {
            path,
            ...marketingPageSeoFields(path),
            updatedAt: null,
          }
      );
    } catch {
      return MARKETING_SEO_PATHS.map((path) => ({
        path,
        ...marketingPageSeoFields(path),
        updatedAt: null,
      }));
    }
  }
);
