import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingDentalPage from "@/app/(marketing)/%5Fmarketing/dental/page";
import MarketingPhysiotherapyPage from "@/app/(marketing)/%5Fmarketing/physiotherapy/page";
import MarketingChiropracticPage from "@/app/(marketing)/%5Fmarketing/chiropractic/page";
import MarketingCosmeticClinicsPage from "@/app/(marketing)/%5Fmarketing/cosmetic-clinics/page";
import { MARKETING_PAGE_LABELS } from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";
import { MARKETING_SEO_PAGE_KEYS } from "@/lib/seo/page-keys";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";

describe("clinic vertical landing pages", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("renders distinct profession-specific copy and truthful product boundaries", async () => {
    const dental = renderToStaticMarkup(await MarketingDentalPage());
    const physio = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const chiro = renderToStaticMarkup(await MarketingChiropracticPage());
    const cosmetic = renderToStaticMarkup(await MarketingCosmeticClinicsPage());

    expect(dental.match(/<h1\b/g)).toHaveLength(1);
    expect(physio.match(/<h1\b/g)).toHaveLength(1);
    expect(chiro.match(/<h1\b/g)).toHaveLength(1);
    expect(cosmetic.match(/<h1\b/g)).toHaveLength(1);

    expect(dental).toContain(
      "Make post-treatment instructions part of your dental experience."
    );
    expect(physio).toContain(
      "Keep recovery guidance clear between appointments."
    );
    expect(chiro).toContain(
      "Give patients clearer guidance between chiropractic visits."
    );
    expect(cosmetic).toContain(
      "Make post-treatment aftercare feel as considered as the treatment."
    );

    expect(dental).not.toContain(VERTICAL_LANDINGS["/physiotherapy"].hero.h1);
    expect(physio).not.toContain(VERTICAL_LANDINGS["/dental"].hero.h1);
    expect(chiro).not.toContain("leave the chair");
    expect(cosmetic).not.toContain("leave the chair");
    expect(physio).not.toContain("leave the chair");

    expect(dental).toContain("Riverside Dental Demo");
    expect(dental).toContain("View the dental demo");
    expect(dental).toContain("Tooth Extraction");
    expect(dental).toContain("http://demodental.localhost:3000/");
    expect(physio).not.toContain("Riverside Dental Demo");
    expect(chiro).not.toContain("Riverside Dental Demo");
    expect(cosmetic).not.toContain("Riverside Dental Demo");
    expect(physio).not.toContain("View the dental demo");

    expect(physio).toContain("not for tracking whether a patient completes");
    expect(physio).toContain("home exercise programme app");
    expect(physio).not.toContain("adherence monitoring");
    expect(physio).not.toContain("video exercise");
    expect(chiro).toContain("does not replace your clinical record");
    expect(chiro).toContain("publishing technology");
    expect(chiro).not.toContain("spinal alignment");
    expect(chiro).not.toContain("clinical outcomes");
    expect(cosmetic).toContain("does not provide live clinical monitoring");
    expect(cosmetic).not.toContain("reduced complications");
    expect(cosmetic).not.toContain("injectables");
    expect(cosmetic).not.toContain("fillers");

    expect(dental).toContain('href="/pricing"');
    expect(dental).toContain('href="/contact"');
    expect(dental).toContain('href="/about"');
    expect(physio).toContain('href="#workflow"');
    expect(dental).toContain("<main");
    expect(dental).not.toContain("/_marketing");
    expect(JSON.stringify(VERTICAL_LANDINGS)).not.toContain("Riverside Physio");
  });

  it("registers the four clinic pages in the operator SEO defaults", () => {
    expect(MARKETING_SEO_PATHS).toEqual(
      expect.arrayContaining([
        "/dental",
        "/physiotherapy",
        "/chiropractic",
        "/cosmetic-clinics",
      ])
    );
    expect(MARKETING_PAGE_LABELS["/dental"]).toBe("Dental");
    expect(MARKETING_PAGE_LABELS["/cosmetic-clinics"]).toBe(
      "Cosmetic & aesthetic"
    );
    expect(MARKETING_SEO_PAGE_KEYS["/physiotherapy"]).toBe("physiotherapy");
    expect(MARKETING_SEO_PAGE_KEYS["/cosmetic-clinics"]).toBe(
      "cosmeticClinics"
    );
  });
});
