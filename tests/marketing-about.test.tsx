import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingAboutPage from "@/app/(marketing)/%5Fmarketing/about/page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

const marketingCss = readFileSync(
  "app/(marketing)/marketing.module.css",
  "utf8"
);

describe("marketing about page", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("uses the inner-page heading and section spacing contract", async () => {
    const html = renderToStaticMarkup(await MarketingAboutPage());

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(
      `${PRODUCT_NAME} is a patient aftercare platform for clinics and practices.`
    );
    expect(html).toContain("Aftercare should feel like part of the care.");
    expect(html).toContain('data-mk-page-hero="about"');
    expect(html).toContain("aboutEditorial");
    expect(html).toContain("aboutWho");
    expect(html).toContain("aboutOwnership");
    expect(html).toContain("What it is");
    expect(html).toContain("Who it is for");
    expect(html).toContain("Clinic ownership");
    expect(html).toContain("Product scope");
    expect(html).not.toContain("What it is not");
    expect(html).toContain(
      "A branded home for the guidance patients need afterwards"
    );
    expect(html).toContain("Built for treatment-based practices");
    expect(html).toContain("Your clinic remains responsible for the care");
    expect(html).toContain("Focused on aftercare publishing.");
    expect(html).not.toContain("The first vertical is dental");
    expect(html).not.toContain("mobile-first aftercare pages");
    expect(html).toContain("No patient app");
    expect(html).toContain("No patient login");
    expect(html).toContain("No PDF to hunt down");
    expect(html).toContain("Not a replacement for");
    expect(html).not.toContain("Not currently");
    expect(html).toContain("Live clinical monitoring");
    expect(html).toContain("Patient CRM");
    expect(html).toContain("Health record");
    expect(html).toContain("Messaging platform");
    expect(html).toContain("Emergency care");
    expect(html).toContain("Personalised diagnosis or treatment");
    expect(html).toContain("Request a demo");
    expect(html).toContain("View pricing");
    expect(html).toContain('href="/dental"');
    expect(html).toContain('href="/physiotherapy"');
    expect(html).toContain('href="/chiropractic"');
    expect(html).toContain('href="/cosmetic-clinics"');
    expect(html).toContain("Other appropriate allied health");
    expect(html).toContain("Publishing &amp; content-management technology");
    expect(html).toContain("Approves and owns clinical instructions");
    expect(html).toContain("Remains responsible for care");
    expect(html).toContain(
      `Want to see how ${PRODUCT_NAME} could fit your clinic?`
    );
    expect(html).not.toContain("Talk to us about a demo");
    expect(html).not.toContain("/_marketing");
    expect(marketingCss).toContain(".headingBlock .copy + .copy");
    expect(marketingCss).toContain("margin-top: var(--mk-heading-intro-gap)");
    expect(marketingCss).toContain("margin-top: var(--mk-heading-content-gap)");
    expect(marketingCss).toContain(".aboutClinicList");
    expect(marketingCss).toMatch(/\.aboutClinicList\s*\{[^}]*gap:\s*0\.5rem/);
    expect(marketingCss).toContain("grid-template-rows: repeat(5");
    expect(marketingCss).toContain('grid-template-areas: "module copy"');
    expect(html).toContain("aboutClinicList");
    expect(html).toContain("aboutClinicLink");
    expect(html).toContain("aboutClinicMuted");
    expect(html).toContain('data-vertical="dental"');
    expect(html).toContain('data-vertical="physiotherapy"');
    expect(html).toContain('data-vertical="chiropractic"');
    expect(html).toContain('data-vertical="cosmetic"');
    expect(html).toContain("Other appropriate allied health");
    expect(html).toMatch(
      /<span[^>]*aboutClinicMuted[^>]*>\s*Other appropriate allied health\s*<\/span>/
    );
    expect(html).not.toMatch(
      /<a[^>]*>\s*Other appropriate allied health\s*<\/a>/
    );
    expect(marketingCss).toContain(".marketingSoft > .band:first-child");
    expect(marketingCss).toContain("padding-top: var(--mk-chapter-pad-y)");
    expect(marketingCss).toContain(
      "padding-top: var(--mk-chapter-pad-y-mobile)"
    );
    expect(marketingCss).toContain(".aboutEditorial");
    expect(marketingCss).toContain(".aboutValuePanel");
    expect(marketingCss).toContain(".aboutScopeGrid");
  });

  it("keeps copy-first DOM order for Who it is for", async () => {
    const html = renderToStaticMarkup(await MarketingAboutPage());
    const whoHeading = html.indexOf('id="about-who"');
    const audienceCopy = html.indexOf(
      `${PRODUCT_NAME} is built for clinics where care continues after the appointment`
    );
    const clinicNav = html.indexOf('aria-label="Clinic types"');

    expect(whoHeading).toBeGreaterThan(-1);
    expect(audienceCopy).toBeGreaterThan(whoHeading);
    expect(clinicNav).toBeGreaterThan(audienceCopy);
  });

  it("uses the approved audience and product-scope copy", async () => {
    const html = renderToStaticMarkup(await MarketingAboutPage());

    expect(html).toContain(
      `${PRODUCT_NAME} is built for clinics where care continues after the appointment — including dental, physiotherapy, chiropractic, cosmetic and other appropriate allied-health settings.`
    );
    expect(html).toContain(
      "The language and guidance may differ by profession. The job is the same: give patients clear, clinic-branded information they can return to after they leave."
    );
    expect(html).not.toContain(
      `${PRODUCT_NAME} is designed for clinics where important guidance continues after the appointment`
    );
    expect(html).not.toContain("The underlying job is the same");
    expect(html).toContain(
      `${PRODUCT_NAME} is built to publish clear, clinic-approved guidance patients can return to after care. It complements clinical systems rather than replacing them.`
    );
    expect(html).not.toContain("A publishing platform, not a clinical system");
    expect(html).not.toContain("integrates with");
    expect(html).not.toContain("connects to");
    expect(html).not.toContain("works inside");
  });

  it("does not present internal legal-status copy on About", async () => {
    const html = renderToStaticMarkup(await MarketingAboutPage());

    expect(html).not.toContain("certification");
    expect(html).not.toContain("regulatory approval");
    expect(html).not.toContain("customer counts");
    expect(html).not.toContain("health outcomes");
    expect(html).not.toContain("legal review");
    expect(html).not.toContain("not yet approved");
    expect(html).not.toContain("aboutFootnote");
    expect(marketingCss).not.toContain(".aboutFootnote");
  });
});
