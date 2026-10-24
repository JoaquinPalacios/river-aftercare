import { describe, expect, it } from "vitest";

import {
  practiceSectionScrollTop,
  selectPracticeSection,
  type PracticeSectionId,
} from "@/app/(staff)/(clinic-portal)/practice/practice-section-nav";

const sections: { id: PracticeSectionId; top: number }[] = [
  { id: "practice-identity", top: 900 },
  { id: "practice-branding", top: 1100 },
  { id: "practice-contact", top: 3400 },
  { id: "practice-emergency", top: 4000 },
  { id: "practice-presentation", top: 4300 },
];

const offset = 112;

describe("practice section selection", () => {
  it("keeps Identity before the first heading reaches the activation line", () => {
    expect(
      selectPracticeSection({
        scrollTop: 0,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-identity");
  });

  it("selects the section whose heading has reached the activation line", () => {
    expect(
      selectPracticeSection({
        scrollTop: 1100 - offset,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-branding");

    expect(
      selectPracticeSection({
        scrollTop: 2500,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-branding");

    expect(
      selectPracticeSection({
        scrollTop: 3400 - offset,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-contact");
  });

  it("selects Presentation at the bottom when that section cannot reach the line", () => {
    expect(
      selectPracticeSection({
        scrollTop: 3500,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-presentation");

    expect(
      selectPracticeSection({
        scrollTop: 3496,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-presentation");

    expect(
      selectPracticeSection({
        scrollTop: 3490,
        maxScroll: 3500,
        activationOffset: offset,
        sections,
      })
    ).toBe("practice-contact");
  });

  it("does not force the last section when the page does not scroll", () => {
    expect(
      selectPracticeSection({
        scrollTop: 0,
        maxScroll: 0,
        activationOffset: offset,
        sections: [{ id: "practice-identity", top: 40 }],
      })
    ).toBe("practice-identity");
  });

  it("sorts sections by position before choosing", () => {
    expect(
      selectPracticeSection({
        scrollTop: 0,
        maxScroll: 800,
        activationOffset: 0,
        sections: [
          { id: "practice-presentation", top: 500 },
          { id: "practice-identity", top: 0 },
        ],
      })
    ).toBe("practice-identity");
  });

  it("returns null when no sections exist", () => {
    expect(
      selectPracticeSection({
        scrollTop: 0,
        maxScroll: 100,
        activationOffset: 0,
        sections: [],
      })
    ).toBeNull();
  });
});

describe("practice section scroll target", () => {
  it("aligns a section with the activation offset and clamps to the scroll range", () => {
    expect(
      practiceSectionScrollTop({
        sectionTop: 1100,
        activationOffset: offset,
        maxScroll: 3500,
      })
    ).toBe(1100 - offset);

    expect(
      practiceSectionScrollTop({
        sectionTop: 4300,
        activationOffset: offset,
        maxScroll: 3500,
      })
    ).toBe(3500);

    expect(
      practiceSectionScrollTop({
        sectionTop: 40,
        activationOffset: offset,
        maxScroll: 3500,
      })
    ).toBe(0);
  });
});
