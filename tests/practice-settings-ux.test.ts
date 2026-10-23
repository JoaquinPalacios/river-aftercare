import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("practice settings polish", () => {
  it("tracks the current section, uses one colour picker, and keeps native selects", () => {
    const form = readFileSync(
      "app/(staff)/(clinic-portal)/practice/practice-settings-form.tsx",
      "utf8"
    );
    const color = readFileSync(
      "app/(staff)/components/color-field.tsx",
      "utf8"
    );
    const page = readFileSync(
      "app/(staff)/(clinic-portal)/practice/page.tsx",
      "utf8"
    );

    const css = readFileSync("app/(staff)/staff.css", "utf8");

    expect(form).toContain("attachPracticeSectionNav");
    expect(form).not.toMatch(/\.scrollIntoView\s*\(/);
    expect(form).not.toContain("IntersectionObserver");
    const nav = readFileSync(
      "app/(staff)/(clinic-portal)/practice/practice-section-nav.ts",
      "utf8"
    );
    expect(nav).toContain("prefers-reduced-motion");
    expect(nav).toContain("selectPracticeSection");
    expect(nav).not.toMatch(/\.scrollIntoView\s*\(/);
    expect(form).toContain('aria-current={current ? "true" : undefined}');
    expect(form).toContain("staffSelect");
    expect(form).toContain("staffPracticeSave");
    expect(form).toContain("staffPracticeForm");
    expect(form).toContain("staffPracticeGrid3");
    expect(form).not.toContain("staffEditorChrome");
    expect(page).toContain("staffPracticeHeader");
    expect(color).toContain('type="color"');
    expect(color).toContain("staffColorSwatch");
    expect(color).not.toContain("aria-hidden");
    expect(color).not.toContain("aria-labelledby");
    expect(color).toContain("staffColorHex");
    expect(css).toContain("minmax(0, 1fr)");
  });
});
