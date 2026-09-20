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

import MarketingDentalPage from "@/app/(marketing)/%5Fmarketing/dental/page";
import MarketingPhysiotherapyPage from "@/app/(marketing)/%5Fmarketing/physiotherapy/page";
import MarketingChiropracticPage from "@/app/(marketing)/%5Fmarketing/chiropractic/page";
import MarketingCosmeticClinicsPage from "@/app/(marketing)/%5Fmarketing/cosmetic-clinics/page";
import { MARKETING_PAGE_LABELS } from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";
import { MARKETING_SEO_PAGE_KEYS } from "@/lib/seo/page-keys";
import {
  VERTICAL_ACCENT_FAMILY,
  VERTICAL_LANDINGS,
} from "@/lib/marketing/vertical-landing";

describe("clinic vertical landing pages", () => {
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

  it("renders distinct profession-specific copy and truthful product boundaries", async () => {
    const dental = renderToStaticMarkup(await MarketingDentalPage());
    const physio = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const chiro = renderToStaticMarkup(await MarketingChiropracticPage());
    const cosmetic = renderToStaticMarkup(await MarketingCosmeticClinicsPage());

    expect(dental.match(/<h1\b/g)).toHaveLength(1);
    expect(physio.match(/<h1\b/g)).toHaveLength(1);
    expect(chiro.match(/<h1\b/g)).toHaveLength(1);
    expect(cosmetic.match(/<h1\b/g)).toHaveLength(1);

    expect(dental).toContain(
      "Make post-treatment instructions part of your dental experience."
    );
    expect(physio).toContain(
      "Keep recovery guidance clear between appointments."
    );
    expect(chiro).toContain(
      "Give patients clearer guidance between chiropractic visits."
    );
    expect(cosmetic).toContain(
      "Make post-treatment aftercare feel as considered as the treatment."
    );

    expect(dental).not.toContain(VERTICAL_LANDINGS["/physiotherapy"].hero.h1);
    expect(physio).not.toContain(VERTICAL_LANDINGS["/dental"].hero.h1);
    expect(chiro).not.toContain("leave the chair");
    expect(cosmetic).not.toContain("leave the chair");
    expect(physio).not.toContain("leave the chair");

    expect(dental).toContain("Riverside Dental Demo");
    expect(dental).toContain("View the dental demo");
    expect(dental).toContain("heroActions");
    expect(dental).toContain('data-mk-hero-actions=""');
    expect(physio).toContain('data-mk-hero-actions=""');
    expect(dental).toContain("Tooth Extraction");
    expect(dental).toContain("http://demodental.localhost:3000/");
    expect(physio).not.toContain("Riverside Dental Demo");
    expect(chiro).not.toContain("Riverside Dental Demo");
    expect(cosmetic).not.toContain("Riverside Dental Demo");
    expect(physio).not.toContain("View the dental demo");

    expect(physio).toContain("not for tracking whether a patient completes");
    expect(physio).toContain("home exercise programme app");
    expect(physio).toContain(
      "Physiotherapy template availability is confirmed during onboarding. Where no suitable River Aftercare template exists, the clinic can publish its own approved guidance."
    );
    expect(physio).not.toContain("adherence monitoring");
    expect(physio).not.toContain("video exercise");
    expect(chiro).toContain("does not replace your clinical record");
    expect(chiro).toContain("publishing technology");
    expect(chiro).toContain(
      "These are examples of guidance a practice may choose to publish, not a pre-built chiropractic template library. Clinical content remains clinic-approved."
    );
    expect(chiro).not.toContain("spinal alignment");
    expect(chiro).not.toContain("clinical outcomes");
    expect(cosmetic).toContain("does not provide live clinical monitoring");
    expect(cosmetic).not.toContain("reduced complications");
    expect(cosmetic).not.toContain("injectables");
    expect(cosmetic).not.toContain("fillers");

    expect(dental).toContain('href="/pricing"');
    expect(dental).toContain('href="/contact"');
    expect(dental).toContain('href="/about"');
    expect(physio).toContain('href="#workflow"');
    expect(dental).toContain("<main");
    expect(dental).toContain('data-vertical="dental"');
    expect(physio).toContain('data-vertical="physiotherapy"');
    expect(chiro).toContain('data-vertical="chiropractic"');
    expect(cosmetic).toContain('data-vertical="cosmetic"');
    expect(dental).toContain('data-brand-scope="vertical"');
    expect(physio).toContain('data-brand-scope="vertical"');
    expect(chiro).not.toContain('data-brand-scope="master"');
    expect(dental).toContain("data-mk-vertical-hero");
    expect(dental).toContain("Current starting template");
    const templateAt = dental.indexOf("Current starting template");
    expect(templateAt).toBeGreaterThan(-1);
    expect(dental.slice(Math.max(0, templateAt - 280), templateAt)).toContain(
      "mkReveal"
    );
    const dentalNoteAt = dental.indexOf(
      "Riverside Dental Demo currently uses a Tooth Extraction sample template."
    );
    expect(dentalNoteAt).toBeGreaterThan(templateAt);
    expect(
      dental.slice(Math.max(0, dentalNoteAt - 280), dentalNoteAt)
    ).toContain("mkReveal");
    const physioNoteAt = physio.indexOf(
      "Physiotherapy template availability is confirmed during onboarding."
    );
    expect(physioNoteAt).toBeGreaterThan(-1);
    expect(
      physio.slice(Math.max(0, physioNoteAt - 280), physioNoteAt)
    ).toContain("mkReveal");
    expect(dental).toContain("Live example");
    expect(dental).toContain("View pricing");
    expect(dental).not.toContain("About River Aftercare");
    expect(dental).not.toContain("footer-account");
    expect(dental).toContain("Common questions");
    expect(physio).toContain("How it fits");
    expect(chiro).toContain("A publishing layer for patient guidance");
    expect(cosmetic).toContain("Keep the experience recognisably yours");
    expect(dental).not.toContain("/_marketing");
    expect(JSON.stringify(VERTICAL_LANDINGS)).not.toContain("Riverside Physio");
    expect(JSON.stringify(VERTICAL_LANDINGS)).not.toContain(
      "Current reviewed starting template"
    );

    for (const [html, landing] of [
      [dental, VERTICAL_LANDINGS["/dental"]],
      [physio, VERTICAL_LANDINGS["/physiotherapy"]],
      [chiro, VERTICAL_LANDINGS["/chiropractic"]],
      [cosmetic, VERTICAL_LANDINGS["/cosmetic-clinics"]],
    ] as const) {
      expect(html).toContain(landing.faq.h2);
      expect(html.match(/<details\b/g)).toHaveLength(5);
      for (const item of landing.faq.items) {
        expect(html).toContain(item.question);
        expect(html).toContain(item.answer.replaceAll("'", "&#x27;"));
      }
    }
  });

  it("registers the four clinic pages in the operator SEO defaults", () => {
    expect(MARKETING_SEO_PATHS).toEqual(
      expect.arrayContaining([
        "/clinics",
        "/dental",
        "/physiotherapy",
        "/chiropractic",
        "/cosmetic-clinics",
      ])
    );
    expect(MARKETING_PAGE_LABELS["/clinics"]).toBe("Clinics");
    expect(MARKETING_SEO_PAGE_KEYS["/clinics"]).toBe("clinics");
    expect(MARKETING_PAGE_LABELS["/dental"]).toBe("Dental");
    expect(MARKETING_PAGE_LABELS["/cosmetic-clinics"]).toBe(
      "Cosmetic & aesthetic"
    );
    expect(MARKETING_SEO_PAGE_KEYS["/physiotherapy"]).toBe("physiotherapy");
    expect(MARKETING_SEO_PAGE_KEYS["/cosmetic-clinics"]).toBe(
      "cosmeticClinics"
    );
  });

  it("uses one shared vertical design system with per-vertical accents", () => {
    const css = readFileSync("app/(marketing)/marketing.module.css", "utf8");
    const landing = readFileSync(
      "app/(marketing)/components/marketing-vertical-landing.tsx",
      "utf8"
    );
    const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");

    expect(tokens).toContain("--mk-section-space-xl");
    expect(tokens).toContain("--mk-section-space-lg");
    expect(tokens).toContain("--mk-section-space-md");
    expect(css).toContain("--vertical-accent");
    expect(css).toContain('data-vertical="dental"');
    expect(css).toContain('data-vertical="physiotherapy"');
    expect(css).toContain('data-vertical="chiropractic"');
    expect(css).toContain('data-vertical="cosmetic"');
    expect(css).toContain("var(--mk-sky)");
    expect(css).toContain("var(--mk-sky-text)");
    expect(css).toContain("var(--mk-cobalt-soft)");
    expect(css).toContain("var(--mk-teal)");
    expect(css).toContain("var(--mk-teal-text)");
    expect(css).toContain("var(--mk-periwinkle-text)");
    expect(css).not.toContain("var(--mk-lavender)");
    expect(css).toContain(".verticalHero");
    expect(css).toContain(".verticalProblemGrid");
    expect(css).toContain(".verticalRail");
    expect(css).toContain(".verticalProofPanel");
    expect(css).toContain("--vertical-surface-soft");
    expect(css).toContain("--vertical-surface-emphasis");
    expect(css).toContain("--vertical-hero-canvas");
    expect(css).toContain("--vertical-card-tint");
    expect(css).not.toContain(".dentalHero");
    expect(css).not.toContain(".physioHero");
    expect(landing).toContain("MarketingVerticalHero");
    expect(landing).toContain("verticalGuidanceAside");
    expect(landing).toContain("MarketingRevealItem");
    expect(landing.indexOf("verticalGuidanceAside")).toBeLessThan(
      landing.indexOf("verticalStatus")
    );
    expect(landing).not.toContain("VERTICAL_RELATED_LINKS");
    expect(landing).not.toContain("About River Aftercare");
    expect(VERTICAL_ACCENT_FAMILY).toEqual({
      dental: "cobalt",
      physiotherapy: "teal",
      chiropractic: "periwinkle",
      cosmetic: "cyan",
    });
    expect(new Set(Object.values(VERTICAL_ACCENT_FAMILY)).size).toBe(4);
  });

  it("sizes the hero pathway panel to its content instead of stretching the column", () => {
    const css = readFileSync("app/(marketing)/marketing.module.css", "utf8");
    const slotRule =
      css.match(/\.verticalHeroPanelSlot\s*\{[^}]+\}/)?.[0] ?? "";
    const panelRule = css.match(/\.verticalHeroPanel\s*\{[^}]+\}/)?.[0] ?? "";

    expect(slotRule).toContain("height: auto");
    expect(slotRule).toContain("align-self: center");
    expect(slotRule).not.toContain("height: 100%");
    expect(panelRule).toContain("height: auto");
    expect(panelRule).not.toContain("height: 100%");
  });

  it("keeps solution and workflow sections eyebrow-free on purpose", () => {
    const landing = readFileSync(
      "app/(marketing)/components/marketing-vertical-landing.tsx",
      "utf8"
    );
    const solutionBlock = landing.slice(
      landing.indexOf("aria-labelledby={`${id}-solution`}"),
      landing.indexOf("aria-labelledby={`${id}-guidance`}")
    );
    const workflowBlock = landing.slice(
      landing.indexOf('id="workflow"'),
      landing.indexOf("content.extras.map")
    );

    expect(solutionBlock).toContain("content.solution.h2");
    expect(solutionBlock).not.toContain("styles.eyebrow");
    expect(workflowBlock).toContain("content.workflow.h2");
    expect(workflowBlock).not.toContain("styles.eyebrow");

    for (const landingContent of Object.values(VERTICAL_LANDINGS)) {
      expect(landingContent.solution).not.toHaveProperty("eyebrow");
      expect(landingContent.workflow).not.toHaveProperty("eyebrow");
      expect(landingContent.problem.eyebrow).toBeTruthy();
      expect(landingContent.guidance.eyebrow).toBeTruthy();
      expect(landingContent.faq.eyebrow).toBeTruthy();
    }
  });
});
