import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingClinicsNav } from "@/app/(marketing)/components/marketing-clinics-nav";
import { MarketingFaq } from "@/app/(marketing)/components/marketing-faq";
import { MarketingProductPreview } from "@/app/(marketing)/components/marketing-product-preview";
import { VERTICAL_LANDINGS } from "@/lib/marketing/vertical-landing";

const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");
const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");
const hub = readFileSync(
  "app/(marketing)/components/marketing-clinics-hub.tsx",
  "utf8"
);
const landing = readFileSync(
  "app/(marketing)/components/marketing-vertical-landing.tsx",
  "utf8"
);

describe("premium marketing UX contracts", () => {
  it("keeps clinic destination cards directional without lifting the card", () => {
    expect(hub).toContain("data-mk-card-arrow");
    expect(styles).toContain(".clinicsHubCardArrow");
    expect(styles).toContain("translateX(0.28rem)");
    expect(styles).not.toMatch(/\.clinicsHubCard:hover\s*\{[^}]*translateY/);
    expect(styles).not.toMatch(/\.clinicsHubCard:hover\s*\{[^}]*scale\(/);
    expect(styles).toContain(
      ".clinicsHubCard:focus-visible .clinicsHubCardArrow"
    );
  });

  it("uses a shared section stack for heading-to-body and body-to-body rhythm", () => {
    expect(tokens).toContain("--mk-heading-intro-gap: 1.35rem");
    expect(tokens).toContain("--mk-body-gap: 1rem");
    expect(styles).toContain(".sectionStack .copy + .copy");
    expect(landing).toContain("sectionStack");
  });

  it("strengthens secondary CTA borders through the vertical accent token", () => {
    expect(styles).toContain(
      "color-mix(in srgb, var(--vertical-accent) 26%, var(--mk-line))"
    );
    expect(styles).not.toContain(".secondary::before");
  });

  it("keeps FAQ first and last rows in one accordion system", () => {
    const html = renderToStaticMarkup(
      <MarketingFaq
        headingId="dental-faq"
        items={VERTICAL_LANDINGS["/dental"].faq.items}
      />
    );
    expect(html).toContain('data-faq-position="first"');
    expect(html).toContain('data-faq-position="last"');
    expect(styles).toContain(".verticalFaqItem:first-child");
    expect(styles).toContain(".verticalFaqItem:last-child");
    expect(styles).toContain("overflow: visible");
    expect(styles).toContain(".verticalFaqQuestion:focus-visible");
    expect(styles).toContain("outline-offset: 3px");
  });

  it("renders a truthful Today / Timeline phone preview without client JS", () => {
    const source = readFileSync(
      "app/(marketing)/components/marketing-product-preview.tsx",
      "utf8"
    );
    const html = renderToStaticMarkup(<MarketingProductPreview />);
    expect(source).not.toMatch(/['"]use client['"]/);
    expect(html).toContain("Today");
    expect(html).toContain("Timeline");
    expect(html).toContain("What to do today");
    expect(html).toContain("Coming next");
    expect(html).toContain("Bite gently on the gauze");
    expect(html).toContain("Recovery overview");
    expect(html).toContain("Call Riverside Dental Demo");
    expect(html).toContain('type="radio"');
    expect(html).not.toContain("<button");
  });

  it("exposes Overview as the parent destination in the clinics disclosure", () => {
    const html = renderToStaticMarkup(
      <MarketingClinicsNav currentPath="/dental" />
    );
    expect(html).toContain("navClinicsKicker");
    expect(html).toContain("navClinicsOverview");
    expect(html).toContain('data-vertical="dental"');
    expect(html.indexOf("Overview")).toBeLessThan(html.indexOf("Dental"));
  });
});
