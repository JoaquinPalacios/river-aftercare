import { describe, expect, it } from "vitest";

import {
  CARE_GUIDE_SLUG_MAX_LENGTH,
  isValidCareGuideSlug,
} from "@/lib/aftercare/slug-rules";
import {
  suggestGuideSlug,
  suggestSiteSlug,
} from "@/lib/clinics/slug-suggestion";

describe("suggestGuideSlug", () => {
  it("builds a url-safe slug from a guide name", () => {
    expect(suggestGuideSlug("Wisdom Teeth Removal")).toBe(
      "wisdom-teeth-removal"
    );
  });

  it("uses the same normalisation as a site address for an ordinary name", () => {
    expect(suggestGuideSlug("Wisdom Teeth Removal")).toBe(
      suggestSiteSlug("Wisdom Teeth Removal")
    );
  });

  it("collapses spacing, case, punctuation, and repeated hyphens", () => {
    expect(suggestGuideSlug("  Tooth   Extraction!! ")).toBe(
      "tooth-extraction"
    );
    expect(suggestGuideSlug("Tooth -- Extraction")).toBe("tooth-extraction");
    expect(suggestGuideSlug("Wisdom's Teeth")).toBe("wisdom-s-teeth");
    expect(suggestGuideSlug("Tooth & Gum Care")).toBe("tooth-gum-care");
  });

  it("strips accents and keeps the result inside the slug length", () => {
    expect(suggestGuideSlug("Café & Crème")).toBe("cafe-creme");
    expect(suggestGuideSlug("Niño's care")).toBe("nino-s-care");

    const long = suggestGuideSlug(
      "Wisdom Teeth Removal Aftercare Instructions"
    );
    expect(long.length).toBeLessThanOrEqual(CARE_GUIDE_SLUG_MAX_LENGTH);
    expect(long.endsWith("-")).toBe(false);
    expect(long).toBe("wisdom-teeth-removal-aftercare-i");
  });

  it("does not invent a suffix when the name is short, empty, or reserved as a host", () => {
    expect(suggestGuideSlug("OK")).toBe("ok");
    expect(suggestGuideSlug("!!!")).toBe("");
    expect(suggestGuideSlug("Contact")).toBe("contact");
    expect(suggestGuideSlug("Wisdom Teeth Removal")).not.toBe(
      "wisdom-teeth-removal-2"
    );
  });

  it("returns a pattern-valid slug when the name is long enough", () => {
    const slug = suggestGuideSlug("Wisdom Teeth Removal");
    expect(isValidCareGuideSlug(slug)).toBe(true);
  });
});
