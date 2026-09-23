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

    expect(physio).toContain(
      "does not currently track exercise completion, adherence or patient progress"
    );
    expect(physio).toContain(
      "home exercise programme or exercise-tracking app"
    );
    expect(physio).toContain(
      "Physiotherapy template availability is confirmed during onboarding. If no suitable River Aftercare template is available, your clinic can publish its own approved guidance within its plan."
    );
    expect(physio).toContain("up to 2 active custom clinic guides");
    expect(physio).toContain("up to 30 active custom guides");
    expect(physio).not.toContain("adherence monitoring");
    expect(physio).not.toContain("home exercise programme app");
    expect(physio).not.toContain("video exercise");
    expect(chiro).toContain(
      "does not replace your practice-management system, patient health record"
    );
    expect(chiro).toContain("patient aftercare publishing technology");
    expect(chiro).toContain(
      "These are examples of guidance a practice may choose to publish. Clinical content remains practice-approved."
    );
    expect(chiro).toContain("up to 2 active custom clinic guides");
    expect(chiro).toContain("up to 30 active custom guides");
    expect(chiro).not.toContain(
      "No pre-built chiropractic template library is currently being advertised."
    );
    expect(chiro).not.toContain("spinal alignment");
    expect(chiro).not.toContain("clinical outcomes");
    expect(cosmetic).toContain(
      "does not currently provide live clinical monitoring, treatment monitoring or emergency triage"
    );
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
    expect(dental).toContain("Current dental demo");
    expect(dental).not.toContain("Current starting template");
    const templateAt = dental.indexOf("Current dental demo");
    expect(templateAt).toBeGreaterThan(-1);
    expect(dental.slice(Math.max(0, templateAt - 280), templateAt)).toContain(
      "mkReveal"
    );
    const dentalNoteAt = dental.indexOf(
      "Riverside Dental Demo uses a Tooth Extraction sample guide to show the current patient experience."
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
      physio.slice(Math.max(0, physioNoteAt - 900), physioNoteAt)
    ).toContain("mkReveal");
    expect(dental).toContain("Dental demo");
    expect(dental).not.toContain("Live example");
    expect(dental).toContain(
      "Start with an available guide, or bring your own clinic-approved aftercare."
    );
    expect(dental).toContain("up to 2 active custom clinic guides");
    expect(dental).toContain("up to 30 active custom guides");
    expect(dental).toContain(
      "From approved instructions to a page patients can revisit"
    );
    expect(dental).not.toContain(
      "From approved instructions to a page patients can keep"
    );
    expect(dental).toContain("See the patient experience in action");
    expect(dental).toContain("It is not clinically reviewed.");
    expect(dental).not.toContain("See a real River Aftercare dental example");
    expect(dental).not.toContain("Do patients need to download an app?");
    expect(dental).not.toContain("Do patients need an account?");
    expect(dental).toContain("Do patients need an app or account?");
    expect(dental).toContain(
      "How many custom aftercare guides can we publish?"
    );
    expect(dental).toContain("patient aftercare publishing software");
    expect(dental).toContain(
      "where your plan allows, local instructions and supported section changes"
    );
    const demoHtml = dental.slice(
      dental.indexOf('aria-labelledby="dental-demo"'),
      dental.indexOf('aria-labelledby="dental-faq"')
    );
    const demoGroupAt = demoHtml.indexOf('data-mk-section=""');
    const proofPanelAt = demoHtml.indexOf("verticalProofPanel");
    expect(demoGroupAt).toBeGreaterThan(-1);
    expect(proofPanelAt).toBeGreaterThan(demoGroupAt);
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
      expect(html.match(/<details\b/g)).toHaveLength(landing.faq.items.length);
      for (const item of landing.faq.items) {
        expect(html).toContain(item.question);
        expect(html).toContain(item.answer.replaceAll("'", "&#x27;"));
      }
    }
  });

  it("keeps physiotherapy copy on between-visit guidance without a demo or tracking claim", async () => {
    const physio = renderToStaticMarkup(await MarketingPhysiotherapyPage());
    const landing = VERTICAL_LANDINGS["/physiotherapy"];

    expect(landing.hero.h1).toBe(
      "Keep recovery guidance clear between appointments."
    );
    expect(landing.hero.body).toBe(
      "Turn clinic-approved recovery, home-care and written exercise guidance into branded pages patients can revisit between appointments — by link or QR code, with no patient app or login."
    );
    expect(landing.hero.panel.items.map((item) => item.body)).toEqual([
      "Clinic-controlled recovery guidance",
      "Your logo, colours and terminology stay visible",
      "Patients reopen the same durable link",
      "The page opens in the browser",
    ]);
    expect(landing.solution.h2).toBe(
      "A branded home for between-visit guidance"
    );
    expect(landing.solution.body).toContain(
      "turns clinic-approved recovery and home-care guidance into branded web pages"
    );
    expect(landing.guidance.h2).toBe(
      "Support the guidance that happens outside the treatment room"
    );
    expect(landing.guidance.body).toContain("can publish guidance such as:");
    expect(landing.guidance.items).toEqual([
      "post-appointment home-care information",
      "written recovery instructions",
      "written exercise reminders or instructions",
      "self-management guidance",
      "return-to-activity information",
      "clinic contact and escalation information",
    ]);
    expect(landing.guidance.boundary).toBe(
      "River Aftercare publishes clinic-approved written guidance. It does not currently track exercise completion, adherence or patient progress."
    );
    expect(landing.guidance.note).toContain(
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides."
    );
    expect(landing.guidance.note).toContain(
      "Practice supports up to 30 active custom guides, with broader creation and adaptation, local instructions and section controls."
    );
    expect(landing.guidance.note).toContain(
      "Physiotherapy template availability is confirmed during onboarding."
    );
    expect(landing.guidance.note).not.toMatch(/ankle|knee|shoulder|lumbar/i);
    expect(landing.workflow.h2).toBe(
      "Fit aftercare into the workflow you already have"
    );
    expect(landing.workflow.steps.map((step) => step.title)).toEqual([
      "Prepare the guidance",
      "Adapt it to your clinic",
      "Publish it under your brand",
      "Share it after the appointment",
    ]);
    expect(landing.workflow.steps[0]?.body).toBe(
      "Use an available River Aftercare template or clinic-approved recovery and home-care content."
    );
    expect(landing.extras[0]).toMatchObject({
      kind: "copy",
      eyebrow: "How it fits",
      h2: "Designed to complement clinical software, not replace it",
    });
    expect(landing.extras[0]?.kind === "copy" && landing.extras[0].body).toBe(
      "River Aftercare focuses on clear patient-facing guidance. It is not currently a practice-management system, patient health record, messaging platform, clinical monitoring system or exercise-adherence tracker."
    );
    expect(landing.faq.items).toHaveLength(6);
    expect(physio).toContain('href="#workflow"');
    expect(physio).toContain('href="/contact"');
    expect(physio).not.toContain("Riverside");
    expect(physio).not.toContain("Tooth Extraction");
    expect(physio).not.toMatch(
      /exercise logging|activity tracking|adherence dashboard/i
    );
    expect(physio).not.toMatch(/\$\d|per month/i);
    expect(JSON.stringify(landing)).not.toMatch(
      /tracks whether patients complete|monitors exercise adherence|clinical monitoring of/i
    );
  });

  it("keeps chiropractic copy on between-visit home-care without a demo or treatment advice", async () => {
    const chiro = renderToStaticMarkup(await MarketingChiropracticPage());
    const landing = VERTICAL_LANDINGS["/chiropractic"];

    expect(landing.hero.h1).toBe(
      "Give patients clearer guidance between chiropractic visits."
    );
    expect(landing.hero.body).toBe(
      "Publish practice-branded home-care and post-appointment guidance patients can revisit between visits — by link or QR code, with no patient app or login."
    );
    expect(landing.hero.secondaryCta).toEqual({
      kind: "anchor",
      label: "See how it works",
      href: "#workflow",
    });
    expect(landing.hero.panel.items.map((item) => item.body)).toEqual([
      "Practice-controlled home-care guidance",
      "Your logo, colours and terminology stay visible",
      "Patients reopen the same durable link",
      "The page opens in the browser",
    ]);
    expect(landing.solution.h2).toBe(
      "A consistent home for your practice's guidance"
    );
    expect(landing.solution.body).toContain(
      "turns clinic-approved home-care and post-appointment guidance into branded web pages"
    );
    expect(landing.solution.benefits.map((benefit) => benefit.body)).toEqual([
      "Keep your logo, colours, terminology and contact details visible between visits.",
      "Patients return through the same durable link or QR code whenever they need to check the guidance again.",
      "Publish from structured guidance instead of rebuilding or resending the same instructions.",
      "Your practice approves what it publishes and remains responsible for its clinical content.",
    ]);
    expect(landing.guidance.eyebrow).toBe("Home-care guidance");
    expect(landing.guidance.h2).toBe(
      "Publish the guidance that supports your care"
    );
    expect(landing.guidance.body).toBe(
      "Depending on your practice's services and approved content, River Aftercare can publish written guidance such as:"
    );
    expect(landing.guidance.items).toEqual([
      "post-appointment care",
      "home-care instructions",
      "written movement or mobility reminders",
      "self-management guidance",
      "posture or everyday activity information",
      "clinic contact and escalation information",
    ]);
    expect(landing.guidance.boundary).toBe(
      "These are examples of guidance a practice may choose to publish. Clinical content remains practice-approved."
    );
    expect(landing.guidance.note).toContain(
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides."
    );
    expect(landing.guidance.note).toContain(
      "Practice supports up to 30 active custom guides, with broader creation and adaptation, local instructions and section controls."
    );
    expect(landing.guidance.note).toContain(
      "Chiropractic template availability is confirmed during onboarding."
    );
    expect(landing.guidance.note).toContain(
      "If no suitable River Aftercare template is available, your practice can publish its own approved guidance within its plan."
    );
    expect(landing.workflow.h2).toBe(
      "From clinic-approved guidance to a page patients can revisit"
    );
    expect(landing.workflow.steps.map((step) => step.title)).toEqual([
      "Prepare the guidance",
      "Adapt it to your practice",
      "Publish it under your brand",
      "Share it after the appointment",
    ]);
    expect(landing.workflow.steps[0]?.body).toBe(
      "Use an available River Aftercare template or clinic-approved home-care and post-appointment content."
    );
    expect(landing.extras[0]).toMatchObject({
      kind: "copy",
      eyebrow: "How it fits",
      h2: "A publishing layer for patient guidance",
    });
    expect(landing.extras[0]?.kind === "copy" && landing.extras[0].body).toBe(
      "River Aftercare does not replace your practice-management system, patient health record or practitioner judgement. It provides a clinic-controlled patient-facing place for the guidance your practice chooses to publish."
    );
    expect(
      landing.extras[0]?.kind === "copy" &&
        landing.extras[0].highlights.map((item) => item.body)
    ).toEqual([
      "The treating practice remains responsible for the guidance it publishes.",
      "A patient-facing place for approved home-care and post-appointment guidance.",
      "River Aftercare does not replace your patient health record or practice-management system.",
    ]);
    expect(landing.faq.items).toHaveLength(6);
    expect(landing.faq.items.map((item) => item.question)).toEqual([
      "Do patients need an app or account?",
      "Can our practice create or adapt its own home-care guidance?",
      "Does River Aftercare provide chiropractic treatment advice?",
      "What chiropractic templates are available?",
      "Can River Aftercare match our chiropractic practice branding?",
      "Does River Aftercare replace our practice-management system or patient health record?",
    ]);
    expect(chiro).toContain('href="#workflow"');
    expect(chiro).toContain('href="/contact"');
    expect(chiro).toContain('href="/pricing"');
    expect(chiro).not.toContain("Riverside");
    expect(chiro).not.toContain("Tooth Extraction");
    expect(chiro).not.toContain("pre-built chiropractic template library");
    expect(chiro).not.toContain("From clinic-approved notes");
    expect(chiro).not.toMatch(/\$\d|per month/i);
    expect(JSON.stringify(landing)).not.toMatch(
      /spinal adjustment|subluxation|treatment protocol|clinically reviewed/i
    );
    expect(JSON.stringify(landing)).toContain(
      "does not currently replace a practice-management system, patient health record, messaging platform or clinical monitoring system"
    );
    const boundaryAt = chiro.indexOf(
      "These are examples of guidance a practice may choose to publish."
    );
    const noteAt = chiro.indexOf(
      "Chiropractic template availability is confirmed during onboarding."
    );
    expect(boundaryAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(boundaryAt);
    expect(chiro.slice(Math.max(0, boundaryAt - 400), boundaryAt)).toContain(
      "mkReveal"
    );
    expect(chiro.slice(Math.max(0, noteAt - 1200), noteAt)).toContain(
      "mkReveal"
    );
  });

  it("keeps cosmetic copy on branded post-treatment aftercare without a demo or monitoring claim", async () => {
    const cosmetic = renderToStaticMarkup(await MarketingCosmeticClinicsPage());
    const landing = VERTICAL_LANDINGS["/cosmetic-clinics"];

    expect(landing.hero.h1).toBe(
      "Make post-treatment aftercare feel as considered as the treatment."
    );
    expect(landing.hero.body).toBe(
      "Give patients or clients clear, clinic-branded aftercare they can revisit after cosmetic and aesthetic treatments — by link or QR code, with no patient app or login."
    );
    expect(landing.hero.secondaryCta).toEqual({
      kind: "anchor",
      label: "See how it works",
      href: "#workflow",
    });
    expect(landing.hero.panel.items.map((item) => item.body)).toEqual([
      "Clinic-controlled post-treatment aftercare",
      "Your logo, colours and terminology stay visible",
      "Patients or clients reopen the same durable link",
      "The page opens in the browser",
    ]);
    expect(landing.solution.h2).toBe(
      "A polished, branded home for post-treatment guidance"
    );
    expect(landing.solution.body).toContain(
      "turns clinic-approved post-treatment aftercare into branded web pages"
    );
    expect(landing.solution.benefits.map((benefit) => benefit.body)).toEqual([
      "Keep your logo, colours, terminology and contact details visible after treatment.",
      "Patients or clients return through the same durable link or QR code whenever they need to check the guidance again.",
      "Publish from structured guidance instead of recreating or resending the same aftercare instructions.",
      "Your clinic approves what it publishes and remains responsible for its treatment and aftercare information.",
    ]);
    expect(landing.guidance.eyebrow).toBe("Post-treatment experience");
    expect(landing.guidance.h2).toBe(
      "Build aftercare around the treatments your clinic provides"
    );
    expect(landing.guidance.body).toBe(
      "Use an available River Aftercare template where appropriate, or publish clinic-approved post-treatment guidance within the clinic's plan."
    );
    expect(landing.guidance.items).toBeUndefined();
    expect(landing.guidance.note).toContain(
      "Essential includes available River Aftercare templates and up to 2 active custom clinic guides."
    );
    expect(landing.guidance.note).toContain(
      "Practice supports up to 30 active custom guides, with broader creation and adaptation, local instructions and section controls."
    );
    expect(landing.guidance.note).toContain(
      "Cosmetic and aesthetic template availability is confirmed during onboarding."
    );
    expect(landing.guidance.note).toContain(
      "If no suitable River Aftercare template is available, your clinic can publish its own approved aftercare within its plan."
    );
    expect(landing.workflow.h2).toBe(
      "From clinic-approved guidance to branded aftercare"
    );
    expect(landing.workflow.steps.map((step) => step.title)).toEqual([
      "Prepare the aftercare guidance",
      "Adapt it to your clinic",
      "Publish it under your brand",
      "Share it after treatment",
    ]);
    expect(landing.workflow.steps[0]?.body).toBe(
      "Use an available River Aftercare template or clinic-approved post-treatment content."
    );
    expect(landing.extras[0]).toMatchObject({
      kind: "copy",
      eyebrow: "How it fits",
      h2: "Keep the experience recognisably yours",
    });
    expect(landing.extras[0]?.kind === "copy" && landing.extras[0].body).toBe(
      "River Aftercare is deliberately clinic-first. It gives your clinic a branded place to publish approved aftercare without asking patients or clients to join another consumer app."
    );
    expect(
      landing.extras[0]?.kind === "copy" &&
        landing.extras[0].highlights.map((item) => item.title)
    ).toEqual(["Clinic identity", "Durable aftercare", "No app or account"]);
    expect(landing.faq.items).toHaveLength(6);
    expect(landing.faq.items.map((item) => item.question)).toEqual([
      "Do patients or clients need an app or account?",
      "Can our clinic create or adapt its own aftercare instructions?",
      "Does River Aftercare monitor patients after treatment?",
      "What cosmetic and aesthetic templates are available?",
      "Can River Aftercare match our clinic branding?",
      "Does River Aftercare replace our clinic-management software or patient health record?",
    ]);
    expect(cosmetic).toContain('href="#workflow"');
    expect(cosmetic).toContain('href="/contact"');
    expect(cosmetic).toContain('href="/pricing"');
    expect(cosmetic).toContain("See how it works");
    expect(cosmetic).not.toContain("Riverside");
    expect(cosmetic).not.toContain("Tooth Extraction");
    expect(cosmetic).not.toContain("generic social feed");
    expect(cosmetic).not.toContain("pre-built treatment library");
    expect(cosmetic).not.toContain("we don't have templates");
    expect(cosmetic).not.toMatch(/\$\d|per month/i);
    expect(JSON.stringify(landing)).not.toMatch(
      /injectable|filler|botox|reduced complications|treatment protocol/i
    );
    expect(JSON.stringify(landing)).toContain(
      "does not currently provide live clinical monitoring, treatment monitoring or emergency triage"
    );
    const noteAt = cosmetic.indexOf(
      "Cosmetic and aesthetic template availability is confirmed during onboarding."
    );
    expect(noteAt).toBeGreaterThan(-1);
    expect(cosmetic.slice(Math.max(0, noteAt - 1200), noteAt)).toContain(
      "mkReveal"
    );
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
    expect(css).toMatch(
      /\.verticalProofLayout\.sectionStack\s+\.copy\s*\{[^}]*margin-bottom:\s*2rem/
    );
    const demoBlock = landing.slice(
      landing.indexOf('extra.kind === "demo"'),
      landing.indexOf("verticalFitLayout")
    );
    const groupStart = demoBlock.indexOf("<MarketingRevealGroup>");
    const groupEnd = demoBlock.indexOf("</MarketingRevealGroup>");
    const panelAt = demoBlock.indexOf("verticalProofPanel");
    expect(groupStart).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(groupStart);
    expect(panelAt).toBeLessThan(groupEnd);
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
