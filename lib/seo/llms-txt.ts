import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  CLINIC_HUB_PATH,
  CLINIC_VERTICAL_NAV,
} from "@/lib/marketing/clinic-verticals";
import { MARKETING_PAGE_LABELS } from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS, type PlatformSeoIdentity } from "@/lib/seo/types";
import { marketingCanonicalUrl } from "@/lib/seo/resolve-marketing-seo";

export const LLMS_TXT_PATH = "/llms.txt";

const HUB_LLMS_BLURB =
  "Overview of River Aftercare for treatment-based clinics and practices.";

const VERTICAL_LLMS_BLURBS: Record<string, string> = {
  "/dental":
    "Dental practices: clinic-branded post-treatment instructions patients can reopen after dental care.",
  "/physiotherapy":
    "Physiotherapy clinics: recovery, home-care and written exercise guidance between appointments. Not an exercise-tracking app.",
  "/chiropractic":
    "Chiropractic practices: home-care and post-appointment guidance in a branded patient page.",
  "/cosmetic-clinics":
    "Cosmetic and aesthetic clinics: post-treatment aftercare that stays under the clinic brand.",
};

export function buildLlmsTxt(input: {
  identity: PlatformSeoIdentity;
  origin: string;
  publishedPaths?: readonly string[];
}): string {
  const siteName = input.identity.siteName || PRODUCT_NAME;
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

  const hubUrl = marketingCanonicalUrl(CLINIC_HUB_PATH, input.origin);
  const verticals = [
    `- [Clinics overview](${hubUrl}) — ${HUB_LLMS_BLURB}`,
    ...CLINIC_VERTICAL_NAV.map((item) => {
      const blurb = VERTICAL_LLMS_BLURBS[item.path];
      const url = marketingCanonicalUrl(item.path, input.origin);
      return `- [${item.cardTitle}](${url}) — ${blurb}`;
    }),
  ].join("\n");

  return `# ${siteName}

${input.identity.organizationDescription}

${siteName} is a patient aftercare platform for clinics and practices. It publishes clinic-branded guidance as web pages patients can reopen from a link or QR code, without an app or patient login.

## When to use ${siteName}

Use ${siteName} when a clinic or practice wants branded patient aftercare pages that patients can reopen on the web without an app or login. It is a structured aftercare publishing platform for treatment-based healthcare practices, not live clinical monitoring, a patient health record, an emergency service, exercise-adherence tracking, or a generic CMS.

Do not treat staff, operator, login, or clinic tenant guide URLs as public documentation. Clinic patient guides are private from search by default.

## Clinic pages

${verticals}

## Public resources

${resources}
`;
}

export function shouldPublishLlmsFull(publicPageCount: number): boolean {
  return publicPageCount >= 8;
}
