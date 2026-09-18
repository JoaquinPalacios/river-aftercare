import { afterEach, describe, expect, it } from "vitest";

import {
  getMarketingContactFromEmail,
  getMarketingContactToEmail,
} from "@/lib/marketing/contact-config";
import { HOME_METADATA, PRICING_METADATA } from "@/lib/marketing/metadata";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("marketing contact addresses", () => {
  const previousTo = process.env.CONTACT_EMAIL_TO;
  const previousFrom = process.env.CONTACT_EMAIL_FROM;
  const previousLegacyTo = process.env.MARKETING_CONTACT_TO_EMAIL;
  const previousLegacyFrom = process.env.MARKETING_CONTACT_FROM_EMAIL;
  const previousLegacy = process.env.MARKETING_CONTACT_EMAIL;

  afterEach(() => {
    restore("CONTACT_EMAIL_TO", previousTo);
    restore("CONTACT_EMAIL_FROM", previousFrom);
    restore("MARKETING_CONTACT_TO_EMAIL", previousLegacyTo);
    restore("MARKETING_CONTACT_FROM_EMAIL", previousLegacyFrom);
    restore("MARKETING_CONTACT_EMAIL", previousLegacy);
  });

  it("accepts configured to/from addresses and rejects malformed values", () => {
    expect(
      getMarketingContactToEmail({
        CONTACT_EMAIL_TO: "hello@example.test",
      })
    ).toBe("hello@example.test");
    expect(
      getMarketingContactFromEmail({
        CONTACT_EMAIL_FROM: "website@example.test",
      })
    ).toBe("website@example.test");
    expect(
      getMarketingContactToEmail({ CONTACT_EMAIL_TO: "not-an-email" })
    ).toBeNull();
    expect(
      getMarketingContactFromEmail({
        CONTACT_EMAIL_FROM: "hello@example",
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
      "http://localhost/clinics",
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
        "/clinics",
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
