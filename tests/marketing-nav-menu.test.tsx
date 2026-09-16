import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingNavMenu } from "@/app/(marketing)/components/marketing-nav-menu";

describe("marketing mobile navigation", () => {
  it("puts About, Pricing, Contact, Sign in, and Theme inside the site menu", () => {
    const html = renderToStaticMarkup(
      <MarketingNavMenu
        staffHref="http://app.localhost:3000/login"
        items={[
          { href: "/about", label: "About" },
          { href: "/pricing", label: "Pricing" },
          { href: "/contact", label: "Contact", current: true },
        ]}
        clinicItems={[
          { href: "/dental", label: "Dental" },
          { href: "/physiotherapy", label: "Physiotherapy" },
          { href: "/chiropractic", label: "Chiropractic" },
          { href: "/cosmetic-clinics", label: "Cosmetic & aesthetic" },
        ]}
      />
    );

    expect(html).toContain("Site menu");
    expect(html).toContain("For clinics");
    expect(html).toContain("Dental");
    expect(html).toContain("Physiotherapy");
    expect(html).toContain("Chiropractic");
    expect(html).toContain("Cosmetic &amp; aesthetic");
    expect(html).toContain("About");
    expect(html).toContain("Pricing");
    expect(html).toContain("Contact");
    expect(html).toContain(">Sign in<");
    expect(html).not.toContain("Staff sign in");
    expect(html).toContain("http://app.localhost:3000/login");
    expect(html).toContain("Theme");
    expect(html).toContain("System");
    expect(html).toContain("navMenuRow");
    expect(html).toContain("navMenuMeta");
    expect(html).not.toContain("How it works");
    expect(html).not.toContain("Clinic preview");
  });

  it("uses full-row menu interaction styles with a 48px minimum height", () => {
    const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");

    expect(styles).toContain(".navMenuRow");
    expect(styles).toContain("min-height: 3.05rem");
    expect(styles).toContain("width: 100%");
    expect(styles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(styles).toContain(".navMenuRow:focus-visible");
    expect(styles).not.toMatch(/\.navMenuRow:focus,/);
    expect(styles).not.toMatch(/\.navMenuRow:focus\s*\{/);
    expect(styles).toContain(".navMenuRow:active");
    expect(styles).toContain(".navStaff");
    expect(styles).toContain(".navTheme");
    expect(styles).toContain("display: none");
    expect(styles).toContain(".navMenuMeta");
    expect(styles).not.toContain(".navMenuLink");
  });

  it("parks pointer focus on the panel and only autofocuses About for keyboard open", () => {
    const source = readFileSync(
      "app/(marketing)/components/marketing-nav-menu.tsx",
      "utf8"
    );

    expect(source).toContain("tabIndex={-1}");
    expect(source).toContain("openIntentRef");
    expect(source).toContain("pointerdown");
    expect(source).toContain("menu.focus({ preventScroll: true })");
    expect(source).toContain("first.focus({ preventScroll: true })");
  });
});
