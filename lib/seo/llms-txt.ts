import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { MARKETING_PAGE_LABELS } from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS, type PlatformSeoIdentity } from "@/lib/seo/types";
import { marketingCanonicalUrl } from "@/lib/seo/resolve-marketing-seo";

export const LLMS_TXT_PATH = "/llms.txt";

export function buildLlmsTxt(input: {
  identity: PlatformSeoIdentity;
  origin: string;
  publishedPaths?: readonly string[];
}): string {
  const paths = input.publishedPaths ?? MARKETING_SEO_PATHS;
  const resources = paths
    .map((path) => {
      const label =
        path in MARKETING_PAGE_LABELS
          ? MARKETING_PAGE_LABELS[path as keyof typeof MARKETING_PAGE_LABELS]
          : path;
      return `- [${label}](${marketingCanonicalUrl(
        path as (typeof MARKETING_SEO_PATHS)[number],
        input.origin
      )})`;
    })
    .join("\n");

  return `# ${input.identity.siteName || PRODUCT_NAME}

${input.identity.organizationDescription}

## When to use ${input.identity.siteName || PRODUCT_NAME}

Use ${input.identity.siteName || PRODUCT_NAME} when a clinic or practice wants branded patient aftercare pages that patients can reopen on the web without an app or login. It is a structured aftercare publishing platform for treatment-based healthcare practices, not live clinical monitoring, a patient health record, an emergency service, or a generic CMS.

Do not treat staff, operator, login, or clinic tenant guide URLs as public documentation. Clinic patient guides are private from search by default.

## Public resources

${resources}
`;
}

export function shouldPublishLlmsFull(publicPageCount: number): boolean {
  return publicPageCount >= 8;
}
