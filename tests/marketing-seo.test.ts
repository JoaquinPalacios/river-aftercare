import { afterEach, describe, expect, it } from "vitest";

import {
  getMarketingContactFromEmail,
  getMarketingContactToEmail,
} from "@/lib/marketing/contact-config";
import { HOME_METADATA, PRICING_METADATA } from "@/lib/marketing/metadata";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("marketing contact addresses", () => {
  const previousTo = process.env.MARKETING_CONTACT_TO_EMAIL;
  const previousFrom = process.env.MARKETING_CONTACT_FROM_EMAIL;
  const previousLegacy = process.env.MARKETING_CONTACT_EMAIL;

  afterEach(() => {
    restore("MARKETING_CONTACT_TO_EMAIL", previousTo);
    restore("MARKETING_CONTACT_FROM_EMAIL", previousFrom);
    restore("MARKETING_CONTACT_EMAIL", previousLegacy);
  });

  it("accepts configured to/from addresses and rejects malformed values", () => {
    expect(
      getMarketingContactToEmail({
        MARKETING_CONTACT_TO_EMAIL: "hello@example.test",
      })
    ).toBe("hello@example.test");
    expect(
      getMarketingContactFromEmail({
        MARKETING_CONTACT_FROM_EMAIL: "website@example.test",
      })
    ).toBe("website@example.test");
    expect(
      getMarketingContactToEmail({ MARKETING_CONTACT_TO_EMAIL: "not-an-email" })
    ).toBeNull();
    expect(
      getMarketingContactFromEmail({
        MARKETING_CONTACT_FROM_EMAIL: "hello@example",
      })
    ).toBeNull();
  });
});

describe("marketing crawl files", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousBase = process.env.CARE_GUIDE_METADATA_BASE;

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previousRoot);
    restore("CARE_GUIDE_METADATA_BASE", previousBase);
  });

  it("lists only public platform routes", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

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
    expect(urls.join(" ")).not.toContain("/_marketing");
    expect(urls.join(" ")).not.toContain("/_sites");
  });

  it("allows public marketing pages and blocks internal rewrites", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    delete process.env.CARE_GUIDE_METADATA_BASE;
    const document = robots();
    expect(document.rules).toMatchObject({
      allow: [
        "/",
        "/pricing",
        "/contact",
        "/about",
        "/privacy",
        "/terms",
        "/dental",
        "/physiotherapy",
        "/chiropractic",
        "/cosmetic-clinics",
        "/llms.txt",
      ],
      disallow: expect.arrayContaining([
        "/_marketing",
        "/_sites",
        "/login",
        "/dashboard",
        "/guides",
        "/practice",
        "/operator",
      ]),
    });
    expect(document.sitemap).toBe("http://localhost/sitemap.xml");
    expect(HOME_METADATA.title).toBe(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );
    expect(PRICING_METADATA.title).toBe(
      "Patient Aftercare Software Pricing | River Aftercare"
    );
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
