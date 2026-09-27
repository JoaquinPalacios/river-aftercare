import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

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
});
