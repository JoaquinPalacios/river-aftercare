import { describe, expect, it } from "vitest";

import { guideSectionTone } from "@/lib/aftercare/guide-section-tone";
import type { GuideSectionKind } from "@/lib/aftercare/types";

describe("guideSectionTone", () => {
  it("styles from semantic kind rather than section key", () => {
    expect(guideSectionTone("WARNING_SIGNS")).toBe("warning");
    expect(guideSectionTone("EMERGENCY")).toBe("emergency");
    expect(guideSectionTone("INTRODUCTION")).toBe("lead");
    expect(guideSectionTone("IMMEDIATE_CARE")).toBe("lead");
    expect(guideSectionTone("FIRST_24_HOURS")).toBe("default");
    expect(guideSectionTone("CUSTOM")).toBe("default");
    expect(guideSectionTone("WHAT_IS_NORMAL")).toBe("reassurance");
    expect(guideSectionTone("CONTACT_PRACTICE")).toBe("contact");
  });

  it("derives tone from section kind", () => {
    const kinds: GuideSectionKind[] = [
      "RECOVERY_TIMELINE",
      "WHAT_IS_NORMAL",
      "CONTACT_PRACTICE",
    ];
    expect(kinds.map(guideSectionTone)).toEqual([
      "default",
      "reassurance",
      "contact",
    ]);
  });
});
