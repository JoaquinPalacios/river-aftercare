import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import MarketingHomePage from "@/app/(marketing)/%5Fmarketing/page";

describe("marketing homepage", () => {
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

  it("explains the product and links to the demo tenant, not the staff console", async () => {
    const html = renderToStaticMarkup(await MarketingHomePage());

    expect(html).toContain("River Aftercare");
    expect(html).toContain("Patient aftercare for clinics and practices");
    expect(html).not.toContain("Aftercare platform");
    expect(html).not.toContain("THE AFTERCARE PLATFORM");
    expect(html).toContain("Aftercare that still feels like your clinic.");
    expect(html).toContain("always leave with clarity.");
    expect(html).toContain("Paper");
    expect(html).toContain("PDFs");
    expect(html).toContain("How it works");
    expect(html).toContain("Apply your clinic brand");
    expect(html).toContain("data-mk-process");
    expect(html).toContain("data-mk-process-rail");
    expect(html).toContain("data-mk-process-card");
    expect(html).toContain("data-mk-pillars");
    expect(html).toContain("data-mk-pillar");
    expect(html).toContain("data-mk-custom-strip");
    expect(html).not.toContain("data-mk-bento");
    expect(html).not.toContain("data-mk-bento-card");
    expect(html).toContain("Looks like your clinic");
    expect(html).toContain("Easy for patients to revisit");
    expect(html).toContain("Simple for your team");
    expect(html).toContain("data-mk-product-copy");
    expect(html).toContain("data-mk-product-visual");
    expect(html).toContain("data-mk-process-connector");
    expect(html.indexOf("data-mk-product-copy")).toBeLessThan(
      html.indexOf("data-mk-product-canvas")
    );
    expect(html).toContain(
      "Your clinic name, colours and terminology stay front"
    );
    expect(html).toContain("Controlled brand choices");
    expect(html).toContain("Clinic-first presentation");
    expect(html).toContain("Give patients one clear place to return to");
    expect(html).toContain("Durable link");
    expect(html).toContain("Clinic contact nearby");
    expect(html).toContain(
      "Publish approved guidance without rebuilding a page every time."
    );
    expect(html).toContain("Reusable guides");
    expect(html).toContain("Consistent presentation");
    expect(html).not.toContain("not a generic platform shell");
    expect(html).not.toContain(
      "Keep approved content consistent across every published guide."
    );
    expect(html).toContain("Controlled publishing");
    expect(html).toContain("Approved guide");
    expect(html).toContain("Clinic brand");
    expect(html).toContain("A branded patient aftercare home");
    expect(html).toContain("data-mk-product-canvas");
    expect(html).not.toContain("data-mk-patient-preview");
    expect(html).not.toContain(">Patient view<");
    expect(html).toContain("Patient aftercare view");
    expect(html).toContain("Brand flexibility");
    expect(html).not.toContain("Brand directions");
    expect(html).not.toContain(
      "No login, no feed — just the guidance patients need, with the clinic still one tap away."
    );
    expect(html).not.toContain("recovery information patients need");
    expect(html).not.toContain("No login, no feed");
    expect(html).toContain("riverside.[your-domain]/extraction");
    expect(html).toContain("Call the practice →");
    expect(html).toContain("Call Riverside Dental Demo");
    expect(html).not.toContain("Dental Implant");
    expect(html).not.toContain("Root Canal");
    expect(html).not.toContain("Wisdom Teeth");
    expect(html).not.toMatch(/<a[^>]*>Tooth Extraction/);
    expect(html).not.toMatch(/<h[1-6][^>]*>Tooth Extraction/);
    expect(html).toContain("<ol");
    expect(html).toContain("View the dental demo");
    expect(html).toContain("Request a demo");
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain("Pricing");
    expect(html).toContain(">Contact<");
    expect(html).toContain("Site menu");
    expect(html).not.toContain("Early access");
    expect(html).not.toContain("earlyAccessLayout");
    expect(html).not.toContain("Design partner");
    expect(html).not.toContain("validate together");
    expect(html).not.toContain("Guide setup");
    expect(html).not.toContain("Clinic branding");
    expect(html).not.toContain("Patient handoff");
    expect(html).not.toContain("early development");
    expect(html).not.toContain("small number of clinics");
    expect(html).not.toContain("#early-access");
    expect(html).not.toContain("See it in practice");
    expect(html).not.toContain("See the patient experience for yourself.");
    expect(html).toContain("Bring your aftercare online.");
    expect(html).toContain("Built for different kinds of care");
    expect(html).toContain(
      "One aftercare platform. Different clinic workflows."
    );
    expect(html).toContain('href="/dental"');
    expect(html).toContain('href="/physiotherapy"');
    expect(html).toContain('href="/chiropractic"');
    expect(html).toContain('href="/cosmetic-clinics"');
    expect(html).toContain('href="/clinics"');
    expect(html).toContain("Explore all clinic types");
    expect(html).toContain('data-vertical="dental"');
    expect(html).toContain('data-vertical="physiotherapy"');
    expect(html).toContain('data-vertical="chiropractic"');
    expect(html).toContain('data-vertical="cosmetic"');
    expect(html).toContain('data-brand-scope="master"');
    expect(html).not.toContain('data-brand-scope="vertical"');
    expect(html).toContain("Physiotherapy clinics");
    expect(html).toContain("Cosmetic &amp; aesthetic clinics");
    expect(html).toContain("closingCta");
    expect(html).toContain('id="see-it"');
    expect(html).not.toContain("Lead capture is not on this page yet.");
    expect(html).not.toContain("provisional commercial name");
    expect(html).not.toContain("Pricing is not locked.");
    expect(html).not.toContain("not a dashboard in this release");
    expect(html).not.toContain("not in this release");
    expect(html).not.toContain("arbitrary CSS");
    expect(html).not.toContain("mobile-first pages patients can reopen");
    expect(html).not.toContain("The first vertical is dental");
    expect(html).not.toContain("Open staff sign in");
    expect(html).not.toContain("Request access");
    expect(html).not.toContain("Contact us");
    expect(html).toContain("Change colour theme");
    expect(html).toContain(
      "Branded patient aftercare for clinics and practices."
    );
    expect(html).not.toContain("See what patients actually receive");
    expect(html).not.toContain("Clinic preview");
    expect(html).not.toContain("Open Riverside Dental Demo");
    expect(html).toContain("View the dental demo");
    expect(html).toContain("Your clinic stays visible after the appointment.");
    expect(html).toContain("carry its own identity");
    expect(html).toContain("Your name");
    expect(html).toContain("Your colours");
    expect(html).toContain("Your terminology");
    expect(html).toContain("The clinic remains recognisable to the patient.");
    expect(html).toContain("clinic&#x27;s visual identity");
    expect(html).toContain(
      "Guidance can use language appropriate to the practice."
    );
    expect(html).toContain("Sample clinic identities");
    expect(html).toContain("data-mk-brand-identity");
    expect(html).toContain("data-mk-brand-copy");
    expect(html).toContain("data-mk-brand-visual");
    expect(html).toContain("data-mk-brand-swatch");
    expect(html).toContain("brandIdentity");
    expect(html).not.toMatch(/>Dental practice</);
    expect(html).not.toMatch(/>Physiotherapy clinic</);
    expect(html).not.toMatch(/>Cosmetic clinic</);
    expect(html).not.toContain("Family dental");
    expect(html).not.toContain("One platform, many clinic identities");
    expect(html).not.toContain("feels recognisably theirs");
    const whyAt = html.indexOf('id="why-heading"');
    const brandAt = html.indexOf('id="brand-heading"');
    const clinicTypesAt = html.indexOf('id="clinic-types-heading"');
    const closingAt = html.indexOf('id="closing-heading"');
    expect(whyAt).toBeGreaterThan(-1);
    expect(whyAt).toBeLessThan(brandAt);
    expect(brandAt).toBeLessThan(clinicTypesAt);
    expect(clinicTypesAt).toBeLessThan(closingAt);
    expect((html.match(/id="brand-heading"/g) ?? []).length).toBe(1);
    expect((html.match(/id="clinic-types-heading"/g) ?? []).length).toBe(1);
    expect(html).toContain('id="clinic-types"');
    expect(html).toContain("data-mk-workflow-showcase");
    expect(html).toContain("workflowShowcase");
    expect(html.indexOf("data-mk-brand-copy")).toBeLessThan(
      html.indexOf("data-mk-brand-identity")
    );
    expect(html).not.toContain("Choose a visual tone that feels at home");
    expect(html).not.toContain("Staff sign in");
    expect((html.match(/>Sign in</g) ?? []).length).toBe(3);
    expect((html.match(/>About</g) ?? []).length).toBeGreaterThanOrEqual(3);
    const footerHtml = html.slice(html.indexOf("<footer"));
    expect(footerHtml).toContain("About");
    expect(footerHtml).toContain("Pricing");
    expect(footerHtml).toContain("Contact");
    expect(footerHtml).toContain("Privacy");
    expect(footerHtml).toContain("Terms");
    expect(footerHtml).not.toContain("How it works");
    expect(footerHtml).not.toContain("Clinic preview");
    expect(html).toContain("footerSeparator");
    expect(html).not.toContain("Book an appointment");
    expect(html).toContain("http://demodental.localhost:3000/");
    expect(html).toContain("http://app.localhost:3000/login");
    expect(html).toContain("Riverside Dental Demo");
    expect(html).toContain("heroTitleBlock");
    expect(html).toContain("heroEyebrow");
    expect(html).toContain("heroTitle");
    expect(html).toContain("heroBody");
    expect(html).toContain("heroActions");
    expect(html).toContain('data-mk-hero-actions=""');
    expect(html).toContain("heroLower");
    expect(html).toContain("heroFrame");
    expect(html).toContain("deviceStage");
    expect(html).toContain("deviceProof");
    expect(html).toContain("deviceNote");
    expect(html).toContain("Patient aftercare view");
    expect(html).toContain("No app to install");
    expect(html).toContain("Practice one tap away");
    expect(html).toContain("phoneShell");
    expect(html).toMatch(/phoneShell[^>]*aria-hidden="true"/);
    expect(html).toContain("phoneScreen");
    expect(html).toContain("phoneFrame");
    expect(html).toContain("/marketing/iphone-frame.webp");
    expect(html).not.toContain("phoneBezel");
    expect(html).not.toContain("phoneIsland");
    expect(html).not.toContain("phoneGlass");
    expect(html).not.toContain("phonePreview");
    expect(html).not.toContain("desktopPreview");
    expect(html).not.toContain("mobilePreview");
    expect(html).not.toContain("Recovery guides");
    expect(html).not.toContain("Recovery guide");
    expect(html).toContain("Recovery overview");
    expect(html).not.toContain("Your recovery");
    expect(html).toContain("Questions about your recovery?");
    expect(html).not.toContain("Need help?");
    expect(html).toContain("Call Riverside Dental Demo");
    expect(html).toContain("numberedSteps");
    expect(html).toContain("numberedStepRule");
    expect(html).toContain("data-mk-numbered-steps");
    expect(html).toContain('data-mk-patient-surface="phone"');
    expect(html).not.toContain('data-mk-patient-surface="home"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain("navRoute");
    expect(html).not.toContain("navAnchor");
    expect(html).toContain("navStaff");
    expect(html).toContain("Tooth Extraction");
    expect(html).toContain("Post-treatment instructions");
    expect(html).toContain("Immediate care");
    expect(html).toContain("Early recovery");
    expect(html).toContain("Healing check");
    expect(html).toContain("First few hours");
    expect(html).toContain("Days 2–3");
    expect(html).toContain("Days 4–7");
    expect(html).toContain("Today");
    expect(html).toContain("Timeline");
    expect(html).toContain("Coming next");
    expect(html).toContain("Swelling often peaks, then eases.");
    expect(html).toContain("Discomfort should continue to settle.");
    expect(html).toContain('data-mk-phone-coming-next=""');
    expect(html).toContain('data-mk-phone-preview=""');
    expect(html).not.toMatch(/deviceProof[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/deviceStage[^>]*aria-hidden="true"/);
    expect(html).toContain('focusable="false"');
    expect(html).toContain("linearGradient");
    expect(html).toContain("feGaussianBlur");
    expect(html).toContain('src="/brand/river-aftercare-logo.svg"');
    expect(html).toContain('src="/brand/river-aftercare-isologo.svg"');
    expect(html).toContain('src="/marketing/iphone-frame.webp"');
    expect(html).toMatch(/fetch[Pp]riority="low"/);
    expect(html.match(/<img\b/g)).toHaveLength(4);
    expect(html).not.toContain("patient PIN");
    expect(html).not.toContain("treatment ID");
    expect(html).not.toContain("date of birth");
    expect(html).not.toContain("Aftercare Rx");
    expect(html).not.toContain("Powered by Care Guide");
    expect(html).not.toContain("Internal staff workspace");
    expect(html).not.toContain("/_marketing");
    expect(html).not.toContain("/_sites");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("<main");
    expect(html).toMatch(/<\/main>[\s\S]*<footer/);
    expect(html).toContain("marketingBase");
    expect(html).toContain("marketingSoft");
    expect(html).toContain("marketingShowcase");
    expect(html).toContain("marketingClosing");
    expect(html).not.toContain("productEquation");
    expect(html).not.toContain("blendToShowcase");
    expect(html).not.toContain("blendToClosing");
    expect(html).not.toContain("surfaceBase");
    expect(html).not.toContain("surfaceSubtle");
    expect(html).not.toContain("surfaceContrast");
    expect(html).not.toContain("surfaceBrand");
    expect(html).not.toContain("chapterRule");
    expect(html).toContain("data-mk-chapter");
    expect(html).toContain("aria-hidden");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
    expect(html).not.toContain("framer-motion");
    expect(html).not.toContain('from "motion');
    expect(html).not.toContain("use client");
  });

  it("places brand flexibility after clinic value and workflows as the last chapter before the CTA", async () => {
    const html = renderToStaticMarkup(await MarketingHomePage());
    const whyAt = html.indexOf('id="why-heading"');
    const brandAt = html.indexOf('id="brand-heading"');
    const clinicTypesAt = html.indexOf('id="clinic-types-heading"');
    const closingAt = html.indexOf('id="closing-heading"');
    const showcaseAt = html.indexOf("data-mk-workflow-showcase");

    expect(whyAt).toBeGreaterThan(-1);
    expect(brandAt).toBeGreaterThan(whyAt);
    expect(clinicTypesAt).toBeGreaterThan(brandAt);
    expect(closingAt).toBeGreaterThan(clinicTypesAt);
    expect(showcaseAt).toBeGreaterThan(brandAt);
    expect(showcaseAt).toBeLessThan(clinicTypesAt);
    expect(html.indexOf('id="preview-heading"')).toBe(-1);
    expect((html.match(/id="brand-heading"/g) ?? []).length).toBe(1);
    expect((html.match(/id="clinic-types-heading"/g) ?? []).length).toBe(1);
    expect(
      (
        html.match(/One aftercare platform\. Different clinic workflows\./g) ??
        []
      ).length
    ).toBe(1);
    expect(html.indexOf("data-mk-brand-copy")).toBeLessThan(
      html.indexOf("data-mk-brand-visual")
    );
    expect(html.indexOf("data-mk-brand-visual")).toBeLessThan(
      html.indexOf("data-mk-brand-identity")
    );
    expect(html).toContain('href="/clinics"');
    expect(html).toContain("Explore all clinic types");
  });
});
