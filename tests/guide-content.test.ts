import { describe, expect, it } from "vitest";

import { guideContentBlocks } from "@/lib/aftercare/guide-content";

describe("guideContentBlocks", () => {
  it("turns bullet lines into one list and keeps the lead paragraph", () => {
    expect(
      guideContentBlocks(`Contact your clinic if you have:

• severe or worsening pain
• heavy bleeding
• fever`)
    ).toEqual([
      { type: "paragraph", text: "Contact your clinic if you have:" },
      {
        type: "list",
        items: ["severe or worsening pain", "heavy bleeding", "fever"],
      },
    ]);
  });

  it("accepts hyphen bullets and leaves ordinary paragraphs intact", () => {
    expect(
      guideContentBlocks(`Keep the area clean.

- avoid alcohol
- avoid strenuous exercise`)
    ).toEqual([
      { type: "paragraph", text: "Keep the area clean." },
      {
        type: "list",
        items: ["avoid alcohol", "avoid strenuous exercise"],
      },
    ]);
    expect(guideContentBlocks("Line one\nLine two")).toEqual([
      { type: "paragraph", text: "Line one\nLine two" },
    ]);
    expect(guideContentBlocks("First paragraph.\n\nSecond paragraph.")).toEqual(
      [
        { type: "paragraph", text: "First paragraph." },
        { type: "paragraph", text: "Second paragraph." },
      ]
    );
  });

  it("does not treat HTML or a bare hyphen as a list", () => {
    expect(
      guideContentBlocks("<script>alert(1)</script>\n-5 degrees overnight")
    ).toEqual([
      {
        type: "paragraph",
        text: "<script>alert(1)</script>\n-5 degrees overnight",
      },
    ]);
    expect(guideContentBlocks("•item\n-5 degrees overnight")).toEqual([
      { type: "paragraph", text: "•item\n-5 degrees overnight" },
    ]);
  });
});
