import { MARKETING_PAGE_LABELS } from "@/lib/seo/defaults";
import { isDedicatedOgImageConfigured } from "@/lib/seo/og-policy";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";
import type {
  MarketingPageSeoInput,
  PlatformSeoIdentity,
  SeoDiagnostic,
} from "@/lib/seo/types";

export const PRIVACY_PAGE_PUBLISHED = true;
export const TERMS_PAGE_PUBLISHED = true;
export const PRIVACY_PAGE_LEGALLY_APPROVED = false;
export const TERMS_PAGE_LEGALLY_APPROVED = false;

export function buildSeoDiagnostics(input: {
  identity: PlatformSeoIdentity;
  pages: MarketingPageSeoInput[];
}): SeoDiagnostic[] {
  const pagesByPath = new Map(input.pages.map((page) => [page.path, page]));
  const ogConfigured = isDedicatedOgImageConfigured(
    input.identity.defaultOgImagePath
  );

  return [
    {
      id: "site-identity",
      label: "Site identity",
      status:
        input.identity.siteName && input.identity.organizationName
          ? "complete"
          : "attention",
      detail:
        input.identity.siteName && input.identity.organizationName
          ? "Organization name and site name are set."
          : "Site or organization name is missing.",
    },
    {
      id: "default-description",
      label: "Default description",
      status: input.identity.defaultDescription ? "complete" : "attention",
      detail: input.identity.defaultDescription
        ? "Platform default description is set."
        : "Add a default description.",
    },
    {
      id: "og-image",
      label: "OG image",
      status: ogConfigured ? "complete" : "attention",
      detail: ogConfigured
        ? "A dedicated 1200 × 630 social image is configured."
        : "Dedicated 1200 × 630 River Aftercare OG image still required. Do not stretch the logo.",
    },
    {
      id: "organization-jsonld",
      label: "Organization JSON-LD",
      status: "complete",
      detail: "Generated from structured settings on public marketing pages.",
    },
    {
      id: "website-jsonld",
      label: "WebSite JSON-LD",
      status: "complete",
      detail: "Homepage exposes WebSite with a publisher relationship.",
    },
    {
      id: "sitemap",
      label: "Sitemap",
      status: "complete",
      detail:
        "Public marketing routes only. Tenant noindex guides are excluded.",
    },
    {
      id: "llms",
      label: "llms.txt",
      status: "complete",
      detail: "Generated from product identity and public routes at /llms.txt.",
    },
    {
      id: "privacy",
      label: "Privacy page",
      status: PRIVACY_PAGE_LEGALLY_APPROVED ? "complete" : "attention",
      detail: PRIVACY_PAGE_LEGALLY_APPROVED
        ? "Privacy page is published and legally approved."
        : "Substantial draft is published at /privacy. Legal review is still required.",
    },
    {
      id: "terms",
      label: "Terms page",
      status: TERMS_PAGE_LEGALLY_APPROVED ? "complete" : "attention",
      detail: TERMS_PAGE_LEGALLY_APPROVED
        ? "Terms page is published and legally approved."
        : "Substantial draft is published at /terms. Legal review is still required.",
    },
    ...MARKETING_SEO_PATHS.map((path) => {
      const page = pagesByPath.get(path);
      return {
        id: `page-${path}`,
        label: `${MARKETING_PAGE_LABELS[path]} metadata`,
        status:
          page?.seoTitle && page.metaDescription ? "complete" : "attention",
        detail:
          page?.seoTitle && page.metaDescription
            ? "Title and description are set."
            : "Using product fallbacks until this page is saved.",
      } satisfies SeoDiagnostic;
    }),
  ];
}
