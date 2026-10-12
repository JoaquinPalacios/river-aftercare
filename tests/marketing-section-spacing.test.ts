import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");
const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");

function mediaBlock(source: string, marker: string): string {
  const start = source.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n@media", start + marker.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("marketing content spacing contract", () => {
  it("keeps the closing CTA on its own padding", () => {
    expect(styles).toMatch(/\.ctaBlock\s*\{[^}]*padding:\s*6rem 0 2\.5rem;/);
    const mobile = mediaBlock(styles, "@media (max-width: 47.99rem)");
    expect(mobile).toMatch(/\.ctaBlock\s*\{[^}]*padding-top:\s*4rem;/);
    expect(styles).toMatch(
      /\.verticalCtaBlock\s*\{[^}]*padding-bottom:\s*var\(--mk-section-space-md\);/
    );
    expect(mobile).not.toMatch(/\.ctaBlock\s*\{[^}]*padding-bottom:/);
    expect(mobile).not.toMatch(/\.verticalCtaBlock\s*\{[^}]*padding-top:/);
  });

  it("uses one desktop rhythm and a wider homepage storytelling gap", () => {
    const desktop = mediaBlock(styles, "@media (min-width: 64rem)");

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

  it("uses the mobile content rhythm below 64rem, including tablet", () => {
    const belowDesktop = mediaBlock(styles, "@media (max-width: 63.99rem)");
    const phoneOnly = mediaBlock(styles, "@media (max-width: 47.99rem)");

    expect(belowDesktop).toContain(
      "padding-bottom: var(--mk-content-space-mobile)"
    );
    expect(belowDesktop).toContain(
      "padding-bottom: var(--mk-content-group-edge-mobile)"
    );
    expect(belowDesktop).toContain(
      "padding-top: var(--mk-content-group-edge-mobile)"
    );
    expect(belowDesktop).toContain(":only-child");
    expect(belowDesktop).toContain(
      "main > .hero + .marketingSoft > .band:first-child"
    );
    expect(belowDesktop).toContain(
      "main > .pageHero + .marketingSoft > .band:first-child"
    );
    expect(belowDesktop).toContain(
      "main > .clinicsHubHero + .marketingSoft > .band:first-child"
    );
    expect(belowDesktop).toContain(
      "padding-top: var(--mk-content-space-mobile)"
    );
    expect(belowDesktop).toContain(
      ".marketingSoft > .band:has(> .inner > .aboutEditorial + .aboutEditorial)"
    );
    expect(belowDesktop).toContain(".aboutEditorial + .aboutEditorial");
    expect(belowDesktop).toContain(
      "margin-top: var(--mk-content-space-mobile)"
    );
    expect(belowDesktop).toContain(".verticalBand");
    expect(belowDesktop).toContain(".aboutOwnership");
    expect(belowDesktop).not.toContain(
      "padding-top: var(--mk-content-space-home)"
    );
    expect(belowDesktop).not.toMatch(/\.ctaBlock\s*\{[^}]*padding/);
    expect(belowDesktop).not.toContain(".phoneShell");
    expect(belowDesktop).not.toContain("padding-top: 3rem");

    expect(phoneOnly).toContain("padding-top: 3rem");
    expect(phoneOnly).toMatch(/\.ctaBlock\s*\{[^}]*padding-top:\s*4rem;/);
    expect(phoneOnly).not.toContain("--mk-content-space-mobile");
    expect(styles).not.toContain(".band:first-of-type");
    expect(styles).not.toContain(".band:last-of-type");
  });

  it("drops the obsolete tablet chapter tokens", () => {
    expect(tokens).not.toContain("--mk-chapter-pad-y");
    expect(tokens).not.toContain("--mk-section-pad-bottom");
    expect(tokens).not.toContain("--mk-section-pad-bottom-last");
    expect(styles).not.toContain("var(--mk-chapter-pad-y)");
    expect(styles).not.toContain("var(--mk-section-pad-bottom)");
    expect(styles).not.toContain("var(--mk-section-space-lg)");
  });

  it("raises inner-page heroes to the desktop minimum without shrinking pricing", () => {
    const desktop = mediaBlock(styles, "@media (min-width: 64rem)");

    expect(desktop).toContain(
      "padding-top: max(4rem, clamp(3.1rem, 5.4vw, 4.35rem))"
    );
    expect(desktop).toContain("padding-top: 4rem");
    expect(desktop).toContain("padding-bottom: 4rem");
    expect(desktop).not.toMatch(/\.hero\s*\{[^}]*padding-top:\s*4rem/);
  });
});
