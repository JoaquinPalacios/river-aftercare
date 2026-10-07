import type { MetadataRoute } from "next";

import { marketingSiteOrigin } from "@/lib/marketing/site";
import { loadAllMarketingPageSeo } from "@/lib/seo/load-platform-seo";
import { buildMarketingSitemap } from "@/lib/seo/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await loadAllMarketingPageSeo();
  return buildMarketingSitemap({
    origin: marketingSiteOrigin(),
    pages,
  });
}
