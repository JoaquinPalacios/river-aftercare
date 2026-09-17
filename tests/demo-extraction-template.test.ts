import { describe, expect, it } from "vitest";

import {
  DEMO_EXTRACTION_SECTIONS,
  DEMO_EXTRACTION_TEMPLATE_SLUG,
  DEMO_EXTRACTION_TEMPLATE_TITLE,
} from "@/lib/aftercare/demo-extraction-template";

describe("demo Tooth Extraction sample payload", () => {
  it("keeps the eight seed canonical sections without inventing clinical copy", () => {
    expect(DEMO_EXTRACTION_TEMPLATE_SLUG).toBe("extraction");
    expect(DEMO_EXTRACTION_TEMPLATE_TITLE).toBe("Tooth Extraction");
    expect(DEMO_EXTRACTION_SECTIONS).toHaveLength(8);
    expect(DEMO_EXTRACTION_SECTIONS[0]?.key).toBe("introduction");
    expect(DEMO_EXTRACTION_SECTIONS[0]?.body).toContain(
      "Riverside Dental Demo"
    );
    expect(
      DEMO_EXTRACTION_SECTIONS.some(
        (section) => section.key === "weekend-contact"
      )
    ).toBe(false);
  });
});
