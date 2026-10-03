import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingChiropracticPage from "@/app/(marketing)/%5Fmarketing/chiropractic/page";
import MarketingCosmeticClinicsPage from "@/app/(marketing)/%5Fmarketing/cosmetic-clinics/page";
import MarketingDentalPage from "@/app/(marketing)/%5Fmarketing/dental/page";
import MarketingPhysiotherapyPage from "@/app/(marketing)/%5Fmarketing/physiotherapy/page";
import {
  chiropracticDemoExampleHref,
  configuredCosmeticAestheticDemoHref,
  cosmeticAestheticDemoExampleHref,
  dentalDemoGuideHref,
  exactVerifiedGuideHref,
  LEGACY_DEMODENTAL_EXTRACTION_URL,
  LEGACY_DEMODENTAL_ORIGIN,
  normalizeLegacyDentalDemoUrl,
  physiotherapyDemoExampleHref,
  preferredConfiguredValue,
  SHARED_DEMO_CHIRO_GUIDE_URL,
  SHARED_DEMO_COSMETIC_GUIDE_URL,
  SHARED_DEMO_DENTAL_GUIDE_URL,
  SHARED_DEMO_PHYSIO_GUIDE_URL,
} from "@/lib/marketing/shared-demo-links";

const REQUEST_LABEL = "Request a demo";
const DENTAL_LABEL = "View the dental demo";
const PHYSIO_LABEL = "View the physiotherapy demo";
const CHIRO_LABEL = "View the chiropractic demo";
const CHIRO_WORKFLOW_LABEL = "See how it works";

const DEMO_ENV_KEYS = [
  "RIVER_AFTERCARE_DEMO_DENTAL_URL",
  "RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL",
  "RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL",
  "RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL",
  "CARE_GUIDE_SHARED_DEMO_DENTAL_URL",
  "CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL",
] as const;

function heroActionsHtml(html: string): string {
  const marker = 'data-mk-hero-actions=""';
  const markerAt = html.indexOf(marker);
  expect(markerAt).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<div", markerAt);
  const close = html.indexOf("</div>", markerAt);
  return html.slice(open, close + "</div>".length);
}

function sectionHtml(html: string, labelledBy: string): string {
  const marker = `aria-labelledby="${labelledBy}"`;
  const markerAt = html.indexOf(marker);
  expect(markerAt).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<section", markerAt);
  const close = html.indexOf("</section>", markerAt);
  return html.slice(open, close + "</section>".length);
}

function classNamesForLabel(html: string, label: string): string[] {
  const labelAt = html.indexOf(label);
  expect(labelAt).toBeGreaterThan(-1);
  const tagStart = html.lastIndexOf("<", labelAt);
  const tag = html.slice(tagStart, html.indexOf(">", tagStart));
  const className = tag.match(/class="([^"]*)"/)?.[1] ?? "";
  return className.split(/\s+/).filter(Boolean);
}

function tagForLabel(html: string, label: string): string {
  const labelAt = html.indexOf(label);
  expect(labelAt).toBeGreaterThan(-1);
  const tagStart = html.lastIndexOf("<a", labelAt);
  return html.slice(tagStart, html.indexOf(">", tagStart));
}

