import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function hexLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  const value =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw.slice(0, 6);
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("aftercare style boundary", () => {
  it("keeps Tailwind in the staff stylesheet only", () => {
    const staffCss = read("app/(staff)/staff.css");
    const aftercareCss = read("app/(aftercare)/aftercare.css");

    expect(staffCss).toContain('@import "tailwindcss"');
    expect(aftercareCss).not.toContain("tailwindcss");
    expect(aftercareCss).not.toContain("@theme");

    const marketingCss = read("app/(marketing)/marketing.css");
    expect(marketingCss).not.toContain("tailwindcss");
    expect(marketingCss).not.toContain("@theme");
  });

  it("loads Tailwind from the staff root layout", () => {
    const layout = read("app/(staff)/layout.tsx");

    expect(layout).toContain("./staff.css");
    expect(layout).not.toContain("aftercare.css");
  });

  it("does not import Tailwind from the aftercare root layout", () => {
    const layout = read("app/(aftercare)/layout.tsx");

    expect(layout).toContain("./aftercare.css");
    expect(layout).not.toContain("staff.css");
    expect(layout).not.toContain("tailwind");
    expect(layout).not.toContain("next/font");
    expect(layout).not.toMatch(/['"]use client['"]/);
  });

  it("does not import Tailwind from the marketing root layout", () => {
    const layout = read("app/(marketing)/layout.tsx");

    expect(layout).toContain("./marketing.css");
    expect(layout).not.toContain("staff.css");
    expect(layout).not.toContain("aftercare.css");
    expect(layout).not.toContain("tailwind");
    expect(layout).not.toMatch(/['"]use client['"]/);
  });

  it("applies semantic CSS variables in the tenant layout on the server", () => {
    const layout = read("app/(aftercare)/%5Fsites/[tenant]/layout.tsx");

    expect(layout).not.toMatch(/['"]use client['"]/);
    expect(layout).toContain("resolveAftercareTheme");
    expect(layout).toContain("serializeAftercareThemeCss");
    expect(layout).not.toContain("ThemeProvider");
    expect(layout).not.toContain("localStorage");
    expect(layout).not.toContain("useContext");
  });

  it("styles patient components with CSS Modules and semantic tokens", () => {
    const styles = read("app/(aftercare)/patient.module.css");
    const header = read("app/(aftercare)/components/practice-header.tsx");

    expect(header).not.toMatch(/['"]use client['"]/);
    expect(header).toContain("patient.module.css");
    expect(header).not.toContain('className="');
    expect(styles).toContain("var(--cg-brand)");
    expect(styles).toContain("var(--cg-on-brand)");
    expect(styles).toContain("var(--cg-warning)");
    expect(styles).toContain("var(--cg-emergency)");
    expect(styles).toContain("var(--cg-radius)");
    expect(styles).toContain("var(--cg-recovery-surface)");
    expect(styles).toContain("var(--cg-notice-surface)");
    expect(styles).toContain("var(--cg-notice-border)");
    expect(styles).toContain("var(--cg-notice-muted)");
    expect(styles).not.toContain("tailwind");
    expect(styles).not.toContain("--tw-");
    expect(styles).toMatch(/\.guideLink\s*\{[^}]*box-shadow/);
    expect(styles).not.toContain("translateY(-2px)");
    expect(styles).not.toContain("translateX(4px)");
    expect(styles).not.toContain("translateX(2px)");
    expect(styles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(styles).toContain('.demoTab:not([aria-selected="true"]):hover');
    expect(styles).toContain(".demoTab:focus-visible");
    expect(styles).not.toMatch(/\.timelineItem\s*\{[^}]*box-shadow/);
    expect(styles).not.toMatch(/\.timelineItem\s*\{[^}]*border-radius/);
    expect(styles).not.toContain(".checkIn");
    expect(styles).toMatch(/\.footer\s*\{[^}]*text-align:\s*center/);
    expect(styles).toMatch(/\.attribution\s*\{[^}]*text-align:\s*center/);
    expect(styles).toContain("timelineSeparator");
    expect(styles).toContain("timelineRail");
  });

  it("reduces marketing to four chapter surfaces", () => {
    const page = read("app/(marketing)/%5Fmarketing/page.tsx");
    const styles = read("app/(marketing)/marketing.module.css");

    expect(page).toContain("marketingBase");
    expect(page).toContain("marketingSoft");
    expect(page).toContain("marketingShowcase");
    expect(page).toContain("marketingClosing");
    expect(page).not.toContain("surfaceBase");
    expect(page).not.toContain("surfaceSubtle");
    expect(page).not.toContain("surfaceContrast");
    expect(page).not.toContain("surfaceBrand");
    expect(styles).toContain(".marketingBase");
    expect(styles).toContain(".marketingSoft");
    expect(styles).toContain(".marketingShowcase");
    expect(styles).toContain(".marketingClosing");
    expect(styles).not.toContain(".surfaceBase");
    expect(styles).not.toContain(".surfaceSubtle");
    expect(styles).not.toContain(".surfaceContrast");
    expect(styles).not.toContain(".surfaceBrand");
  });

  it("gives the light marketing hero a warm-white foundation and a 42/58 product row", () => {
    const tokens = read("app/(marketing)/marketing.css");
    const styles = read("app/(marketing)/marketing.module.css");
    const wave = read("app/(marketing)/components/marketing-wave.tsx");
    const pageEdge = read(
      "app/(marketing)/components/marketing-page-hero-edge.tsx"
    );
    const preview = read(
      "app/(marketing)/components/marketing-product-preview.tsx"
    );

    const hero = tokens.match(
      /--mk-hero:\s*light-dark\((#[0-9a-fA-F]{3,8}),\s*(#[0-9a-fA-F]{3,8})\)/
    );
    const closing = tokens.match(
      /--mk-closing:\s*light-dark\((#[0-9a-fA-F]{3,8}),\s*(#[0-9a-fA-F]{3,8})\)/
    );
    expect(closing).not.toBeNull();
    expect(hexLuminance(closing![1])).toBeGreaterThan(0.7);
    expect(hexLuminance(closing![2])).toBeLessThan(0.12);
    expect(styles).not.toMatch(
      /\.marketingClosing[^{]*\{[^}]*--mk-ink:\s*var\(--mk-on-dark\)/
    );

    expect(styles).not.toMatch(
      /\.marketingBase[^{]*\{[^}]*color:\s*var\(--mk-on-dark\)/
    );
    expect(styles).toContain("heroTitleBlock");
    expect(styles).toMatch(/\.heroTitleBlock\s*\{[^}]*text-align:\s*center/);
    expect(styles).not.toMatch(/\.pageTitle\s*\{[^}]*text-align:\s*center/);
    expect(styles).not.toMatch(/\.sectionTitle\s*\{[^}]*text-align:\s*center/);
    expect(styles).toContain("0.42fr 0.58fr");
    expect(styles).not.toContain("100vh");
    expect(styles).toContain("100svh");
    expect(tokens).toContain("--mk-interact-duration");
    expect(tokens).toContain("--mk-section-pad-top");
    expect(styles).toContain("padding-top: var(--mk-section-pad-top)");
    expect(tokens).toContain("--mk-chapter-pad-y");
    expect(tokens).toContain("--mk-chapter-pad-y-mobile");
    expect(tokens).toContain("--mk-card");
    expect(tokens).toContain("clamp(8rem, 6vw, 6rem)");
    expect(tokens).toContain("clamp(6rem, 8vw, 8rem)");
    expect(tokens).toContain("clamp(4rem, 8vw, 8rem)");
    expect(styles).toContain("padding-top: var(--mk-chapter-pad-y-mobile)");
    expect(styles).not.toContain("3.6rem");
    expect(styles).not.toContain("3.25rem");
    expect(styles).toContain("a.navRoute");
    expect(tokens).toContain("--mk-inline-link-underline-offset: -0.125rem");
    expect(tokens).toContain("--mk-nav-underline-offset: 0.5rem");
    expect(tokens).toContain("--mk-footer-link-underline-offset: 0");
    expect(styles).toContain("bottom: var(--mk-inline-link-underline-offset)");
    expect(styles).toContain("bottom: var(--mk-nav-underline-offset)");
    expect(styles).toContain(".footerNav a.textLink::after");
    expect(styles).toContain("bottom: var(--mk-footer-link-underline-offset)");
    expect(styles).not.toContain("bottom: 0.12em");
    expect(tokens).toContain("--mk-heading-content-gap");
    expect(tokens).toContain("--mk-intro-content-gap");
    expect(tokens).toContain("--mk-eyebrow-heading-gap");
    expect(tokens).toContain("--mk-heading-intro-gap");
    expect(tokens).toContain("--mk-body-gap");
    expect(tokens).toContain("--mk-header-height");
    expect(tokens).toContain("--mk-nav-duration");
    expect(styles).toContain("phoneStageCurrent");
    expect(styles).toContain("phoneHelp");
    expect(styles).toContain("var(--cg-surface");
    expect(styles).not.toMatch(
      /\.phoneScreen[^{]*\{[^}]*color-scheme:\s*light/
    );
    expect(tokens).toContain("--mk-hero-glow");
    expect(tokens).toContain("--mk-hero-bloom");
    expect(tokens).toContain("--mk-hero-mist");
    expect(tokens).toContain("--mk-sky");
    expect(tokens).toContain("--mk-sky-text");
    expect(tokens).toContain("--mk-sky-glow");
    expect(tokens).toContain("--mk-cobalt");
    expect(tokens).toContain("--mk-teal");
    expect(tokens).toContain("--river-blue");
    expect(tokens).not.toContain("--mk-lavender");
    expect(tokens).toContain("--vertical-hero-canvas");
    expect(tokens).toContain("--vertical-hero-bloom");
    expect(tokens).toContain("--vertical-surface-soft");
    expect(tokens).toContain("--vertical-card-tint");
    expect(tokens).toContain("--vertical-closing-bloom");
    expect(tokens).toContain("--mk-brand-hover");
    expect(tokens).toContain("--mk-closing-glow");
    expect(tokens).toContain("--mk-closing-cobalt");
    expect(tokens).toContain("--mk-secondary-fill");
    expect(tokens).toContain("--mk-secondary-fill-active");
    expect(styles).toContain("phoneFrame");
    expect(styles).toContain(".secondary:hover");
    expect(styles).toContain("closingCta");
    expect(styles).toContain("footerSeparator");
    expect(styles).toContain("at 82% 100%");
    expect(styles).toContain("at 82% 0%");
    expect(styles).not.toMatch(
      /\.marketingClosing\[data-mk-chapter="closing"\]::after[\s\S]*?at 50% 100%/
    );
    expect(styles).not.toContain("filter: blur(");
    expect(styles).not.toContain("backdrop-filter");
    expect(styles).not.toContain(".phoneBezel");
    expect(styles).not.toContain(".phoneIsland");
    expect(styles).not.toContain(".phoneGlass");
    expect(tokens).toContain("--mk-hero-bottom-gap");
    expect(tokens).toContain("--mk-footer-pad-top");
    expect(tokens).toContain("--mk-footer-pad-bottom");
    expect(styles).toContain("var(--mk-hero-bottom-gap)");
    expect(styles).toContain("var(--mk-footer-pad-top)");
    expect(tokens).toContain("--interaction-duration");
    expect(styles).not.toContain("translateY(-1.5px)");
    expect(styles).not.toMatch(/\.primary:hover[^{]*\{[^}]*transform/);
    expect(styles).not.toMatch(/\.primary:active[^{]*\{[^}]*transform/);
    expect(styles).not.toContain(".secondary::before");
    expect(styles).not.toMatch(/\.secondary:hover\s*\{[^}]*transform/);
    expect(styles).not.toMatch(/\.secondary:active\s*\{[^}]*transform/);
    expect(styles).not.toMatch(/\.secondary:hover\s*\{[^}]*translate/);
    expect(styles).not.toMatch(/\.secondary:active\s*\{[^}]*translate/);
    expect(styles).toContain("scaleX(0)");
    expect(styles).toContain("transform-origin: center");
    expect(styles).toContain(".textLink");
    expect(styles).not.toContain("blendToShowcase");
    expect(styles).not.toContain("--mk-chapter-bg");
    expect(styles).toContain(":focus-visible");
    expect(styles).not.toContain("perspective");
    expect(styles).not.toContain("rotateY");
    expect(styles).not.toContain(".desktopPreview");
    expect(styles).not.toContain(".mobilePreview");
    expect(wave).toContain('aria-hidden="true"');
    expect(wave).toContain('focusable="false"');
    expect(wave).toContain("linearGradient");
    expect(wave).toContain("feGaussianBlur");
    expect(pageEdge).toContain("INNER_PAGE_FILL");
    expect(pageEdge).toContain("INNER_PAGE_EDGE");
    expect(pageEdge).toContain("mkPageWaveInnerPage");
    expect(pageEdge).not.toContain("CONTACT_FILL");
    expect(pageEdge).not.toContain("PRICING_FILL");
    expect(pageEdge).not.toContain("mkPageWaveContact");
    expect(pageEdge).not.toContain("mkPageWavePricing");
    expect(styles).toContain("processJourney");
    expect(styles).toContain("processRail");
    expect(styles).toContain("processVisual");
    expect(styles).toContain("pillarGrid");
    expect(styles).toContain("pillarCard");
    expect(styles).not.toContain("frictionList");
    expect(styles).not.toContain("storyList");
    expect(styles).toContain("numberedSteps");
    expect(styles).toContain("numberedStepRule");
    expect(styles).toContain("productCanvas");
    expect(styles).toContain("productVisual");
    expect(styles).toContain("grid-template-areas");
    expect(styles).toContain("processConnector");
    expect(styles).toContain("patientHomePreview");
    expect(styles).toContain("background: currentColor");
    expect(styles).not.toContain("productEquation");
    expect(styles).not.toContain("bentoGrid");
    expect(styles).not.toContain("bentoCard");
    expect(preview).not.toMatch(/['"]use client['"]/);
    expect(preview).toContain('aria-hidden="true"');
    expect(preview).toContain("PhoneShell");
    expect(preview).toContain("PhoneScreen");
    expect(preview).toContain("ProductPreviewScreen");
    expect(preview).toContain("phoneShell");
    expect(preview).toContain("phoneFrame");
    expect(preview).toContain("/marketing/iphone-frame.webp");
    expect(preview).toContain("cationBlue.png");
    expect(preview).toContain("PHONE_VIEW_NAME");
    expect(preview).toContain("mk-phone-today");
    expect(preview).toContain("MARKETING_DEMO_COMING_NEXT_LABEL");
    expect(preview).toContain("data-mk-phone-coming-next");
    expect(preview).not.toContain("phoneBezel");
    expect(preview).not.toContain("phoneIsland");
    expect(preview).not.toContain("phoneGlass");
    expect(preview).not.toContain("phonePreview");
    expect(preview).not.toContain("<video");
    expect(preview).not.toContain("ProductDemoVideo");
    expect(preview).not.toContain("desktopPreview");
    expect(preview).not.toContain("Dental Implant");
    expect(preview).not.toContain("Root Canal");
    expect(preview).toContain("<img");
    expect(preview).toContain('fetchPriority="low"');
    expect(preview).not.toContain("<button");
    expect(preview).not.toContain("<a ");
    expect(preview).toContain('type="radio"');
    expect(preview).toContain("MARKETING_DEMO_RECOVERY_HEADING");
    expect(preview).not.toContain("Your recovery");
    expect(preview).toContain("Questions about your recovery?");
    expect(preview).toContain("MARKETING_DEMO_CALL_LABEL");
    expect(preview).toContain("data-patient-theme");
    expect(preview).not.toContain("Book an appointment");
    const fixtures = read("lib/marketing/demo-patient-preview.ts");
    expect(fixtures).toContain(
      'MARKETING_DEMO_RECOVERY_HEADING = "Recovery overview"'
    );
    expect(fixtures).toContain("Call ${MARKETING_DEMO_CLINIC_NAME}");
  });

  it("keeps patient Client Components isolated to theme control and marketing Motion to marketing", () => {
    const allowedPatientClient = new Set([
      "app/(aftercare)/components/patient-theme-control.tsx",
      "app/(aftercare)/components/patient-demo-experience.tsx",
      "app/(aftercare)/components/print-trigger.tsx",
    ]);
    const allowedMarketingClient = new Set([
      "app/(marketing)/components/marketing-theme-control.tsx",
      "app/(marketing)/components/marketing-experience.tsx",
      "app/(marketing)/components/marketing-reveal.tsx",
      "app/(marketing)/components/marketing-motion-features.ts",
      "app/(marketing)/components/marketing-process.tsx",
      "app/(marketing)/components/marketing-pillars.tsx",
      "app/(marketing)/components/marketing-product-assembly.tsx",
      "app/(marketing)/components/marketing-nav-menu.tsx",
      "app/(marketing)/components/marketing-clinics-nav.tsx",
      "app/(marketing)/components/marketing-nav-theme.tsx",
      "app/(marketing)/components/contact-form.tsx",
      "app/(marketing)/components/contact-turnstile.tsx",
    ]);
    const files = walk("app/(aftercare)").filter((path) =>
      /\.(ts|tsx|css)$/.test(path)
    );

    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      const source = read(file);
      if (!allowedPatientClient.has(file)) {
        expect(source, file).not.toMatch(/['"]use client['"]/);
      }
      expect(source, file).not.toContain("tailwindcss");
      expect(source, file).not.toContain("styled-components");
      expect(source, file).not.toContain("@emotion");
      expect(source, file).not.toMatch(/from ["']motion(\/|$)/);
      expect(source, file).not.toContain("framer-motion");
      expect(source, file).not.toContain('from "@/app/(staff)');
      expect(source, file).not.toContain("./staff.css");
      expect(source, file).not.toContain("submitMarketingContactAction");
      expect(source, file).not.toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
      expect(source, file).not.toContain("TURNSTILE_SECRET_KEY");
    }

    const marketingFiles = walk("app/(marketing)").filter((path) =>
      /\.(ts|tsx|css)$/.test(path)
    );
    expect(marketingFiles.length).toBeGreaterThan(2);
    for (const file of marketingFiles) {
      const source = read(file);
      if (!allowedMarketingClient.has(file)) {
        expect(source, file).not.toMatch(/['"]use client['"]/);
      }
      expect(source, file).not.toContain("tailwindcss");
      expect(source, file).not.toContain("styled-components");
      expect(source, file).not.toContain("@emotion");
      expect(source, file).not.toContain("framer-motion");
    }

    expect(
      read("app/(aftercare)/components/patient-theme-control.tsx")
    ).toMatch(/['"]use client['"]/);
    expect(
      read("app/(aftercare)/components/patient-demo-experience.tsx")
    ).toMatch(/['"]use client['"]/);
    expect(read("app/(aftercare)/components/print-trigger.tsx")).toMatch(
      /['"]use client['"]/
    );
    expect(
      read("app/(marketing)/components/marketing-theme-control.tsx")
    ).toMatch(/['"]use client['"]/);
    expect(read("app/(marketing)/components/marketing-experience.tsx")).toMatch(
      /['"]use client['"]/
    );
    expect(read("app/(marketing)/components/marketing-reveal.tsx")).toMatch(
      /['"]use client['"]/
    );
    expect(read("app/(marketing)/components/marketing-reveal.tsx")).toContain(
      "useInView"
    );
    expect(read("app/(marketing)/components/marketing-reveal.tsx")).toContain(
      "once: true"
    );
    expect(read("app/(marketing)/components/marketing-reveal.tsx")).toContain(
      "MARKETING_REVEAL_VIEWPORT"
    );
    expect(read("app/(marketing)/components/marketing-reveal.tsx")).toContain(
      "MarketingRevealCard"
    );
    expect(
      read("app/(marketing)/components/marketing-experience.tsx")
    ).not.toContain("IntersectionObserver");
    expect(
      read("app/(marketing)/components/marketing-experience.tsx")
    ).not.toContain("IntersectionObserver");
    expect(
      read("app/(marketing)/components/marketing-experience.tsx")
    ).not.toContain("data-chapter");
    expect(read("app/(aftercare)/components/guide-list.tsx")).not.toMatch(
      /['"]use client['"]/
    );
    expect(read("app/(marketing)/%5Fmarketing/page.tsx")).toContain(
      "MarketingRevealHero"
    );
    expect(read("app/(marketing)/%5Fmarketing/page.tsx")).not.toMatch(
      /import \{[^}]*\bMarketingReveal\b[^}]*\} from/
    );
    expect(read("app/(marketing)/%5Fmarketing/contact/page.tsx")).not.toMatch(
      /['"]use client['"]/
    );
    expect(read("app/(marketing)/components/contact-form.tsx")).toMatch(
      /['"]use client['"]/
    );
    expect(read("app/(marketing)/components/contact-form.tsx")).toContain(
      "contact-fields"
    );
    expect(read("app/(marketing)/components/contact-form.tsx")).not.toContain(
      "contact-enquiry"
    );
    expect(read("app/(marketing)/components/contact-form.tsx")).not.toContain(
      'from "zod"'
    );
    expect(read("app/(marketing)/components/contact-turnstile.tsx")).toMatch(
      /['"]use client['"]/
    );
    expect(
      read("app/(marketing)/components/contact-turnstile.tsx")
    ).not.toContain("TURNSTILE_SECRET_KEY");
    expect(
      read("app/(marketing)/components/contact-turnstile.tsx")
    ).not.toContain("RESEND_API_KEY");
    expect(read("app/(marketing)/components/contact-form.tsx")).not.toContain(
      "TURNSTILE_SECRET_KEY"
    );
    expect(read("app/(marketing)/components/contact-form.tsx")).not.toContain(
      "RESEND_API_KEY"
    );
  });
});
