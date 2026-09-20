import { marketingSiteOrigin } from "@/lib/marketing/site";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PLAN_PRICES, PRICING_CURRENCY } from "@/lib/marketing/plans";
import { ORGANIZATION_LOGO } from "@/lib/seo/og-policy";
import type {
  PlatformSeoIdentity,
  ResolvedMarketingSeo,
} from "@/lib/seo/types";

export interface JsonLdNode {
  "@type": string | string[];
  "@id"?: string;
  [key: string]: unknown;
}

export interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

export function organizationId(origin = marketingSiteOrigin()): string {
  return `${origin}/#organization`;
}

export function websiteId(origin = marketingSiteOrigin()): string {
  return `${origin}/#website`;
}

export function softwareApplicationId(origin = marketingSiteOrigin()): string {
  return `${origin}/#application`;
}

export function webpageId(
  path: string,
  origin = marketingSiteOrigin()
): string {
  const canonical = path === "/" ? `${origin}/` : `${origin}${path}`;
  return `${canonical}#webpage`;
}

export function buildOrganizationJsonLd(
  identity: PlatformSeoIdentity,
  origin = marketingSiteOrigin()
): JsonLdNode {
  const logoUrl = `${origin}${ORGANIZATION_LOGO.path}`;
  const node: JsonLdNode = {
    "@type": "Organization",
    "@id": organizationId(origin),
    name: identity.organizationName,
    url: `${origin}/`,
    description: identity.organizationDescription,
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
      contentUrl: logoUrl,
      width: ORGANIZATION_LOGO.width,
      height: ORGANIZATION_LOGO.height,
      encodingFormat: ORGANIZATION_LOGO.type,
    },
  };

  if (identity.publicContactEmail) {
    node.contactPoint = {
      "@type": "ContactPoint",
      email: identity.publicContactEmail,
      contactType: "customer support",
    };
  }

  if (identity.sameAsUrls.length > 0) {
    node.sameAs = identity.sameAsUrls;
  }

  return node;
}

export function buildWebsiteJsonLd(
  identity: PlatformSeoIdentity,
  origin = marketingSiteOrigin()
): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": websiteId(origin),
    name: identity.siteName,
    url: `${origin}/`,
    inLanguage: "en",
    publisher: { "@id": organizationId(origin) },
  };
}

function pricingOffer(input: {
  name: string;
  price: number;
  billingDuration: "P1M" | "P1Y";
  origin: string;
}): JsonLdNode {
  const price = String(input.price);
  return {
    "@type": "Offer",
    name: input.name,
    url: `${input.origin}/pricing`,
    price,
    priceCurrency: PRICING_CURRENCY,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price,
      priceCurrency: PRICING_CURRENCY,
      billingDuration: input.billingDuration,
    },
  };
}

export function buildPricingOffers(
  origin = marketingSiteOrigin()
): JsonLdNode[] {
  return [
    pricingOffer({
      name: "Essential monthly",
      price: PLAN_PRICES.essential.monthlyAudInclGst,
      billingDuration: "P1M",
      origin,
    }),
    pricingOffer({
      name: "Essential yearly",
      price: PLAN_PRICES.essential.annualAudInclGst,
      billingDuration: "P1Y",
      origin,
    }),
    pricingOffer({
      name: "Practice monthly",
      price: PLAN_PRICES.practice.monthlyAudInclGst,
      billingDuration: "P1M",
      origin,
    }),
    pricingOffer({
      name: "Practice yearly",
      price: PLAN_PRICES.practice.annualAudInclGst,
      billingDuration: "P1Y",
      origin,
    }),
  ];
}

export function buildSoftwareApplicationJsonLd(
  identity: PlatformSeoIdentity,
  origin = marketingSiteOrigin(),
  options?: { includePricingOffers?: boolean }
): JsonLdNode {
  const node: JsonLdNode = {
    "@type": "SoftwareApplication",
    "@id": softwareApplicationId(origin),
    name: identity.siteName || PRODUCT_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: identity.defaultDescription,
    url: `${origin}/`,
    publisher: { "@id": organizationId(origin) },
  };

  if (options?.includePricingOffers) {
    node.offers = buildPricingOffers(origin);
  }

  return node;
}

function webPageNode(input: {
  type: string;
  resolved: ResolvedMarketingSeo;
  origin: string;
  extra?: Record<string, unknown>;
}): JsonLdNode {
  return {
    "@type": input.type,
    "@id": webpageId(input.resolved.path, input.origin),
    url: input.resolved.canonicalUrl,
    name: input.resolved.seoTitle,
    description: input.resolved.description,
    isPartOf: { "@id": websiteId(input.origin) },
    about: { "@id": organizationId(input.origin) },
    inLanguage: "en",
    ...input.extra,
  };
}

export function buildMarketingJsonLdGraph(
  resolved: ResolvedMarketingSeo,
  origin = marketingSiteOrigin()
): JsonLdGraph {
  const identity = resolved.identity;
  const graph: JsonLdNode[] = [
    buildOrganizationJsonLd(identity, origin),
    buildWebsiteJsonLd(identity, origin),
    buildSoftwareApplicationJsonLd(identity, origin, {
      includePricingOffers: resolved.path === "/pricing",
    }),
  ];

  if (resolved.path === "/") {
    graph.push(
      webPageNode({
        type: "WebPage",
        resolved,
        origin,
        extra: {
          mainEntity: { "@id": softwareApplicationId(origin) },
        },
      })
    );
  } else if (resolved.path === "/pricing") {
    graph.push(
      webPageNode({
        type: "WebPage",
        resolved,
        origin,
        extra: {
          mainEntity: { "@id": softwareApplicationId(origin) },
        },
      })
    );
  } else if (resolved.path === "/contact") {
    graph.push(
      webPageNode({
        type: "ContactPage",
        resolved,
        origin,
      })
    );
  } else if (resolved.path === "/about") {
    graph.push(
      webPageNode({
        type: "AboutPage",
        resolved,
        origin,
      })
    );
  } else if (resolved.path === "/privacy" || resolved.path === "/terms") {
    graph.push(
      webPageNode({
        type: "WebPage",
        resolved,
        origin,
      })
    );
  } else if (
    resolved.path === "/clinics" ||
    resolved.path === "/dental" ||
    resolved.path === "/physiotherapy" ||
    resolved.path === "/chiropractic" ||
    resolved.path === "/cosmetic-clinics"
  ) {
    graph.push(
      webPageNode({
        type: "WebPage",
        resolved,
        origin,
        extra: {
          mainEntity: { "@id": softwareApplicationId(origin) },
        },
      })
    );
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function jsonLdContainsOffer(graph: JsonLdGraph): boolean {
  return JSON.stringify(graph).includes('"Offer"');
}
