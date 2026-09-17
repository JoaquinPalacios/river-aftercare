import type { MetadataRoute } from "next";

import { marketingSiteOrigin } from "@/lib/marketing/site";
import { buildMarketingSitemap } from "@/lib/seo/sitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildMarketingSitemap({ origin: marketingSiteOrigin() });
}