describe("marketing demo URL validation", () => {
  it("accepts only the exact HTTPS shared guide, including a trailing slash", () => {
    expect(
      exactVerifiedGuideHref(
        SHARED_DEMO_DENTAL_GUIDE_URL,
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      exactVerifiedGuideHref(
        `${SHARED_DEMO_CHIRO_GUIDE_URL}/`,
        SHARED_DEMO_CHIRO_GUIDE_URL
      )
    ).toBe(SHARED_DEMO_CHIRO_GUIDE_URL);
    expect(
      exactVerifiedGuideHref(
        "http://demo.riveraftercare.com.au/extraction",
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBeNull();
    expect(
      exactVerifiedGuideHref(
        "https://demo.riveraftercare.com.au/extraction?ok=1",
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBeNull();
    expect(
      exactVerifiedGuideHref(
        "https://demo.riveraftercare.com.au/extraction#guide",
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBeNull();
    expect(
      exactVerifiedGuideHref(
        "https://user:pass@demo.riveraftercare.com.au/extraction",
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBeNull();
    expect(
      exactVerifiedGuideHref(
        "https://other.riveraftercare.com.au/extraction",
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBeNull();
    expect(
      exactVerifiedGuideHref("   ", SHARED_DEMO_DENTAL_GUIDE_URL)
    ).toBeNull();
    expect(
      exactVerifiedGuideHref(undefined, SHARED_DEMO_DENTAL_GUIDE_URL)
    ).toBeNull();
  });

  it("prefers the first non-blank value and does not let a blank new variable hide a legacy one", () => {
    expect(preferredConfiguredValue(undefined, "legacy")).toBe("legacy");
    expect(preferredConfiguredValue("  ", "legacy")).toBe("legacy");
    expect(preferredConfiguredValue("", undefined)).toBeUndefined();
    expect(preferredConfiguredValue("new", "legacy")).toBe("new");
  });

  it("normalises only the designated demodental Tooth Extraction address", () => {
    expect(normalizeLegacyDentalDemoUrl(LEGACY_DEMODENTAL_EXTRACTION_URL)).toBe(
      SHARED_DEMO_DENTAL_GUIDE_URL
    );
    expect(
      normalizeLegacyDentalDemoUrl(`${LEGACY_DEMODENTAL_EXTRACTION_URL}/`)
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(normalizeLegacyDentalDemoUrl(LEGACY_DEMODENTAL_ORIGIN)).toBe(
      SHARED_DEMO_DENTAL_GUIDE_URL
    );
    expect(
      normalizeLegacyDentalDemoUrl("https://demodental.riveraftercare.com.au")
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      normalizeLegacyDentalDemoUrl(
        "http://demodental.riveraftercare.com.au/extraction"
      )
    ).toBeNull();
    expect(
      normalizeLegacyDentalDemoUrl(
        "https://demodental.riveraftercare.com.au/not-extraction"
      )
    ).toBeNull();
    expect(
      normalizeLegacyDentalDemoUrl("https://clinic.example/extraction")
    ).toBeNull();
    expect(
      normalizeLegacyDentalDemoUrl(
        "https://demodental.riveraftercare.com.au/extraction?patient=1"
      )
    ).toBeNull();
    expect(
      normalizeLegacyDentalDemoUrl(SHARED_DEMO_DENTAL_GUIDE_URL)
    ).toBeNull();
  });

  it("resolves dental marketing to the shared guide and keeps unrelated hosts", () => {
    expect(
      dentalDemoGuideHref({
        RIVER_AFTERCARE_DEMO_DENTAL_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      dentalDemoGuideHref({
        RIVER_AFTERCARE_DEMO_DENTAL_URL: `${SHARED_DEMO_DENTAL_GUIDE_URL}/`,
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      dentalDemoGuideHref({
        CARE_GUIDE_SHARED_DEMO_DENTAL_URL: LEGACY_DEMODENTAL_EXTRACTION_URL,
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      dentalDemoGuideHref({
        RIVER_AFTERCARE_DEMO_DENTAL_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
        CARE_GUIDE_SHARED_DEMO_DENTAL_URL: "https://clinic.example/extraction",
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      dentalDemoGuideHref({
        RIVER_AFTERCARE_DEMO_DENTAL_URL: "   ",
        CARE_GUIDE_SHARED_DEMO_DENTAL_URL: LEGACY_DEMODENTAL_ORIGIN,
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);

    const invalid = dentalDemoGuideHref({
      RIVER_AFTERCARE_DEMO_DENTAL_URL: "https://clinic.example/extraction",
    });
    expect(invalid).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(invalid).not.toContain("clinic.example");

    expect(
      dentalDemoGuideHref(
        { CARE_GUIDE_ROOT_DOMAIN: "riveraftercare.com.au" },
        "http://demodental.localhost:3000/"
      )
    ).toBe("http://demodental.localhost:3000/extraction");
    expect(
      dentalDemoGuideHref({}, "https://other.riveraftercare.com.au/")
    ).toBe("https://other.riveraftercare.com.au/extraction");
    expect(
      dentalDemoGuideHref(
        {
          RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: SHARED_DEMO_PHYSIO_GUIDE_URL,
        },
        "http://demodental.localhost:3000/"
      )
    ).toBe("http://demodental.localhost:3000/extraction");
  });

  it("keeps physiotherapy on the new variable, then the legacy variable", () => {
    expect(physiotherapyDemoExampleHref({})).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: "   ",
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: SHARED_DEMO_PHYSIO_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: `${SHARED_DEMO_PHYSIO_GUIDE_URL}/`,
      })
    ).toBe(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(
      physiotherapyDemoExampleHref({
        RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: SHARED_DEMO_PHYSIO_GUIDE_URL,
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL:
          "https://demophysio.riveraftercare.com.au/home-exercise-plan",
      })
    ).toBe(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(
      physiotherapyDemoExampleHref({
        RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: "https://clinic.example/plan",
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: SHARED_DEMO_PHYSIO_GUIDE_URL,
      })
    ).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
      })
    ).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: "",
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: "",
      })
    ).toBeNull();
  });

  it("enables chiropractic only for its own verified guide", () => {
    expect(chiropracticDemoExampleHref({})).toBeNull();
    expect(
      chiropracticDemoExampleHref({
        RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL: " ",
      })
    ).toBeNull();
    expect(
      chiropracticDemoExampleHref({
        RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL: SHARED_DEMO_CHIRO_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_CHIRO_GUIDE_URL);
    expect(
      chiropracticDemoExampleHref({
        RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL: `${SHARED_DEMO_CHIRO_GUIDE_URL}/`,
      })
    ).toBe(SHARED_DEMO_CHIRO_GUIDE_URL);
    expect(
      chiropracticDemoExampleHref({
        RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
      })
    ).toBeNull();
    expect(
      chiropracticDemoExampleHref({
        RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL: SHARED_DEMO_PHYSIO_GUIDE_URL,
        RIVER_AFTERCARE_DEMO_DENTAL_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
      })
    ).toBeNull();
    expect(
      chiropracticDemoExampleHref({
        RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL:
          "http://demo.riveraftercare.com.au/chiropractic-adjustment",
      })
    ).toBeNull();
  });

  it("keeps the cosmetic demonstration unavailable to marketing", () => {
    expect(cosmeticAestheticDemoExampleHref()).toBeNull();
    expect(
      configuredCosmeticAestheticDemoHref({
        RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL:
          SHARED_DEMO_COSMETIC_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_COSMETIC_GUIDE_URL);
    expect(
      configuredCosmeticAestheticDemoHref({
        RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL:
          "https://clinic.example/peel",
      })
    ).toBeNull();
    expect(configuredCosmeticAestheticDemoHref({})).toBeNull();
  });
});

describe("marketing demo hero presentation", () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of [
      ...DEMO_ENV_KEYS,
      "CARE_GUIDE_ROOT_DOMAIN",
      "CARE_GUIDE_METADATA_BASE",
    ]) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    previous.clear();
  });

  it("points production dental marketing at the shared guide without a dental variable", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "riveraftercare.com.au";
    const html = renderToStaticMarkup(await MarketingDentalPage());
    const hero = heroActionsHtml(html);
    const demo = tagForLabel(hero, DENTAL_LABEL);

    expect(demo).toContain(`href="${SHARED_DEMO_DENTAL_GUIDE_URL}"`);
    expect(demo).toContain('target="_blank"');
    expect(demo).toContain('rel="noopener noreferrer"');
    expect(hero).not.toContain("demodental.riveraftercare.com.au");
    expect(hero.indexOf(REQUEST_LABEL)).toBeLessThan(
      hero.indexOf(DENTAL_LABEL)
    );
    expect(hero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(html).toContain(`href="${SHARED_DEMO_DENTAL_GUIDE_URL}"`);
    expect(html).not.toContain("demodental.riveraftercare.com.au");
  });

  it("keeps the local dental guide when no production demo URL is configured", async () => {
    const html = renderToStaticMarkup(await MarketingDentalPage());
    const hero = heroActionsHtml(html);
    expect(hero).toContain(
      'href="http://demodental.localhost:3000/extraction"'
    );
    expect(tagForLabel(hero, DENTAL_LABEL)).toContain('target="_blank"');
    expect(tagForLabel(hero, DENTAL_LABEL)).toContain(
      'rel="noopener noreferrer"'
    );
  });

  it("uses the new dental variable and ignores an unrelated legacy value", async () => {
    process.env.RIVER_AFTERCARE_DEMO_DENTAL_URL = `${SHARED_DEMO_DENTAL_GUIDE_URL}/`;
    process.env.CARE_GUIDE_SHARED_DEMO_DENTAL_URL =
      "https://clinic.example/extraction";
    const html = renderToStaticMarkup(await MarketingDentalPage());
    expect(html).toContain(`href="${SHARED_DEMO_DENTAL_GUIDE_URL}"`);
    expect(html).not.toContain("clinic.example");
    expect(html).not.toContain(`${SHARED_DEMO_DENTAL_GUIDE_URL}/"`);
  });

  it("shows the physiotherapy hero from the legacy variable alone", async () => {
    process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL =
      SHARED_DEMO_PHYSIO_GUIDE_URL;
    const html = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const hero = heroActionsHtml(html);
    const dental = heroActionsHtml(
      renderToStaticMarkup(await MarketingDentalPage())
    );
    const demo = tagForLabel(hero, PHYSIO_LABEL);

    expect(hero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(demo).toContain(`href="${SHARED_DEMO_PHYSIO_GUIDE_URL}"`);
    expect(demo).toContain('target="_blank"');
    expect(demo).toContain('rel="noopener noreferrer"');
    expect(demo).toContain('data-live-example="ready"');
    expect(classNamesForLabel(hero, PHYSIO_LABEL)).toEqual(
      classNamesForLabel(dental, DENTAL_LABEL)
    );
    expect(hero).not.toContain("See how River Aftercare works");
    expect(sectionHtml(html, "physiotherapy-demo")).toContain(
      'href="#workflow"'
    );
  });

  it("does not let an invalid new physiotherapy variable fall back to the legacy variable", async () => {
    process.env.RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL =
      "https://clinic.example/plan";
    process.env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL =
      SHARED_DEMO_PHYSIO_GUIDE_URL;
    const html = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const hero = heroActionsHtml(html);

    expect(hero).toContain('data-live-example="unavailable"');
    expect(hero).not.toContain(PHYSIO_LABEL);
    expect(html).not.toContain(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(html).not.toContain("clinic.example");
  });

  it("keeps chiropractic as two actions until its own URL validates", async () => {
    const html = renderToStaticMarkup(await MarketingChiropracticPage());
    const hero = heroActionsHtml(html);

    expect(hero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(hero).toContain(REQUEST_LABEL);
    expect(hero).toContain(CHIRO_WORKFLOW_LABEL);
    expect(hero).toContain('href="#workflow"');
    expect(hero).not.toContain(CHIRO_LABEL);
    expect(html).not.toContain(SHARED_DEMO_CHIRO_GUIDE_URL);
    expect(html).not.toContain(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(html).not.toContain(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(sectionHtml(html, "chiropractic-workflow")).not.toContain(
      CHIRO_WORKFLOW_LABEL
    );
  });

  it("matches the dental hero when the chiropractic guide URL is verified", async () => {
    process.env.RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL = `${SHARED_DEMO_CHIRO_GUIDE_URL}/`;
    process.env.RIVER_AFTERCARE_DEMO_DENTAL_URL = SHARED_DEMO_DENTAL_GUIDE_URL;
    process.env.RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL =
      SHARED_DEMO_PHYSIO_GUIDE_URL;
    const html = renderToStaticMarkup(await MarketingChiropracticPage());
    const dental = renderToStaticMarkup(await MarketingDentalPage());
    const hero = heroActionsHtml(html);
    const dentalHero = heroActionsHtml(dental);
    const workflow = sectionHtml(html, "chiropractic-workflow");
    const demo = tagForLabel(hero, CHIRO_LABEL);

    expect(hero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(dentalHero.match(/<(a|button)\b/g)).toHaveLength(2);
    expect(hero.indexOf(REQUEST_LABEL)).toBeLessThan(hero.indexOf(CHIRO_LABEL));
    expect(hero).not.toContain(CHIRO_WORKFLOW_LABEL);
    expect(demo).toContain(`href="${SHARED_DEMO_CHIRO_GUIDE_URL}"`);
    expect(demo).toContain('target="_blank"');
    expect(demo).toContain('rel="noopener noreferrer"');
    expect(demo).toContain('data-live-example="ready"');
    expect(classNamesForLabel(hero, CHIRO_LABEL)).toEqual(
      classNamesForLabel(dentalHero, DENTAL_LABEL)
    );
    expect(classNamesForLabel(hero, REQUEST_LABEL)).toEqual(
      classNamesForLabel(dentalHero, REQUEST_LABEL)
    );
    expect(workflow).toContain(CHIRO_WORKFLOW_LABEL);
    expect(workflow).toContain('href="#workflow"');
    expect(html).not.toContain(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(html).not.toContain(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(
      html.match(new RegExp(SHARED_DEMO_CHIRO_GUIDE_URL, "g"))
    ).toHaveLength(1);
  });

  it("does not enable a cosmetic live example from its reserved variable", async () => {
    process.env.RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL =
      SHARED_DEMO_COSMETIC_GUIDE_URL;
    const html = renderToStaticMarkup(await MarketingCosmeticClinicsPage());
    const hero = heroActionsHtml(html);

    expect(cosmeticAestheticDemoExampleHref()).toBeNull();
    expect(hero).toContain(CHIRO_WORKFLOW_LABEL);
    expect(hero).not.toContain("View the cosmetic");
    expect(html).not.toContain(SHARED_DEMO_COSMETIC_GUIDE_URL);
    expect(html).not.toContain('data-live-example="ready"');
  });
});
