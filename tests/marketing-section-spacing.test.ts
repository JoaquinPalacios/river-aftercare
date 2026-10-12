import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");
const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");

function blockAfter(source: string, marker: string): string {
  const start = source.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start);
}

describe("marketing content spacing contract", () => {
  it("keeps the closing CTA on its own padding", () => {
    expect(styles).toMatch(/\.ctaBlock\s*\{[^}]*padding:\s*6rem 0 2\.5rem;/);
    const mobile = blockAfter(styles, "@media (max-width: 47.99rem)");
    expect(mobile).toMatch(/\.ctaBlock\s*\{[^}]*padding-top:\s*4rem;/);
    expect(styles).toMatch(
      /\.verticalCtaBlock\s*\{[^}]*padding-bottom:\s*var\(--mk-section-space-md\);/
    );
    expect(mobile).not.toMatch(/\.ctaBlock\s*\{[^}]*padding-bottom:/);
    expect(mobile).not.toMatch(/\.verticalCtaBlock\s*\{[^}]*padding-top:/);
  });

  it("uses one desktop rhythm and a wider homepage storytelling gap", () => {
    const desktop = blockAfter(styles, "@media (min-width: 64rem)");

    expect(desktop).toContain("padding-bottom: var(--mk-content-space)");
    expect(desktop).toContain("padding-top: var(--mk-content-space)");
    expect(desktop).toContain(
      "main > .hero + .marketingSoft > .band:first-child"
    );
    expect(desktop).toContain("padding-top: var(--mk-content-space-home)");
    expect(desktop).toContain(
      "main > .hero + .marketingSoft > .band:not(:last-child)"
    );
    expect(desktop).toContain("padding-bottom: var(--mk-content-space-home)");
    expect(desktop).toContain(".aboutEditorial + .aboutEditorial");
    expect(desktop).toContain("margin-top: var(--mk-content-space)");
    expect(desktop).toContain(".verticalBand");
    expect(desktop).toContain(".aboutOwnership");
    expect(desktop).not.toContain(".pricingNotesBand");
    expect(desktop).not.toContain(".aboutScopeBand");
    expect(desktop).not.toContain(".clinicsHubPlatformBand");
    expect(desktop).not.toContain(".verticalHero + .verticalBand");
    expect(desktop).not.toMatch(/\.ctaBlock\s*\{[^}]*padding/);
  });

  it("gives mobile groups one separation and a different edge", () => {
    const mobile = blockAfter(styles, "@media (max-width: 47.99rem)");

    expect(mobile).toContain("padding-bottom: var(--mk-content-space-mobile)");
    expect(mobile).toContain(
      "padding-bottom: var(--mk-content-group-edge-mobile)"
    );
    expect(mobile).toContain(
      "padding-top: var(--mk-content-group-edge-mobile)"
    );
    expect(mobile).toContain(":only-child");
    expect(mobile).toContain(
      "main > .pageHero + .marketingSoft > .band:first-child"
    );
    expect(mobile).toContain(
      "main > .clinicsHubHero + .marketingSoft > .band:first-child"
    );
    expect(mobile).toContain("padding-top: var(--mk-content-space-mobile)");
    expect(mobile).toContain(
      ".marketingSoft > .band:has(> .inner > .aboutEditorial + .aboutEditorial)"
    );
    expect(mobile).toContain(".verticalBand");
    expect(mobile).toContain("padding-top: 3rem");
    expect(mobile).not.toContain("padding-top: var(--mk-content-space-home)");
  });

  it("keeps tablet band padding on the previous chapter scale", () => {
    expect(tokens).toContain("--mk-chapter-pad-y: 6rem");
    expect(tokens).toContain("--mk-section-pad-bottom: 8rem");
    expect(tokens).toContain("--mk-section-pad-bottom-last: 6rem");
    expect(styles).toContain("padding-top: var(--mk-chapter-pad-y)");
    expect(styles).toContain("padding-bottom: var(--mk-section-pad-bottom)");
    expect(styles).toContain(
      "padding-bottom: var(--mk-section-pad-bottom-last)"
    );
    expect(styles).not.toContain(".band:first-of-type");
  });

  it("raises inner-page heroes to the desktop minimum without shrinking pricing", () => {
    const desktop = blockAfter(styles, "@media (min-width: 64rem)");

    expect(desktop).toContain(
      "padding-top: max(4rem, clamp(3.1rem, 5.4vw, 4.35rem))"
    );
    expect(desktop).toContain("padding-top: 4rem");
    expect(desktop).toContain("padding-bottom: 4rem");
    expect(desktop).not.toMatch(/\.hero\s*\{[^}]*padding-top:\s*4rem/);
  });
});
