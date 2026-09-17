export const PLATFORM_SEO_ID = "platform";

export const MARKETING_SEO_PATHS = [
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

export type MarketingSeoPath = (typeof MARKETING_SEO_PATHS)[number];

export type FutureGuideSearchVisibility = "PRIVATE_FROM_SEARCH" | "INDEXABLE";

export interface PlatformSeoIdentity {
  siteName: string;
  defaultDescription: string;
  organizationName: string;
  organizationDescription: string;
  publicContactEmail: string | null;
  defaultOgImagePath: string | null;
  sameAsUrls: string[];
  updatedAt: Date | null;
}

export interface MarketingPageSeoInput {
  path: MarketingSeoPath;
  seoTitle: string;
  metaDescription: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImagePath: string | null;
  index: boolean;
  follow: boolean;
  updatedAt: Date | null;
}

export interface ResolvedSocialMetadata {
  title: string;
  description: string;
  imagePath: string | null;
  source: "page-og" | "page-seo" | "platform-default";
}

export interface ResolvedMarketingSeo {
  path: MarketingSeoPath;
  siteName: string;
  /** Complete document <title>, never double-appended with the site name. */
  title: string;
  /** Canonical page SEO title before document-title formatting. */
  seoTitle: string;
  absoluteTitle: boolean;
  description: string;
  canonicalUrl: string;
  robots: {
    index: boolean;
    follow: boolean;
  };
  social: ResolvedSocialMetadata;
  identity: PlatformSeoIdentity;
  pageUpdatedAt: Date | null;
  platformUpdatedAt: Date | null;
}

export type SeoDiagnosticStatus = "complete" | "attention";

export interface SeoDiagnostic {
  id: string;
  label: string;
  status: SeoDiagnosticStatus;
  detail: string;
}
