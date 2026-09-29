/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import { GuideSectionKindIcon } from "@/app/(staff)/components/guide-section-kind-icon";
import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import {
  guideBlockAccent,
  guideBlockFamily,
  guideBlockFamilyLabel,
  guideSectionKindsByLabel,
} from "@/lib/aftercare/guide-block-presentation";
import {
  GUIDE_SECTION_KINDS,
  type GuideSectionKind,
} from "@/lib/aftercare/types";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";

function emptySection(kind: GuideSectionKind): EditorSection {
  return {
    key: kind.toLowerCase(),
    kind,
    title: "",
    body: "",
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions: [],
  };
}

describe("ordered guide sections editor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLElement.prototype.scrollIntoView = () => undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(sections: EditorSection[], onChange = () => undefined) {
    act(() => {
      root.render(
        <OrderedGuideSectionsEditor
          sections={sections}
          disabled={false}
          onChange={onChange}
        />
      );
    });
  }

  it("maps every section kind to a label and a hidden icon", () => {
    render(GUIDE_SECTION_KINDS.map((kind) => emptySection(kind)));
    for (const kind of GUIDE_SECTION_KINDS) {
      const article = container.querySelector(
        `[data-section-kind="${kind}"]`
      ) as HTMLElement;
      const label = guideSectionKindLabel(kind);
      expect(article.querySelector(".canonicalBlockBadge")?.textContent).toBe(
        guideBlockFamilyLabel(kind)
      );
      expect(article.getAttribute("data-block-family")).toBe(
        guideBlockFamily(kind)
      );
      expect(article.getAttribute("data-block-accent")).toBe(
        guideBlockAccent(kind)
      );
      expect(article.querySelector(".canonicalBlockSummary")?.textContent).toBe(
        kind === "RECOVERY_TIMELINE" || kind === "HOME_CARE_PLAN"
          ? "Untitled"
          : label
      );
      expect(
        article.querySelector('option[value="FIRST_24_HOURS"]')
      ).toBeTruthy();
      const toggle = article.querySelector(
        "button[aria-expanded]"
      ) as HTMLButtonElement;
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.getAttribute("aria-controls")).toBe(
        `${kind.toLowerCase()}-panel`
      );
      expect(
        article.querySelector("svg")?.getAttribute("data-section-icon")
      ).toBe(kind);
      expect(article.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
        "true"
      );
      expect(
        article.querySelector(`button[aria-label="Move ${label} up"]`)
      ).toBeTruthy();
      expect(
        article.querySelector(`button[aria-label="Move ${label} down"]`)
      ).toBeTruthy();
      const remove = article.querySelector(
        `button[aria-label="Remove ${label}"]`
      ) as HTMLButtonElement;
      expect(remove.className).toContain("staffBtnDanger");
      expect(
        article
          .querySelector("h3")!
          .compareDocumentPosition(article.querySelector("select")!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    const first = container.querySelector(
      '[data-section-kind="INTRODUCTION"] button[aria-label="Move Introduction up"]'
    ) as HTMLButtonElement;
    const last = container.querySelector(
      '[data-section-kind="HOME_CARE_PLAN"] button[aria-label="Move Home care plan down"]'
    ) as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    expect(last.disabled).toBe(true);
    expect(
      (
        container.querySelector(
          '[data-section-kind="INTRODUCTION"] button[aria-label="Move Introduction down"]'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });

  it("adds empty sections, timeline stages, and home-care plans", () => {
    const seen: EditorSection[][] = [];
    function Harness() {
      const [sections, setSections] = useState<EditorSection[]>([]);
      return (
        <OrderedGuideSectionsEditor
          sections={sections}
          disabled={false}
          onChange={(next) => {
            seen.push(next);
            setSections(next);
          }}
        />
      );
    }
    act(() => {
      root.render(<Harness />);
    });

    function click(name: string) {
      const button = [...container.querySelectorAll("button")].find((item) =>
        item.textContent?.includes(name)
      ) as HTMLButtonElement;
      expect(button.querySelector("svg")).toBeTruthy();
      act(() => {
        button.click();
      });
    }

    click("Add section");
    click("Add timeline stage");
    click("Add home-care plan");

    const [section, stage, plan] = seen.at(-1) ?? [];
    expect(section).toMatchObject({
      kind: "INTRODUCTION",
      title: "",
      body: "",
      periodLabel: "",
      startDay: "",
      endDay: "",
      homeCareInstructions: [],
    });
    expect(stage).toMatchObject({
      kind: "RECOVERY_TIMELINE",
      title: "",
      body: "",
      periodLabel: "",
      startDay: "",
      endDay: "",
      homeCareInstructions: [],
    });
    expect(plan?.kind).toBe("HOME_CARE_PLAN");
    expect(plan?.title).toBe("");
    expect(plan?.body).toBe("");
    expect(plan?.homeCareInstructions).toHaveLength(1);
    expect(plan?.homeCareInstructions[0]).toMatchObject({
      title: "",
      body: "",
      frequencyCount: "",
      timingLabel: "",
      durationValue: "",
    });
    const serialised = JSON.stringify(seen.at(-1));
    expect(serialised).not.toContain("Example section");
    expect(serialised).not.toContain("Example timeline");
    expect(serialised).not.toContain("Example home-care");
    expect(serialised).not.toContain("Enter guidance");
    expect(serialised).not.toContain("Enter instructions");
    expect(serialised).not.toContain("Enter details");
    expect(serialised).not.toContain("Home care plan");
  });

  it("shows example copy only as placeholders", () => {
    render([
      emptySection("INTRODUCTION"),
      emptySection("RECOVERY_TIMELINE"),
      {
        ...emptySection("HOME_CARE_PLAN"),
        homeCareInstructions: [
          {
            key: "item",
            title: "",
            body: "",
            frequencyCount: "",
            frequencyPeriod: "",
            timingLabel: "",
            durationValue: "",
            durationUnit: "",
          },
        ],
      },
    ]);

    const section = container.querySelector(
      '[data-section-kind="INTRODUCTION"]'
    ) as HTMLElement;
    const stage = container.querySelector(
      '[data-section-kind="RECOVERY_TIMELINE"]'
    ) as HTMLElement;
    const plan = container.querySelector(
      '[data-section-kind="HOME_CARE_PLAN"]'
    ) as HTMLElement;

    expect(
      (section.querySelector("input[id$='-title']") as HTMLInputElement)
        .placeholder
    ).toBe("Example section title");
    expect(
      (section.querySelector("textarea") as HTMLTextAreaElement).placeholder
    ).toBe("Enter guidance...");
    expect(
      (stage.querySelector("input[id$='-title']") as HTMLInputElement).value
    ).toBe("");
    expect(
      (stage.querySelector("input[id$='-period']") as HTMLInputElement)
        .placeholder
    ).toBe("Example period label");
    expect(
      (stage.querySelector("textarea") as HTMLTextAreaElement).placeholder
    ).toBe("Enter instructions...");
    expect(
      (stage.querySelector("input[id$='-start']") as HTMLInputElement).value
    ).toBe("");
    expect(
      (stage.querySelector("input[id$='-end']") as HTMLInputElement).value
    ).toBe("");
    expect(
      (plan.querySelector("input[id$='-title']") as HTMLInputElement)
        .placeholder
    ).toBe("Example plan title");
    expect(
      (plan.querySelector("#item-title") as HTMLInputElement).placeholder
    ).toBe("Example instruction");
    expect(
      (plan.querySelector("#item-body") as HTMLTextAreaElement).placeholder
    ).toBe("Enter details...");
    expect((plan.querySelector("#item-title") as HTMLInputElement).value).toBe(
      ""
    );
    expect(
      (plan.querySelector("#item-body") as HTMLTextAreaElement).value
    ).toBe("");
  });

  it("orders section types by their human-readable labels", () => {
    render([emptySection("WARNING_SIGNS")]);
    const options = [...container.querySelectorAll("select option")].map(
      (option) => option.textContent
    );
    expect(options).toEqual(
      guideSectionKindsByLabel().map((kind) => guideSectionKindLabel(kind))
    );
    expect(options).toEqual([
      "Contact practice",
      "Custom",
      "Emergency",
      "First 24 hours",
      "Home care plan",
      "Immediate care",
      "Introduction",
      "Medications",
      "Pain",
      "Recovery timeline",
      "Restrictions",
      "Site care",
      "Warning signs",
      "What to avoid",
      "What's normal",
    ]);
  });

  it("expands and collapses without dropping typed guidance", () => {
    const seen: EditorSection[][] = [];
    function Harness() {
      const [sections, setSections] = useState<EditorSection[]>([
        {
          ...emptySection("WARNING_SIGNS"),
          key: "warn",
          title: "When to call",
        },
      ]);
      return (
        <OrderedGuideSectionsEditor
          sections={sections}
          disabled={false}
          onChange={(next) => {
            seen.push(next);
            setSections(next);
          }}
        />
      );
    }
    act(() => {
      root.render(<Harness />);
    });

    const article = container.querySelector(
      '[data-section-kind="WARNING_SIGNS"]'
    ) as HTMLElement;
    expect(article.querySelector(".canonicalBlockBadge")?.textContent).toBe(
      "Section"
    );
    expect(article.querySelector(".canonicalBlockSummary")?.textContent).toBe(
      "Warning signs — When to call"
    );
    expect(article.getAttribute("data-block-accent")).toBe("warning");
    const toggle = article.querySelector(
      "button[aria-expanded]"
    ) as HTMLButtonElement;
    expect(toggle.type).toBe("button");
    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const title = article.querySelector("#warn-title") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setValue?.call(title, "When to contact your clinic");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(article.querySelector("#warn-title")).toBeTruthy();
    act(() => {
      toggle.click();
    });
    expect(
      (article.querySelector("#warn-title") as HTMLInputElement).value
    ).toBe("When to contact your clinic");
    expect(seen.at(-1)?.[0]?.title).toBe("When to contact your clinic");

    const collapseAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Collapse all"
    ) as HTMLButtonElement;
    const expandAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Expand all"
    ) as HTMLButtonElement;
    act(() => {
      collapseAll.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      expandAll.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      (article.querySelector("#warn-title") as HTMLInputElement).value
    ).toBe("When to contact your clinic");
  });

  it("opens a new block, scrolls it into view, and focuses its title", () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    function Harness() {
      const [sections, setSections] = useState<EditorSection[]>([
        emptySection("INTRODUCTION"),
      ]);
      return (
        <OrderedGuideSectionsEditor
          sections={sections}
          disabled={false}
          onChange={setSections}
        />
      );
    }
    act(() => {
      root.render(<Harness />);
    });
    const add = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add timeline stage")
    ) as HTMLButtonElement;
    act(() => {
      add.click();
    });
    const added = container.querySelector(
      '[data-section-kind="RECOVERY_TIMELINE"]'
    ) as HTMLElement;
    expect(added.getAttribute("data-expanded")).toBe("true");
    expect(added.getAttribute("data-block-family")).toBe("timeline");
    expect(added.id.startsWith("canonical-block-")).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(
      added.querySelector("input[id$='-title']")
    );
    expect(
      container
        .querySelector(
          '[data-section-kind="INTRODUCTION"] button[aria-expanded]'
        )
        ?.getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("pads expanded accordion content under the header", () => {
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toMatch(/\.canonicalBlockFields\s*\{[\s\S]*?padding:\s*1rem;/);
    render([
      {
        ...emptySection("INTRODUCTION"),
        key: "intro",
        title: "Welcome",
      },
      {
        ...emptySection("FIRST_24_HOURS"),
        key: "first-day",
        title: "First 24 hours",
      },
      {
        ...emptySection("RECOVERY_TIMELINE"),
        key: "stage",
        title: "First 24 hours",
        periodLabel: "First 24 hours",
        startDay: "0",
        endDay: "1",
      },
      {
        ...emptySection("HOME_CARE_PLAN"),
        key: "plan",
        title: "Your home plan",
      },
    ]);
    for (const key of ["intro", "first-day", "stage", "plan"]) {
      const article = container.querySelector(
        `[data-section-key="${key}"]`
      ) as HTMLElement;
      const toggle = article.querySelector(
        "button[aria-expanded]"
      ) as HTMLButtonElement;
      act(() => {
        toggle.click();
      });
      const panel = article.querySelector(".staffAccordionPanel");
      expect(panel?.getAttribute("data-open")).toBe("true");
      const fields = panel?.querySelector(".canonicalBlockFields");
      expect(fields).toBeTruthy();
      expect(fields?.querySelector("select, input")).toBeTruthy();
    }
  });

  it("shows a matching kind and title once, and keeps First 24 hours available", () => {
    render([
      {
        ...emptySection("FIRST_24_HOURS"),
        key: "standalone",
        title: "First 24 hours",
      },
      {
        ...emptySection("WARNING_SIGNS"),
        key: "warn",
        title: "When to contact your clinic",
      },
      {
        ...emptySection("RECOVERY_TIMELINE"),
        key: "first-stage",
        title: "First 24 hours",
        periodLabel: "First 24 hours",
        startDay: "0",
        endDay: "1",
      },
      {
        ...emptySection("RECOVERY_TIMELINE"),
        key: "early",
        title: "Early recovery",
        periodLabel: "Days 2–3",
        startDay: "2",
        endDay: "3",
      },
      {
        ...emptySection("HOME_CARE_PLAN"),
        key: "plan",
        title: "Your home plan",
      },
    ]);

    function summary(key: string) {
      const article = container.querySelector(
        `[data-section-key="${key}"]`
      ) as HTMLElement;
      return {
        badge: article.querySelector(".canonicalBlockBadge")?.textContent,
        summary: article.querySelector(".canonicalBlockSummary")?.textContent,
        article,
      };
    }

    expect(summary("standalone")).toMatchObject({
      badge: "Section",
      summary: "First 24 hours",
    });
    expect(summary("standalone").summary).not.toContain("·");
    expect(summary("warn")).toMatchObject({
      badge: "Section",
      summary: "Warning signs — When to contact your clinic",
    });
    const firstStage = summary("first-stage");
    expect(firstStage).toMatchObject({
      badge: "Timeline",
      summary: "First 24 hours",
    });
    expect(
      (
        firstStage.article.querySelector(
          "#first-stage-start"
        ) as HTMLInputElement
      ).value
    ).toBe("0");
    expect(
      (firstStage.article.querySelector("#first-stage-end") as HTMLInputElement)
        .value
    ).toBe("1");
    expect(
      firstStage.article.querySelector('option[value="FIRST_24_HOURS"]')
        ?.textContent
    ).toBe("First 24 hours");
    expect(
      firstStage.article.querySelector('option[value="RECOVERY_TIMELINE"]')
        ?.textContent
    ).toBe("Recovery timeline");
    expect(summary("early")).toMatchObject({
      badge: "Timeline",
      summary: "Days 2–3 — Early recovery",
    });
    expect(summary("plan")).toMatchObject({
      badge: "Home care",
      summary: "Your home plan",
    });
  });
});

describe("guide section kind icons", () => {
  it("renders an accessible-hidden icon for every kind", () => {
    for (const kind of GUIDE_SECTION_KINDS) {
      const html = renderToStaticMarkup(<GuideSectionKindIcon kind={kind} />);
      expect(html).toContain(`data-section-icon="${kind}"`);
      expect(html).toContain('aria-hidden="true"');
    }
  });
});
