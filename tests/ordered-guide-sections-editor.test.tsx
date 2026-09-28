/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import { GuideSectionKindIcon } from "@/app/(staff)/components/guide-section-kind-icon";
import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
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
      expect(article.querySelector("h3")?.textContent).toContain(label);
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
