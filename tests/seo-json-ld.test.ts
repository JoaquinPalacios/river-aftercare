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
    const pricing = buildMarketingJsonLdGraph(
      resolveMarketingSeo({ path: "/pricing", origin: "https://example.test" }),
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
    expect(jsonLdContainsOffer(pricing)).toBe(false);
    expect(JSON.stringify(pricing)).not.toContain("priceCurrency");
    expect(privacy["@graph"].some((node) => node["@type"] === "WebPage")).toBe(
      true
    );
    expect(terms["@graph"].some((node) => node["@type"] === "WebPage")).toBe(
      true
    );
    expect(JSON.stringify(privacy)).not.toContain("HIPAA");
    expect(JSON.stringify(terms)).not.toContain("MedicalWebPage");
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

  it("serializes JSON-LD without raw HTML injection", () => {
    const serialized = serializeJsonLd({
      name: "Safe",
      html: "</script><script>alert(1)</script>",
    });
    expect(serialized).not.toContain("</script>");
    expect(parseJsonLd(serialized)).toMatchObject({ name: "Safe" });
  });
});
