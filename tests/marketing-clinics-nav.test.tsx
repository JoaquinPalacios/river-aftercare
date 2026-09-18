import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingClinicsNav } from "@/app/(marketing)/components/marketing-clinics-nav";

describe("marketing clinics navigation", () => {
  it("exposes a click disclosure rather than hover-only links", () => {
    const html = renderToStaticMarkup(
      <MarketingClinicsNav currentPath="/dental" />
    );
    const source = readFileSync(
      "app/(marketing)/components/marketing-clinics-nav.tsx",
      "utf8"
    );

    expect(html).toContain("For clinics");
    expect(html).toContain("Overview");
    expect(html).toContain("Dental");
    expect(html).toContain("Physiotherapy");
    expect(html).toContain("Chiropractic");
    expect(html).toContain("Cosmetic &amp; aesthetic");
    expect(html).toContain('aria-haspopup="true"');
    expect(html).toContain("aria-expanded");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/clinics"');
    expect(html).toContain('href="/dental"');
    expect(html).toContain('href="/cosmetic-clinics"');
    expect(html).toContain("navClinicsKicker");
    expect(html).toContain("navClinicsList");
    expect(html.indexOf('href="/clinics"')).toBeLessThan(
      html.indexOf('href="/dental"')
    );
    expect(source).toContain("Escape");
    expect(source).toContain("pointerdown");
    expect(source).not.toContain("onMouseEnter");
    expect(source).not.toContain("onMouseOver");
  });

  it("marks Overview as the current page on the clinics hub", () => {
    const html = renderToStaticMarkup(
      <MarketingClinicsNav currentPath="/clinics" />
    );
    expect(html).toContain('href="/clinics"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-current="true"');
  });
});
