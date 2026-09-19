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

import MarketingHomePage from "@/app/(marketing)/%5Fmarketing/page";
import MarketingPricingPage from "@/app/(marketing)/%5Fmarketing/pricing/page";
import MarketingPrivacyPage from "@/app/(marketing)/%5Fmarketing/privacy/page";
import MarketingTermsPage from "@/app/(marketing)/%5Fmarketing/terms/page";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { MARKETING_DEMO_PATIENT_THEME_CSS } from "@/lib/marketing/demo-patient-preview";
import {
  marketingPageMetadata,
  PRIVACY_METADATA,
  TERMS_METADATA,
} from "@/lib/marketing/metadata";
import { marketingSiteOrigin } from "@/lib/marketing/site";
import { DRAFT_LEGAL_ROBOTS } from "@/lib/seo/robots-policy";

const marketingCss = readFileSync(
  "app/(marketing)/marketing.module.css",
  "utf8"
);
const numberedSteps = readFileSync(
  "app/(marketing)/components/marketing-numbered-steps.tsx",
  "utf8"
);
const contactForm = readFileSync(
  "app/(marketing)/components/contact-form.tsx",
  "utf8"
);
const loginPage = readFileSync("app/(staff)/login/page.tsx", "utf8");
const authShell = readFileSync(
  "app/(staff)/components/staff-auth-shell.tsx",
  "utf8"
);
const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
const shell = readFileSync(
  "app/(marketing)/components/marketing-shell.tsx",
  "utf8"
);

