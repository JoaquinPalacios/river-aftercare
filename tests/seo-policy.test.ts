import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  aftercarePageMetadata,
  AFTERCARE_ROBOTS,
  tenantGuideDescription,
  tenantGuideDocumentTitle,
} from "@/lib/aftercare/tenant-metadata";
import {
  CONTACT_METADATA,
  HOME_METADATA,
  marketingPageMetadata,
  PRICING_METADATA,
  PRIVACY_METADATA,
  TERMS_METADATA,
} from "@/lib/marketing/metadata";
import { marketingSiteOrigin } from "@/lib/marketing/site";
import { sanitizeMetadataText } from "@/lib/seo/metadata-text";
import {
  DRAFT_LEGAL_ROBOTS,
  INDEXABLE_ROBOTS,
  PRIVATE_ROBOTS,
  ROBOTS_ALLOW_PUBLIC,
  ROBOTS_DISALLOW_INTERNAL,
  TENANT_LAUNCH_ROBOTS,
} from "@/lib/seo/robots-policy";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("launch SEO policy", () => {
  it("keeps marketing pages indexable with canonical and social metadata", () => {
    const home = marketingPageMetadata(HOME_METADATA, {
      pathname: "/",
      absoluteTitle: true,
    });
    const pricing = marketingPageMetadata(PRICING_METADATA, {
      pathname: "/pricing",
    });
    const contact = marketingPageMetadata(CONTACT_METADATA, {
      pathname: "/contact",
    });
    const privacy = marketingPageMetadata(PRIVACY_METADATA, {
      pathname: "/privacy",
    });
    const terms = marketingPageMetadata(TERMS_METADATA, {
      pathname: "/terms",
    });

    expect(home.robots).toEqual(INDEXABLE_ROBOTS);
    expect(home.alternates?.canonical).toBe(`${marketingSiteOrigin()}/`);
    expect(home.openGraph?.url).toContain("http://");
    expect(home.openGraph?.title).toBe(
      "Aftercare that still feels like your clinic"
    );
    expect(home.title).toEqual({
      absolute: HOME_METADATA.title,
    });
    expect(pricing.robots).toEqual(INDEXABLE_ROBOTS);
    expect(pricing.alternates?.canonical).toBe(
      `${marketingSiteOrigin()}/pricing`
    );
    expect(pricing.title).toEqual({
      absolute: PRICING_METADATA.title,
    });
    expect(pricing.openGraph?.title).toBe(PRICING_METADATA.title);
    expect(contact.alternates?.canonical).toBe(
      `${marketingSiteOrigin()}/contact`
    );
    expect(JSON.stringify(contact.twitter)).toContain('"card":"summary"');
    expect(privacy.robots).toEqual(DRAFT_LEGAL_ROBOTS);
    expect(privacy.alternates?.canonical).toBe(
      `${marketingSiteOrigin()}/privacy`
    );
    expect(terms.robots).toEqual(DRAFT_LEGAL_ROBOTS);
    expect(terms.alternates?.canonical).toBe(`${marketingSiteOrigin()}/terms`);
    expect(privacy.openGraph?.title).toContain("Privacy");
    expect(terms.openGraph?.title).toContain("Terms");
  });

  it("marks staff, operator, and authenticated preview as private", () => {
    expect(PRIVATE_ROBOTS).toEqual({ index: false, follow: false });
  });

  it("keeps tenant patient pages noindex with shareable follow and resolved copy", () => {
    expect(AFTERCARE_ROBOTS).toEqual(TENANT_LAUNCH_ROBOTS);
    expect(TENANT_LAUNCH_ROBOTS).toEqual({ index: false, follow: true });

    expect(
      tenantGuideDocumentTitle(
        "Tooth Extraction",
        "Riverside Dental",
        "AFTERCARE"
      )
    ).toBe("Tooth Extraction Aftercare | Riverside Dental");
    expect(
      tenantGuideDescription(
        "Tooth Extraction",
        "Riverside Dental",
        "AFTERCARE"
      )
    ).toBe(
      "Aftercare instructions for tooth extraction from Riverside Dental."
    );

    const metadata = aftercarePageMetadata({
      title: "Tooth Extraction Aftercare | Riverside Dental",
      description:
        "Aftercare instructions for tooth extraction from Riverside Dental.",
      siteName: "Riverside Dental",
      canonicalUrl: "http://riverside.example/extraction",
    });
    expect(metadata.robots).toEqual(TENANT_LAUNCH_ROBOTS);
    expect(metadata.alternates?.canonical).toBe(
      "http://riverside.example/extraction"
    );
    expect(metadata.openGraph?.url).toBe("http://riverside.example/extraction");
  });

  it("strips raw HTML from metadata strings", () => {
    expect(sanitizeMetadataText("<script>alert(1)</script>Safe title")).toBe(
      "Safe title"
    );
    expect(
      tenantGuideDocumentTitle(
        "<b>Tooth Extraction</b>",
        "Riverside Dental",
        "AFTERCARE"
      )
    ).toBe("Tooth Extraction Aftercare | Riverside Dental");
  });

  it("lists only public marketing URLs in the launch sitemap", async () => {
    const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
    const previousBase = process.env.CARE_GUIDE_METADATA_BASE;
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    try {
      const urls = (await sitemap()).map((entry) => entry.url);
      expect(urls).toEqual([
        "http://localhost/",
        "http://localhost/pricing",
        "http://localhost/contact",
        "http://localhost/about",
        "http://localhost/privacy",
        "http://localhost/terms",
        "http://localhost/dental",
        "http://localhost/physiotherapy",
        "http://localhost/chiropractic",
        "http://localhost/cosmetic-clinics",
      ]);
      expect(urls.join(" ")).not.toContain("/dashboard");
      expect(urls.join(" ")).not.toContain("/guides");
      expect(urls.join(" ")).not.toContain("/operator");
      expect(urls.join(" ")).not.toContain("/_sites");
      expect(urls.join(" ")).not.toContain("demodental");
    } finally {
      restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
      restore("CARE_GUIDE_METADATA_BASE", previousBase);
    }
  });

  it("allows marketing and disallows authenticated internal surfaces in robots.txt", () => {
    const document = robots();
    expect(document.rules).toMatchObject({
      allow: [...ROBOTS_ALLOW_PUBLIC],
      disallow: expect.arrayContaining([
        ...ROBOTS_DISALLOW_INTERNAL,
        "/operator",
        "/guides",
        "/practice",
      ]),
    });
  });

  it("keeps staff, operator, and draft preview metadata private in source", () => {
    const staff = readFileSync("app/(staff)/layout.tsx", "utf8");
    const operator = readFileSync("app/(staff)/(operator)/layout.tsx", "utf8");
    const operatorSeo = readFileSync(
      "app/(staff)/(operator)/operator/seo/actions.ts",
      "utf8"
    );
    const preview = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/page.tsx",
      "utf8"
    );
    expect(staff).toContain("PRIVATE_ROBOTS");
    expect(operator).toContain("staffAppScroller");
    expect(operatorSeo).toContain("requirePlatformOperator");
    expect(preview).toContain("PRIVATE_ROBOTS");
    expect(preview).not.toContain("canonical");
  });

  it("does not append the site name through the marketing title template", () => {
    const layout = readFileSync("app/(marketing)/layout.tsx", "utf8");
    expect(layout).toContain('template: "%s"');
    expect(layout).not.toContain("%s —");
    expect(layout).not.toContain("MARKETING_TITLE_TEMPLATE");
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
