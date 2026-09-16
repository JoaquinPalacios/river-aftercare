import type { Metadata } from "next";

import { marketingSiteOrigin } from "@/lib/marketing/site";
import {
  DEFAULT_MARKETING_PAGE_SEO,
  DEFAULT_PLATFORM_SEO,
} from "@/lib/seo/defaults";
import { marketingDocumentTitle } from "@/lib/seo/document-title";
import { isDedicatedOgImageConfigured } from "@/lib/seo/og-policy";
import { sanitizeMetadataText } from "@/lib/seo/metadata-text";
import type {
  MarketingPageSeoInput,
  MarketingSeoPath,
  PlatformSeoIdentity,
  ResolvedMarketingSeo,
  ResolvedSocialMetadata,
} from "@/lib/seo/types";

function fallbackPage(path: MarketingSeoPath): MarketingPageSeoInput {
  return {
    path,
    ...DEFAULT_MARKETING_PAGE_SEO[path],
    updatedAt: null,
  };
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

export function brandCountInTitle(title: string, siteName: string): number {
  const needle = siteName.trim().toLowerCase();
  if (!needle) {
    return 0;
  }
  const haystack = title.toLowerCase();
  let count = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    count += 1;
    from = index + needle.length;
  }
  return count;
}

export function mergePlatformIdentity(
  stored: PlatformSeoIdentity | null | undefined
): PlatformSeoIdentity {
  if (!stored) {
    return DEFAULT_PLATFORM_SEO;
  }

  return {
    siteName: stored.siteName.trim() || DEFAULT_PLATFORM_SEO.siteName,
    defaultDescription:
      stored.defaultDescription.trim() ||
      DEFAULT_PLATFORM_SEO.defaultDescription,
    organizationName:
      stored.organizationName.trim() || DEFAULT_PLATFORM_SEO.organizationName,
    organizationDescription:
      stored.organizationDescription.trim() ||
      DEFAULT_PLATFORM_SEO.organizationDescription,
    publicContactEmail: stored.publicContactEmail,
    defaultOgImagePath: stored.defaultOgImagePath,
    sameAsUrls: stored.sameAsUrls.filter(Boolean),
    updatedAt: stored.updatedAt,
  };
}

export function resolveSocialMetadata(input: {
  page: MarketingPageSeoInput;
  identity: PlatformSeoIdentity;
  resolvedTitle: string;
  resolvedDescription: string;
}): ResolvedSocialMetadata {
  const ogTitle = firstText(input.page.ogTitle);
  const ogDescription = firstText(input.page.ogDescription);
  const pageImage = firstText(input.page.ogImagePath);
  const platformImage = firstText(input.identity.defaultOgImagePath);

  if (ogTitle || ogDescription || pageImage) {
    return {
      title: ogTitle ?? input.resolvedTitle,
      description: ogDescription ?? input.resolvedDescription,
      imagePath: pageImage ?? platformImage,
      source: "page-og",
    };
  }

  if (input.page.seoTitle || input.page.metaDescription) {
    return {
      title: input.resolvedTitle,
      description: input.resolvedDescription,
      imagePath: platformImage,
      source: "page-seo",
    };
  }

  return {
    title: input.resolvedTitle,
    description: input.identity.defaultDescription,
    imagePath: platformImage,
    source: "platform-default",
  };
}

export function marketingCanonicalUrl(
  path: MarketingSeoPath,
  origin = marketingSiteOrigin()
): string {
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

export function resolveMarketingSeo(input: {
  path: MarketingSeoPath;
  platform?: PlatformSeoIdentity | null;
  page?: MarketingPageSeoInput | null;
  origin?: string;
}): ResolvedMarketingSeo {
  const identity = mergePlatformIdentity(input.platform);
  const page = input.page ?? fallbackPage(input.path);
  const defaults = DEFAULT_MARKETING_PAGE_SEO[input.path];
  const seoTitle = page.seoTitle.trim() || defaults.seoTitle;
  const description =
    page.metaDescription.trim() ||
    identity.defaultDescription ||
    defaults.metaDescription;
  const documentTitle = marketingDocumentTitle(seoTitle, identity.siteName);
  const social = resolveSocialMetadata({
    page,
    identity,
    resolvedTitle: documentTitle,
    resolvedDescription: description,
  });

  return {
    path: input.path,
    siteName: identity.siteName,
    title: documentTitle,
    seoTitle,
    absoluteTitle: true,
    description,
    canonicalUrl: marketingCanonicalUrl(input.path, input.origin),
    robots: {
      index: page.index,
      follow: page.follow,
    },
    social,
    identity,
    pageUpdatedAt: page.updatedAt,
    platformUpdatedAt: identity.updatedAt,
  };
}

export function marketingSeoToMetadata(
  resolved: ResolvedMarketingSeo
): Metadata {
  const title = sanitizeMetadataText(resolved.title, 120);
  const description = sanitizeMetadataText(resolved.description, 320);
  const socialTitle = sanitizeMetadataText(resolved.social.title, 120);
  const socialDescription = sanitizeMetadataText(
    resolved.social.description,
    320
  );
  const imagePath = isDedicatedOgImageConfigured(resolved.social.imagePath)
    ? resolved.social.imagePath
    : null;
  const images = imagePath ? [{ url: imagePath }] : undefined;

  return {
    title: { absolute: title },
    description,
    robots: resolved.robots,
    alternates: { canonical: resolved.canonicalUrl },
    openGraph: {
      type: "website",
      locale: "en",
      url: resolved.canonicalUrl,
      siteName: resolved.siteName,
      title: socialTitle,
      description: socialDescription,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: socialTitle,
      description: socialDescription,
      ...(images ? { images: [imagePath!] } : {}),
    },
  };
}