describe("marketing + trust polish", () => {
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

  it("uses one numbered-row contract for problem and onboarding lists", async () => {
    expect(numberedSteps).toContain("data-mk-numbered-steps");
    expect(numberedSteps).toContain("numberedStepIndex");
    expect(numberedSteps).toContain("numberedStepRule");
    expect(numberedSteps).toContain('aria-hidden="true"');
    expect(marketingCss).toContain(
      "grid-template-columns: 2.25rem 1px minmax(0, 1fr)"
    );
    expect(marketingCss).toContain(
      "padding-top: calc((1.08rem * 1.55 - 0.8rem * 1.55) / 2)"
    );
    expect(marketingCss).not.toContain(".frictionList");
    expect(marketingCss).not.toContain(".storyList");

    const home = renderToStaticMarkup(await MarketingHomePage());
    const pricing = renderToStaticMarkup(await MarketingPricingPage());
    expect(home).toContain("data-mk-numbered-steps");
    expect(home.match(/data-mk-numbered-steps/g)).toHaveLength(1);
    expect(pricing).toContain("data-mk-numbered-steps");
    expect(pricing).toContain(
      "Choose or prepare the guidance your clinic needs"
    );
    expect(pricing).toContain("template library is still expanding");
    expect(pricing).not.toContain("Additional dental templates are planned");
    expect(pricing).not.toContain("Wisdom Teeth");
    expect(pricing).not.toContain("Dental Implant");
  });

  it("follows marketing Light/Dark for patient mockups via shared aftercare tokens", async () => {
    expect(MARKETING_DEMO_PATIENT_THEME_CSS).toContain(
      '[data-patient-theme="portal"]'
    );
    expect(MARKETING_DEMO_PATIENT_THEME_CSS).toContain(
      'html[data-theme-mode="dark"]'
    );
    expect(MARKETING_DEMO_PATIENT_THEME_CSS).toContain("#0f766e");
    expect(MARKETING_DEMO_PATIENT_THEME_CSS).not.toContain("#3b4bd1");

    const home = renderToStaticMarkup(await MarketingHomePage());
    expect(home).toContain('data-patient-theme="portal"');
    expect(home).toContain('data-mk-patient-surface="phone"');
    expect(home).not.toContain('data-mk-patient-surface="home"');
    expect(home).toContain("Recovery overview");
    expect(home).toContain("Post-treatment instructions");
    expect(home).toContain("Call Riverside Dental Demo");
    expect(home).not.toContain("Your recovery");
    expect(home).not.toContain("Need help?");
    expect(home).not.toContain("Call Riverside Dental →");
    expect(home).toContain(PRODUCT_NAME);
    expect(home).not.toContain("Aftercare Rx");
    expect(home).not.toContain("tailwind");
  });

  it("keeps the hero patient proof on current tenant-home terminology", async () => {
    const home = renderToStaticMarkup(await MarketingHomePage());
    expect(home).toContain('data-mk-patient-surface="phone"');
    expect(home).toContain("Riverside Dental Demo");
    expect(home).toContain("Post-treatment instructions");
    expect(home).toContain("Tooth Extraction");
    expect(home).toContain("Today");
    expect(home).toContain("Timeline");
    expect(home).toContain("Call Riverside Dental Demo");
    expect(home).not.toContain("data-mk-patient-preview");
    expect(home).not.toContain("See what patients actually receive");
    expect(home).not.toContain("View post-treatment instructions");
    expect(home).not.toContain("POST-TREATMENT INSTRUCTIONS");
  });

  it("reuses the canonical marketing primary button for contact submit", () => {
    expect(contactForm).toContain("MarketingPrimaryButton");
    expect(contactForm).toContain('type="submit"');
    expect(contactForm).not.toContain("contactSubmit");
    expect(contactForm).toContain("contactActions");
    expect(contactForm).toContain("contactFormPanel");
    expect(marketingCss).not.toContain(".contactSubmit");
    expect(marketingCss).toContain("appearance: none");
    expect(marketingCss).toContain("border: 0 solid transparent");
    expect(marketingCss).toContain("font: inherit");
  });

  it("adds a root-domain back link on staff login", () => {
    expect(authShell).toContain("staffBackLink");
    expect(authShell).toContain("Back to ${PRODUCT_NAME}");
    expect(authShell).toContain("marketingPublicLinks");
    expect(authShell).toContain("homeHref");
    expect(loginPage).toContain("StaffAuthShell");
    expect(loginPage).not.toContain("river-aftercare.com");
    expect(staffCss).toContain(".staffBackLink");
    expect(staffCss).toContain("var(--staff-muted)");
  });

  it("publishes privacy and terms drafts with noindex metadata", async () => {
    const privacyHtml = renderToStaticMarkup(await MarketingPrivacyPage());
    const termsHtml = renderToStaticMarkup(await MarketingTermsPage());

    expect(privacyHtml).toContain("Privacy Policy");
    expect(privacyHtml).toContain("DRAFT FOR LEGAL REVIEW");
    expect(privacyHtml).toContain("[FULL LEGAL NAME]");
    expect(privacyHtml).toContain("[PRIVACY EMAIL]");
    expect(privacyHtml).toContain("ABN 32 671 297 130");
    expect(privacyHtml).not.toContain("HIPAA compliant");
    expect(privacyHtml).not.toContain("We store all information with Neon");
    expect(privacyHtml).toContain('data-mk-page-hero="legal"');
    expect(privacyHtml).toContain("<time");
    expect(privacyHtml).toContain('dateTime="2026-09-17"');

    expect(termsHtml).toContain("Terms &amp; Conditions");
    expect(termsHtml).toContain("not a healthcare provider");
    expect(termsHtml).toContain("New South Wales, Australia");
    expect(termsHtml).toContain("non-exclusive jurisdiction");
    expect(termsHtml).toContain("[FULL LEGAL NAME]");
    expect(termsHtml).toContain('data-mk-page-hero="legal"');
    expect(privacyHtml).toContain("legalArticle");
    expect(privacyHtml).toContain("band");
    expect(termsHtml).toContain("legalArticle");
    expect(termsHtml).toContain("band");
    expect(marketingCss).toContain(".marketingSoft > .band:first-child");
    expect(marketingCss).not.toMatch(/\.legalArticle\s*\{[^}]*padding-top:/);
    expect(marketingCss).not.toMatch(/\.legalArticle\s*\{[^}]*padding-bottom:/);
    expect(marketingCss).toContain("max-width: 42rem");

    const privacyMeta = marketingPageMetadata(PRIVACY_METADATA, {
      pathname: "/privacy",
    });
    const termsMeta = marketingPageMetadata(TERMS_METADATA, {
      pathname: "/terms",
    });
    expect(privacyMeta.robots).toEqual(DRAFT_LEGAL_ROBOTS);
    expect(termsMeta.robots).toEqual(DRAFT_LEGAL_ROBOTS);
    expect(privacyMeta.alternates?.canonical).toBe(
      `${marketingSiteOrigin()}/privacy`
    );
    expect(termsMeta.alternates?.canonical).toBe(
      `${marketingSiteOrigin()}/terms`
    );
  });

  it("keeps a lean footer without homepage-anchor legacy links", () => {
    expect(shell).toContain('{ href: "/about", label: "About" }');
    expect(shell).toContain('{ href: "/privacy", label: "Privacy" }');
    expect(shell).toContain('{ href: "/terms", label: "Terms" }');
    expect(shell).toContain('label: "For clinics"');
    expect(shell).toContain("clinicDirectoryNavItems");
    expect(shell).not.toContain("Services");
    expect((shell.match(/href: "\/privacy"/g) ?? []).length).toBe(1);
    expect((shell.match(/href: "\/terms"/g) ?? []).length).toBe(1);
    expect(shell).not.toContain("How it works");
    expect(shell).not.toContain("Clinic preview");
    expect(shell).not.toContain("homepageAnchor");
    expect(shell).toContain('SIGN_IN_LABEL = "Sign in"');
    expect(shell).not.toContain("Staff sign in");
    expect(shell).not.toContain("footer-account");
    expect(shell).not.toContain('label: "Account"');
  });
});
