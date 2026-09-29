import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { PracticeContact } from "@/app/(aftercare)/components/practice-contact";
import patientStyles from "@/app/(aftercare)/patient.module.css";
import type { PracticeChrome } from "@/lib/aftercare/practice-chrome";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

const PRACTICE_CHROME: PracticeChrome = {
  displayName: "Harbor Family Dental",
  logoSrc: null,
  darkLogoSrc: null,
  faviconSrc: null,
  phoneDisplay: "03 5550 0199",
  phoneHref: "tel:0355500199",
  addressText: null,
  bookingHref: null,
  contactHref: null,
  emergencyInstructions: null,
  showCareGuideAttribution: false,
  showDemoNotice: false,
  instructionTerminology: "AFTERCARE",
  instructionsLabel: "Aftercare instructions",
  themeMode: "SYSTEM",
  allowPatientThemeToggle: true,
};

function section(
  overrides: Partial<ComposedGuideSection> &
    Pick<ComposedGuideSection, "key" | "kind" | "title">
): ComposedGuideSection {
  return {
    body: `${overrides.key} body`,
    periodLabel: null,
    provenance: "canonical",
    ...overrides,
  };
}

describe("GuideDocument timeline rendering", () => {
  it("renders period labels in order without patient-specific fields", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "Short summary.",
          }),
          section({
            key: "hours",
            kind: "RECOVERY_TIMELINE",
            title: "Immediate care",
            periodLabel: "First 4 hours",
            body: "Keep the site still.",
          }),
          section({
            key: "week-two",
            kind: "RECOVERY_TIMELINE",
            title: "Later healing",
            periodLabel: "Week 2+",
            body: "Check in if unsure.",
          }),
        ]}
      />
    );

    expect(html).toContain("Recovery guide");
    expect(html).not.toContain("Recovery timeline");
    expect(html).toContain("First 4 hours");
    expect(html).toContain("Week 2+");
    expect(html.indexOf("First 4 hours")).toBeLessThan(html.indexOf("Week 2+"));
    expect(html).toContain("<ol");
    expect(html.match(/<ol\b/g)).toHaveLength(1);
    expect(html.match(/<li\b/g)).toHaveLength(2);
    expect(html).not.toContain("<article");
    expect(html).not.toContain("patient name");
    expect(html).not.toContain("PIN");
    expect(html).not.toContain("plan ID");
    expect(html).not.toContain("QR Rx");
  });

  it("keeps consecutive stages in one journey instead of per-stage cards", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "hours",
            kind: "RECOVERY_TIMELINE",
            title: "Immediate care",
            periodLabel: "First 4 hours",
          }),
          section({
            key: "day",
            kind: "RECOVERY_TIMELINE",
            title: "Protect the site",
            periodLabel: "Today",
          }),
        ]}
      />
    );

    expect(html.match(/<section\b/g)).toHaveLength(1);
    expect(html).not.toContain("<article");
    expect(html.match(/<ol\b/g)).toHaveLength(1);
  });

  it("still renders a guide that has no timeline sections", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "No timeline here.",
          }),
        ]}
      />
    );

    expect(html).toContain("About this guide");
    expect(html).not.toContain("Recovery guide");
    expect(html).not.toContain("Recovery timeline");
    expect(html).not.toContain("<ol");
  });

  it("renders standard sections as plain headings without card wrappers", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "Plain introduction.",
          }),
          section({
            key: "normal",
            kind: "WHAT_IS_NORMAL",
            title: "What is normal",
            body: "Expected recovery notes.",
          }),
        ]}
      />
    );

    expect(html).toContain("About this guide");
    expect(html).toContain("What is normal");
    expect(html).not.toContain("<article");
    expect(html.match(/<section\b/g)).toHaveLength(2);
  });

  it("renders a structured home-care plan without tracking controls", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "hours",
            kind: "RECOVERY_TIMELINE",
            title: "Today",
            periodLabel: "Today",
            body: "Reduce load.",
          }),
          section({
            key: "plan",
            kind: "HOME_CARE_PLAN",
            title: "Home care plan",
            body: "Follow the items below.",
            homeCareInstructions: [
              {
                key: "repeat",
                title: "Repeated movement",
                body: "Use the movement shown in clinic.",
                frequencyCount: 3,
                frequencyPeriod: "WEEK",
                timingLabel: null,
                durationValue: 4,
                durationUnit: "WEEKS",
                sortOrder: 1,
              },
              {
                key: "cool",
                title: "Cool the area",
                body: null,
                frequencyCount: 1,
                frequencyPeriod: "DAY",
                timingLabel: "Evening",
                durationValue: 7,
                durationUnit: "DAYS",
                sortOrder: 2,
              },
              {
                key: "avoid",
                title: "Avoid running",
                body: null,
                frequencyCount: null,
                frequencyPeriod: null,
                timingLabel: null,
                durationValue: 2,
                durationUnit: "WEEKS",
                sortOrder: 3,
              },
            ],
          }),
        ]}
      />
    );

    expect(html).toContain("Today");
    expect(html).toContain("Home care plan");
    expect(html).toContain("Repeated movement");
    expect(html).toContain("3 times per week");
    expect(html).toContain("4 weeks");
    expect(html).toContain("Once daily");
    expect(html).toContain("Evening");
    expect(html).toContain("7 days");
    expect(html).toContain("Avoid running");
    expect(html).toContain("For 2 weeks");
    expect(html).not.toContain("checkbox");
    expect(html).not.toContain("Mark done");
    expect(html).not.toContain("progress");
    expect(html).not.toContain('type="checkbox"');
  });

  it("renders author bullet lines as a semantic list without interpreting HTML", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "contact",
            kind: "CONTACT_PRACTICE",
            title: "Contact your clinic",
            body: `Contact your clinic if you have:

• severe or worsening pain
• heavy bleeding
• <img src=x onerror=alert(1)>`,
          }),
          section({
            key: "plain",
            kind: "INTRODUCTION",
            title: "About this guide",
            body: "First paragraph.\n\nSecond paragraph.\nStill the second paragraph.",
          }),
        ]}
      />
    );

    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("severe or worsening pain");
    expect(html).toContain("heavy bleeding");
    expect(html).not.toContain("• severe");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("First paragraph.");
    expect(html).toContain("Second paragraph.");
    expect(html).toContain("Still the second paragraph.");
    expect(html).toContain('data-guide-tone="contact"');
    expect(html.match(/<p\b/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("gives warning, emergency, reassurance, and contact sections distinct tones", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "normal",
            kind: "WHAT_IS_NORMAL",
            title: "What is normal",
            body: "Mild swelling can be expected.",
          }),
          section({
            key: "warning",
            kind: "WARNING_SIGNS",
            title: "Warning signs",
            body: "Call the clinic.",
          }),
          section({
            key: "help",
            kind: "CONTACT_PRACTICE",
            title: "Contact the practice",
            body: "Phone the clinic.",
          }),
          section({
            key: "urgent",
            kind: "EMERGENCY",
            title: "Emergency",
            body: "Call emergency services.",
          }),
        ]}
      />
    );
    const styles = readFileSync("app/(aftercare)/patient.module.css", "utf8");

    expect(html).toContain('data-guide-tone="reassurance"');
    expect(html).toContain('data-guide-tone="warning"');
    expect(html).toContain('data-guide-tone="contact"');
    expect(html).toContain('data-guide-tone="emergency"');
    expect(html).toContain("Important.");
    expect(html).toContain("Urgent.");
    expect(styles).toContain("list-style-type: disc");
    expect(styles).toContain("list-style-type: decimal");
    expect(styles).toContain(".reassurance");
    expect(styles).toContain("var(--cg-notice-surface)");
    expect(styles).toContain(".contact");
    expect(styles).toContain("var(--cg-brand)");
    expect(styles).toContain("var(--cg-warning-surface)");
    expect(styles).toContain("var(--cg-emergency-surface)");
  });

  it("keeps contact practice callout padding and section separation off the practice footer", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "help",
            kind: "CONTACT_PRACTICE",
            title: "Contact the practice",
            body: "Phone the clinic during opening hours.\n\n• Call the practice\n• Ask for the aftercare nurse",
          }),
          section({
            key: "next",
            kind: "RESTRICTIONS",
            title: "Activity",
            body: "Return to normal activity gradually.",
          }),
        ]}
      />
    );
    const styles = readFileSync("app/(aftercare)/patient.module.css", "utf8");
    const contactRules = [
      ...styles.matchAll(/(?:^|\n)\.contact\s*\{([^}]*)\}/g),
    ].filter((match) => !/,\s*$/.test(styles.slice(0, match.index ?? 0)));
    const footer = renderToStaticMarkup(
      <PracticeContact chrome={PRACTICE_CHROME} />
    );

    expect(html).toContain(
      `class="${patientStyles.section} ${patientStyles.contact}"`
    );
    expect(html).toContain('data-guide-tone="contact"');
    expect(html).toContain(patientStyles.contentList);
    expect(html).toContain("Call the practice");
    expect(html.indexOf("Contact the practice")).toBeLessThan(
      html.indexOf("Activity")
    );
    expect(html).not.toContain(patientStyles.practiceContact);

    expect(styles).toMatch(
      /\.warning,\s*\.emergency,\s*\.contact\s*\{[^}]*padding:\s*0\.85rem 1rem;[^}]*border:\s*0;/
    );
    expect(contactRules).toHaveLength(1);
    expect(contactRules[0]?.[1]).toContain(
      "box-shadow: inset 3px 0 0 var(--cg-brand)"
    );
    expect(contactRules[0]?.[1]).toContain("var(--cg-surface)");
    expect(contactRules[0]?.[1]).not.toMatch(/\bpadding\s*:/);
    expect(contactRules[0]?.[1]).not.toMatch(/\bmargin\s*:/);
    expect(contactRules[0]?.[1]).not.toContain("border-top");
    expect(styles).toMatch(/\.section\s*\{[^}]*margin:\s*0 0 1\.35rem;/);
    expect(styles).toMatch(
      /\.contentList\s*\{[^}]*list-style-type:\s*disc;[^}]*padding-left:\s*1\.35rem;/
    );
    expect(styles).toMatch(
      /\.contentList li \+ li,\s*\.contentOrderedList li \+ li\s*\{[^}]*margin-top:\s*0\.28rem;/
    );
    expect(styles).not.toMatch(/\.contact\s+\.contentList/);
    expect(styles).not.toMatch(/\.contact\s+\.body/);
    expect(styles).toMatch(
      /\.practiceContact\s*\{[^}]*margin:\s*2rem 0 0;[^}]*padding:\s*1\.4rem 0 0;[^}]*border-top:\s*1px solid var\(--cg-border\);/
    );
    expect(styles).toContain(".disclaimer + .practiceContact");
    expect(styles).not.toMatch(/\.disclaimer \+ \.contact\b/);

    expect(footer).toContain(`class="${patientStyles.practiceContact}"`);
    expect(footer).not.toContain(patientStyles.contact);
  });

  it("keeps timeline order and grouping when a stage contains a list", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "hours",
            kind: "RECOVERY_TIMELINE",
            title: "Immediate care",
            periodLabel: "First 4 hours",
            body: "Keep the site still.\n\n• do not smoke or vape\n• avoid alcohol",
          }),
          section({
            key: "week-two",
            kind: "RECOVERY_TIMELINE",
            title: "Later healing",
            periodLabel: "Week 2+",
            body: "Check in if unsure.",
          }),
        ]}
      />
    );

    expect(html).toContain("Recovery guide");
    expect(html).toContain("First 4 hours");
    expect(html).toContain("Week 2+");
    expect(html.indexOf("First 4 hours")).toBeLessThan(html.indexOf("Week 2+"));
    expect(html.match(/<ol\b/g)).toHaveLength(1);
    expect(html).toContain("<ul");
    expect(html).toContain("do not smoke or vape");
    expect(html).toContain("avoid alcohol");
    expect(html).not.toContain("<article");
  });

  it("renders numbered lines as a semantic ordered list and escapes HTML", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "steps",
            kind: "IMMEDIATE_CARE",
            title: "Steps",
            body: `Do this:

1. First instruction
2. <img src=x onerror=alert(1)>

Then rest.`,
          }),
        ]}
      />
    );

    expect(html).toContain("<ol");
    expect(html).toContain("contentOrderedList");
    expect(html).toContain("First instruction");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).toContain("Then rest.");
    expect(html).not.toContain("1. First");
  });

  it("keeps a timeline and the following section in one document without an extra spacer", () => {
    const html = renderToStaticMarkup(
      <GuideDocument
        sections={[
          section({
            key: "intro",
            kind: "INTRODUCTION",
            title: "After your extraction",
            body: "Read this first.",
          }),
          section({
            key: "hours",
            kind: "RECOVERY_TIMELINE",
            title: "Immediate care",
            periodLabel: "First few hours",
            body: "Keep the site still.\n\n• do not rinse\n• avoid straws",
          }),
          section({
            key: "later",
            kind: "RECOVERY_TIMELINE",
            title: "Healing check",
            periodLabel: "Days 4–7",
            body: "Discomfort should settle.",
          }),
          section({
            key: "normal",
            kind: "WHAT_IS_NORMAL",
            title: "What you may normally notice",
            body: "• mild swelling\n• a dull ache",
          }),
          section({
            key: "care",
            kind: "SITE_CARE",
            title: "Site care",
            body: "Keep the area clean.",
          }),
          section({
            key: "avoid",
            kind: "WHAT_TO_AVOID",
            title: "What to avoid",
            body: "1. Do not smoke\n2. Do not poke the site",
          }),
          section({
            key: "warning",
            kind: "WARNING_SIGNS",
            title: "Warning signs",
            body: "Call the clinic.",
          }),
          section({
            key: "urgent",
            kind: "EMERGENCY",
            title: "Emergency",
            body: "Call emergency services.",
          }),
        ]}
      />
    );

    expect(html.match(/data-guide-document=/g)).toHaveLength(1);
    const documentStart = html.indexOf("data-guide-document");
    const recovery = html.indexOf("Recovery guide");
    const normal = html.indexOf("What you may normally notice");
    expect(documentStart).toBeGreaterThanOrEqual(0);
    expect(documentStart).toBeLessThan(recovery);
    expect(recovery).toBeLessThan(normal);
    const between = html.slice(html.lastIndexOf("</section>", normal), normal);
    expect(between).not.toMatch(/<(div|p|span)\b[^>]*>\s*<\/\1>/);
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("do not rinse");
    expect(html).toContain("mild swelling");
    expect(html).toContain('data-guide-tone="reassurance"');
    expect(html).toContain('data-guide-tone="warning"');
    expect(html).toContain('data-guide-tone="emergency"');
    expect(html.match(/data-timeline-separator=/g)).toHaveLength(1);
  });

  it("shares one guide document path for the operator preview and the patient page", () => {
    const preview = readFileSync(
      "app/(staff)/components/canonical-guide-preview.tsx",
      "utf8"
    );
    const patient = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page.tsx",
      "utf8"
    );
    const printPlan = readFileSync(
      "app/(aftercare)/components/print-care-plan.tsx",
      "utf8"
    );
    const document = readFileSync(
      "app/(aftercare)/components/guide-document.tsx",
      "utf8"
    );
    const sectionSource = readFileSync(
      "app/(aftercare)/components/guide-section.tsx",
      "utf8"
    );
    const timeline = readFileSync(
      "app/(aftercare)/components/recovery-timeline-list.tsx",
      "utf8"
    );
    const plan = readFileSync(
      "app/(aftercare)/components/home-care-plan.tsx",
      "utf8"
    );

    expect(preview).toContain("GuideDocument");
    expect(patient).toContain("GuideDocument");
    expect(printPlan).toContain("GuideDocument");
    expect(document).toContain("GuideSection");
    expect(sectionSource).toContain("GuideContent");
    expect(timeline).toContain("GuideContent");
    expect(plan).toContain("GuideContent");
  });
});
