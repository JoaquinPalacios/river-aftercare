import { describe, expect, it } from "vitest";

import { DEFAULT_PLATFORM_SEO } from "@/lib/seo/defaults";
import {
  buildMarketingJsonLdGraph,
  jsonLdContainsOffer,
  organizationId,
  websiteId,
} from "@/lib/seo/json-ld";
import { resolveMarketingSeo } from "@/lib/seo/resolve-marketing-seo";
import { parseJsonLd, serializeJsonLd } from "@/lib/seo/serialize-json-ld";

describe("marketing JSON-LD", () => {
  it("emits Organization and WebSite with stable ids on the homepage", () => {
    const resolved = resolveMarketingSeo({
      path: "/",
      origin: "https://example.test",
    });
    const graph = buildMarketingJsonLdGraph(resolved, "https://example.test");
    const types = graph["@graph"].flatMap((node) =>
      Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]
    );

    expect(types).toEqual(
      expect.arrayContaining([
        "Organization",
        "WebSite",
        "SoftwareApplication",
        "WebPage",
      ])
    );
    expect(
      graph["@graph"].some(
        (node) => node["@id"] === organizationId("https://example.test")
      )
    ).toBe(true);
    expect(
      graph["@graph"].some(
        (node) => node["@id"] === websiteId("https://example.test")
      )
    ).toBe(true);
    expect(jsonLdContainsOffer(graph)).toBe(false);
    expect(JSON.stringify(graph)).not.toContain("aggregateRating");
    expect(JSON.stringify(graph)).not.toContain("MedicalWebPage");
    expect(JSON.stringify(graph)).not.toContain("foundingDate");
    expect(JSON.stringify(graph)).not.toContain("<script");
  });

  it("does not invent contact or sameAs fields", () => {
    const resolved = resolveMarketingSeo({
      path: "/",
      origin: "https://example.test",
      platform: DEFAULT_PLATFORM_SEO,
    });
    const graph = buildMarketingJsonLdGraph(resolved, "https://example.test");
    const organization = graph["@graph"].find(
      (node) => node["@type"] === "Organization"
    );
    expect(organization?.contactPoint).toBeUndefined();
    expect(organization?.sameAs).toBeUndefined();
    expect(organization?.logo).toMatchObject({
      url: "https://example.test/brand/river-aftercare-isologo.svg",
    });
  });

  it("marks contact as ContactPage and about as AboutPage without Offer", () => {
    const contact = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/contact", origin: "https://example.test" }),
      "https://example.test"
    );
    const about = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/about", origin: "https://example.test" }),
      "https://example.test"
    );

    const privacy = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/privacy", origin: "https://example.test" }),
      "https://example.test"
    );
    const terms = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/terms", origin: "https://example.test" }),
      "https://example.test"
    );

    expect(
      contact["@graph"].some((node) => node["@type"] === "ContactPage")
    ).toBe(true);
    expect(about["@graph"].some((node) => node["@type"] === "AboutPage")).toBe(
      true
    );
    expect(jsonLdContainsOffer(contact)).toBe(false);
    expect(jsonLdContainsOffer(about)).toBe(false);
    expect(privacy["@graph"].some((node) => node["@type"] === "WebPage")).toBe(
      true
    );
    expect(terms["@graph"].some((node) => node["@type"] === "WebPage")).toBe(
      true
    );
    expect(JSON.stringify(privacy)).not.toContain("HIPAA");
    expect(JSON.stringify(terms)).not.toContain("MedicalWebPage");
  });

  it("publishes GST-inclusive Essential and Practice offers on the pricing page only", () => {
    const pricing = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/pricing", origin: "https://example.test" }),
      "https://example.test"
    );
    const home = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/", origin: "https://example.test" }),
      "https://example.test"
    );
    const serialized = JSON.stringify(pricing);
    const application = pricing["@graph"].find(
      (node) => node["@type"] === "SoftwareApplication"
    );
    const offers = application?.offers as Array<Record<string, unknown>>;

    expect(jsonLdContainsOffer(pricing)).toBe(true);
    expect(jsonLdContainsOffer(home)).toBe(false);
    expect(offers).toHaveLength(4);
    expect(offers.map((offer) => offer.name)).toEqual([
      "Essential monthly",
      "Essential yearly",
      "Practice monthly",
      "Practice yearly",
    ]);
    expect(offers.map((offer) => offer.price)).toEqual([
      "79",
      "790",
      "149",
      "1490",
    ]);
    expect(offers.map((offer) => offer.price)).not.toContain("59");
    expect(offers.map((offer) => offer.price)).not.toContain("590");
    expect(offers.every((offer) => offer.priceCurrency === "AUD")).toBe(true);
    expect(
      offers.every((offer) => {
        const spec = offer.priceSpecification as Record<string, unknown>;
        return spec.valueAddedTaxIncluded === true;
      })
    ).toBe(true);
    expect(serialized).not.toContain("298");
    expect(offers.some((offer) => String(offer.name).includes("Group"))).toBe(
      false
    );
    expect(serialized).not.toContain("priceValidUntil");
    expect(serialized).not.toContain("InStock");
    expect(serialized).not.toContain("provisional");
  });

  it("uses the SEO title for WebPage.name, not an OG title override", () => {
    const resolved = resolveMarketingSeo({
      path: "/",
      origin: "https://example.test",
    });
    const graph = buildMarketingJsonLdGraph(resolved, "https://example.test");
    const webPage = graph["@graph"].find((node) => node["@type"] === "WebPage");

    expect(resolved.social.title).toBe(
      "Aftercare that still feels like your clinic"
    );
    expect(webPage?.name).toBe(
      "Patient Aftercare Software for Clinics | River Aftercare"
    );
    expect(webPage?.name).not.toBe(resolved.social.title);
    expect(webPage?.description).toBe(resolved.description);
  });

  it("emits WebPage data for clinic acquisition pages without invented schema", () => {
    const dental = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/dental", origin: "https://example.test" }),
      "https://example.test"
    );
    const physio = buildMarketingJsonLdGraph(
      resolveMarketingSeo({
        path: "/physiotherapy",
        origin: "https://example.test",
      }),
      "https://example.test"
    );

    const dentalPage = dental["@graph"].find(
      (node) => node["@id"] === "https://example.test/dental#webpage"
    );
    expect(dentalPage?.["@type"]).toBe("WebPage");
    expect(dentalPage?.url).toBe("https://example.test/dental");
    expect(dentalPage?.name).toBe(
      "Dental Aftercare Software for Practices | River Aftercare"
    );
    expect(dentalPage?.inLanguage).toBe("en");
    expect(dentalPage?.isPartOf).toEqual({
      "@id": "https://example.test/#website",
    });
    expect(dentalPage?.mainEntity).toEqual({
      "@id": "https://example.test/#application",
    });
    expect(JSON.stringify(dental)).toContain("SoftwareApplication");
    expect(JSON.stringify(dental)).not.toContain("FAQPage");
    expect(JSON.stringify(dental)).not.toContain("MedicalWebPage");
    expect(JSON.stringify(dental)).not.toContain("aggregateRating");
    expect(jsonLdContainsOffer(dental)).toBe(false);
    expect(JSON.stringify(physio)).not.toContain("FAQPage");
    expect(
      physio["@graph"].filter((node) => node["@type"] === "SoftwareApplication")
    ).toHaveLength(1);
  });

  it("emits WebPage data for the clinics hub without invented medical schema", () => {
    const clinics = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/clinics", origin: "https://example.test" }),
      "https://example.test"
    );
    const page = clinics["@graph"].find(
      (node) => node["@id"] === "https://example.test/clinics#webpage"
    );

    expect(page?.["@type"]).toBe("WebPage");
    expect(page?.url).toBe("https://example.test/clinics");
    expect(page?.name).toBe(
      "Patient Aftercare Software for Clinics & Practices | River Aftercare"
    );
    expect(page?.mainEntity).toEqual({
      "@id": "https://example.test/#application",
    });
    expect(JSON.stringify(clinics)).toContain("SoftwareApplication");
    expect(JSON.stringify(clinics)).toContain("Organization");
    expect(JSON.stringify(clinics)).toContain("WebSite");
    expect(JSON.stringify(clinics)).not.toContain("FAQPage");
    expect(JSON.stringify(clinics)).not.toContain("MedicalWebPage");
    expect(JSON.stringify(clinics)).not.toContain("MedicalOrganization");
    expect(JSON.stringify(clinics)).not.toContain("aggregateRating");
    expect(jsonLdContainsOffer(clinics)).toBe(false);
    expect(
      clinics["@graph"].filter((node) => node["@type"] === "Organization")
    ).toHaveLength(1);
  });

  it("serializes JSON-LD without raw HTML injection", () => {
    const serialized = serializeJsonLd({
      name: "Safe",
      html: "</script><script>alert(1)</script>",
    });
    expect(serialized).not.toContain("</script>");
    expect(parseJsonLd(serialized)).toMatchObject({ name: "Safe" });
  });
});
