/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  saveCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  publishCanonicalTemplateRevisionAction: vi.fn(async () => ({})),
  abandonCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  deactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  reactivateCanonicalTemplateAction: vi.fn(async () => ({})),
}));

import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { homeCareInstructionDisclosureName } from "@/app/(staff)/components/home-care-instruction-accordions";
import { HomeCarePlanEditor } from "@/app/(staff)/components/guide-section-editors";
import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import type {
  EditorHomeCareInstruction,
  EditorSection,
} from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { canonicalEditorContentSignature } from "@/lib/aftercare/canonical-editor-content";
import { formatHomeCareInstructionSummary } from "@/lib/aftercare/home-care-instruction";

function instruction(
  overrides: Partial<EditorHomeCareInstruction> & { key: string }
): EditorHomeCareInstruction {
  return {
    title: "Instruction",
    body: "",
    frequencyCount: "",
    frequencyPeriod: "",
    timingLabel: "",
    durationValue: "",
    durationUnit: "",
    ...overrides,
  };
}

function plan(instructions: EditorHomeCareInstruction[]): EditorSection {
  return {
    key: "plan",
    kind: "HOME_CARE_PLAN",
    title: "Home care plan",
    body: "",
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions: instructions,
  };
}

function visibleText(node: Element | null): string {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function scheduleToggle(root: ParentNode, key: string): HTMLButtonElement {
  const toggle = root.querySelector(
    `[data-instruction-key="${key}"] .homeCareScheduleToggle`
  );
  if (!(toggle instanceof HTMLButtonElement)) {
    throw new Error(`Missing schedule disclosure for ${key}`);
  }
  return toggle;
}

function instructionToggle(root: ParentNode, key: string): HTMLButtonElement {
  const instructionNode = root.querySelector(`[data-instruction-key="${key}"]`);
  const toggle = instructionNode?.querySelector(
    ":scope > .homeCareInstructionHeader button[aria-expanded]"
  );
  if (!(toggle instanceof HTMLButtonElement)) {
    throw new Error(`Missing instruction accordion for ${key}`);
  }
  return toggle;
}

function setControlValue(
  control: HTMLInputElement | HTMLSelectElement,
  value: string
) {
  const prototype =
    control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setValue?.call(control, value);
    control.dispatchEvent(
      new Event(control instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      })
    );
  });
}

describe("home-care schedule disclosure", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLElement.prototype.scrollIntoView = () => undefined;
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
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

  const blank = instruction({ key: "blank", title: "Rest" });
  const weekly = instruction({
    key: "weekly",
    title: "Exercises",
    frequencyCount: "3",
    frequencyPeriod: "WEEK",
    durationValue: "4",
    durationUnit: "WEEKS",
  });
  const daily = instruction({
    key: "daily",
    title: "Rinse",
    frequencyCount: "1",
    frequencyPeriod: "DAY",
    timingLabel: "Evening",
    durationValue: "7",
    durationUnit: "DAYS",
  });
  const durationOnly = instruction({
    key: "duration",
    title: "Support",
    durationValue: "2",
    durationUnit: "WEEKS",
  });
  const frequencyOnly = instruction({
    key: "frequency",
    title: "Walk",
    frequencyCount: "3",
    frequencyPeriod: "WEEK",
  });

  function renderClinic(instructions: EditorHomeCareInstruction[]) {
    const seen: EditorSection[][] = [];
    function Harness() {
      const [sections, setSections] = useState<EditorSection[]>([
        plan(instructions),
      ]);
      return (
        <HomeCarePlanEditor
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
    return seen;
  }

  function renderOperator(instructions: EditorHomeCareInstruction[]) {
    function Harness() {
      const [sections, setSections] = useState<EditorSection[]>([
        plan(instructions),
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
  }

  it("starts blank schedules collapsed and populated schedules expanded", () => {
    renderClinic([blank, weekly, daily, durationOnly, frequencyOnly]);

    expect(
      scheduleToggle(container, "blank").getAttribute("aria-expanded")
    ).toBe("false");
    expect(visibleText(scheduleToggle(container, "blank"))).toBe(
      "Schedule (optional)"
    );
    expect(visibleText(scheduleToggle(container, "blank"))).not.toContain(
      "Not specified"
    );
    expect(
      container.querySelector("#blank-schedule-panel")?.hasAttribute("hidden")
    ).toBe(true);

    const summaries = {
      weekly: formatHomeCareInstructionSummary({
        frequencyCount: 3,
        frequencyPeriod: "WEEK",
        timingLabel: null,
        durationValue: 4,
        durationUnit: "WEEKS",
      }),
      daily: formatHomeCareInstructionSummary({
        frequencyCount: 1,
        frequencyPeriod: "DAY",
        timingLabel: "Evening",
        durationValue: 7,
        durationUnit: "DAYS",
      }),
      duration: formatHomeCareInstructionSummary({
        frequencyCount: null,
        frequencyPeriod: null,
        timingLabel: null,
        durationValue: 2,
        durationUnit: "WEEKS",
      }),
      frequency: formatHomeCareInstructionSummary({
        frequencyCount: 3,
        frequencyPeriod: "WEEK",
        timingLabel: null,
        durationValue: null,
        durationUnit: null,
      }),
    };
    expect(summaries).toEqual({
      weekly: "3 times per week · 4 weeks",
      daily: "Once daily · Evening · 7 days",
      duration: "For 2 weeks",
      frequency: "3 times per week",
    });

    for (const key of ["weekly", "daily", "duration", "frequency"] as const) {
      const toggle = scheduleToggle(container, key);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(toggle.getAttribute("aria-controls")).toBe(
        `${key}-schedule-panel`
      );
      expect(
        container
          .querySelector(`#${key}-schedule-panel`)
          ?.hasAttribute("hidden")
      ).toBe(false);
      act(() => {
        toggle.click();
      });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(visibleText(toggle)).toBe(
        `Schedule (optional) · ${summaries[key]}`
      );
      expect(visibleText(toggle)).not.toContain("Not specified");
    }
  });

  it("toggles schedule independently and keeps values through collapse", () => {
    const seen = renderClinic([blank, weekly]);
    const blankInstruction = instructionToggle(container, "blank");
    const weeklyInstruction = instructionToggle(container, "weekly");
    const blankSchedule = scheduleToggle(container, "blank");
    const weeklySchedule = scheduleToggle(container, "weekly");

    expect(blankInstruction.getAttribute("aria-expanded")).toBe("false");
    expect(weeklyInstruction.getAttribute("aria-expanded")).toBe("false");
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("false");
    expect(weeklySchedule.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      blankInstruction.click();
    });
    expect(blankInstruction.getAttribute("aria-expanded")).toBe("true");
    expect(weeklyInstruction.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      blankSchedule.click();
    });
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("true");
    expect(weeklyInstruction.getAttribute("aria-expanded")).toBe("false");

    setControlValue(
      container.querySelector("#blank-duration") as HTMLInputElement,
      "2"
    );
    setControlValue(
      container.querySelector("#blank-unit") as HTMLSelectElement,
      "WEEKS"
    );
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      blankSchedule.click();
    });
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("false");
    expect(visibleText(blankSchedule)).toBe(
      "Schedule (optional) · For 2 weeks"
    );
    expect(
      (container.querySelector("#blank-duration") as HTMLInputElement).value
    ).toBe("2");
    expect(
      (container.querySelector("#blank-unit") as HTMLSelectElement).value
    ).toBe("WEEKS");
    act(() => {
      blankSchedule.click();
    });
    expect(
      (container.querySelector("#blank-duration") as HTMLInputElement).value
    ).toBe("2");
    expect(seen.at(-1)?.[0]?.homeCareInstructions[0]).toMatchObject({
      durationValue: "2",
      durationUnit: "WEEKS",
      frequencyCount: "",
      frequencyPeriod: "",
    });

    act(() => {
      blankInstruction.click();
    });
    expect(blankInstruction.getAttribute("aria-expanded")).toBe("false");
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("true");
    expect(
      (container.querySelector("#blank-duration") as HTMLInputElement).value
    ).toBe("2");

    setControlValue(
      container.querySelector("#blank-title") as HTMLInputElement,
      "Supported rest"
    );
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      blankSchedule.click();
    });
    setControlValue(
      container.querySelector("#blank-title") as HTMLInputElement,
      "Supported rest again"
    );
    expect(blankSchedule.getAttribute("aria-expanded")).toBe("false");
    expect(seen.at(-1)?.[0]?.homeCareInstructions[0]).toMatchObject({
      title: "Supported rest again",
      durationValue: "2",
      durationUnit: "WEEKS",
    });
  });

  it("keeps a closed schedule in the operator save payload", () => {
    const sections = [plan([weekly, blank])];
    act(() => {
      root.render(
        <CanonicalDraftEditor
          templateId="template"
          templateTitle="Synthetic plan"
          revisionId="revision"
          version={1}
          savedContentSignature={canonicalEditorContentSignature(sections)}
          initialSections={sections}
          isActive
          neverPublished
        />
      );
    });

    const weeklySchedule = scheduleToggle(container, "weekly");
    expect(weeklySchedule.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      weeklySchedule.click();
    });
    setControlValue(
      container.querySelector("#weekly-count") as HTMLInputElement,
      "5"
    );

    const hidden = container.querySelector(
      'input[name="sections"]'
    ) as HTMLInputElement;
    const payload = JSON.parse(hidden.value) as Array<{
      kind: string;
      homeCareInstructions: Array<{
        key: string;
        frequencyCount: number | null;
        frequencyPeriod: string | null;
        timingLabel: string | null;
        durationValue: number | null;
        durationUnit: string | null;
      }>;
    }>;
    const saved = payload.find((section) => section.kind === "HOME_CARE_PLAN");
    expect(weeklySchedule.getAttribute("aria-expanded")).toBe("false");
    expect(saved?.homeCareInstructions[0]).toMatchObject({
      key: "weekly",
      frequencyCount: 5,
      frequencyPeriod: "WEEK",
      durationValue: 4,
      durationUnit: "WEEKS",
    });
    expect(saved?.homeCareInstructions[1]).toMatchObject({
      key: "blank",
      frequencyCount: null,
      frequencyPeriod: null,
      timingLabel: null,
      durationValue: null,
      durationUnit: null,
    });
  });

  it("starts a new instruction with a collapsed schedule and still reorders", () => {
    renderClinic([blank, frequencyOnly]);
    const add = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Add instruction"
    ) as HTMLButtonElement;
    act(() => {
      add.click();
    });
    const added = container.querySelectorAll("[data-instruction-key]")[2];
    const addedKey = added?.getAttribute("data-instruction-key");
    expect(added?.getAttribute("data-expanded")).toBe("true");
    expect(
      scheduleToggle(container, addedKey ?? "").getAttribute("aria-expanded")
    ).toBe("false");
    expect(visibleText(scheduleToggle(container, addedKey ?? ""))).toBe(
      "Schedule (optional)"
    );

    const moveDown = [
      ...container.querySelectorAll(
        '[data-instruction-key="frequency"] button'
      ),
    ].find((button) => button.textContent === "Move down") as HTMLButtonElement;
    act(() => {
      scheduleToggle(container, "frequency").click();
    });
    expect(
      scheduleToggle(container, "frequency").getAttribute("aria-expanded")
    ).toBe("false");
    act(() => {
      moveDown.click();
    });
    const keys = [...container.querySelectorAll("[data-instruction-key]")].map(
      (node) => node.getAttribute("data-instruction-key")
    );
    expect(keys[0]).toBe("blank");
    expect(keys[1]).toBe(addedKey);
    expect(keys[2]).toBe("frequency");
    expect(
      scheduleToggle(container, "frequency").getAttribute("aria-expanded")
    ).toBe("false");
    expect(visibleText(scheduleToggle(container, "frequency"))).toBe(
      "Schedule (optional) · 3 times per week"
    );
    expect(
      (container.querySelector("#frequency-count") as HTMLInputElement).value
    ).toBe("3");

    const remove = [
      ...container.querySelectorAll(
        '[data-instruction-key="frequency"] button'
      ),
    ].find(
      (button) => button.textContent === "Remove instruction"
    ) as HTMLButtonElement;
    act(() => {
      remove.click();
    });
    expect(
      container.querySelector('[data-instruction-key="frequency"]')
    ).toBeNull();
    expect(container.querySelectorAll("[data-instruction-key]")).toHaveLength(
      2
    );
  });

  it("uses the same disclosure in the operator and clinic editors", () => {
    renderClinic([blank, daily, durationOnly]);
    const clinic = [blank, daily, durationOnly].map((item) => ({
      key: item.key,
      open: scheduleToggle(container, item.key).getAttribute("aria-expanded"),
      controls: scheduleToggle(container, item.key).getAttribute(
        "aria-controls"
      ),
    }));
    act(() => {
      scheduleToggle(container, "daily").click();
      scheduleToggle(container, "duration").click();
    });
    const clinicSummary = {
      blank: visibleText(scheduleToggle(container, "blank")),
      daily: visibleText(scheduleToggle(container, "daily")),
      duration: visibleText(scheduleToggle(container, "duration")),
    };

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    renderOperator([blank, daily, durationOnly]);
    const operator = [blank, daily, durationOnly].map((item) => ({
      key: item.key,
      open: scheduleToggle(container, item.key).getAttribute("aria-expanded"),
      controls: scheduleToggle(container, item.key).getAttribute(
        "aria-controls"
      ),
    }));
    act(() => {
      scheduleToggle(container, "daily").click();
      scheduleToggle(container, "duration").click();
    });

    expect(operator).toEqual(clinic);
    expect(visibleText(scheduleToggle(container, "blank"))).toBe(
      clinicSummary.blank
    );
    expect(visibleText(scheduleToggle(container, "daily"))).toBe(
      clinicSummary.daily
    );
    expect(visibleText(scheduleToggle(container, "duration"))).toBe(
      clinicSummary.duration
    );
    expect(clinicSummary.blank).toBe("Schedule (optional)");
    expect(clinicSummary.daily).toBe(
      "Schedule (optional) · Once daily · Evening · 7 days"
    );
    expect(clinicSummary.duration).toBe("Schedule (optional) · For 2 weeks");
  });

  it("discloses each instruction with a chevron without toggling from its actions", () => {
    renderClinic([
      instruction({ key: "one", title: "Your prescribed exercises" }),
      instruction({
        key: "two",
        title: "Exercises",
        frequencyCount: "3",
        frequencyPeriod: "WEEK",
        durationValue: "4",
        durationUnit: "WEEKS",
      }),
    ]);

    const first = instructionToggle(container, "one");
    const chevron = first.querySelector(".homeCareInstructionChevron");
    expect(chevron?.tagName.toLowerCase()).toBe("svg");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
    expect(chevron?.getAttribute("data-chevron")).toBe("right");
    expect(
      container.querySelectorAll(
        '[data-instruction-key="one"] .homeCareInstructionToggle'
      )
    ).toHaveLength(1);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(first.getAttribute("aria-label")).toBe(
      "Expand Your prescribed exercises"
    );
    expect(
      visibleText(first.querySelector(".homeCareInstructionSummary"))
    ).toBe("Instruction 1 · Your prescribed exercises");

    act(() => {
      first.click();
    });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(chevron?.getAttribute("data-chevron")).toBe("down");
    expect(first.getAttribute("aria-label")).toBe(
      "Collapse Your prescribed exercises"
    );

    act(() => {
      first.focus();
      const space = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      first.dispatchEvent(space);
      if (!space.defaultPrevented) {
        first.click();
      }
    });
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(chevron?.getAttribute("data-chevron")).toBe("right");

    act(() => {
      const enter = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      first.dispatchEvent(enter);
      if (!enter.defaultPrevented) {
        first.click();
      }
    });
    expect(first.getAttribute("aria-expanded")).toBe("true");

    const second = instructionToggle(container, "two");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-label")).toBe(
      "Expand Exercises · 3 times per week · 4 weeks"
    );
    expect(
      visibleText(second.querySelector(".homeCareInstructionSummary"))
    ).toBe("Exercises · 3 times per week · 4 weeks");
    const moveDown = [
      ...container.querySelectorAll('[data-instruction-key="one"] button'),
    ].find((button) => button.textContent === "Move down") as HTMLButtonElement;
    act(() => {
      moveDown.click();
    });
    expect(
      instructionToggle(container, "one").getAttribute("aria-expanded")
    ).toBe("true");
    expect(
      instructionToggle(container, "two").getAttribute("aria-expanded")
    ).toBe("false");
    const remove = [
      ...container.querySelectorAll('[data-instruction-key="two"] button'),
    ].find(
      (button) => button.textContent === "Remove instruction"
    ) as HTMLButtonElement;
    act(() => {
      remove.click();
    });
    expect(container.querySelector('[data-instruction-key="two"]')).toBeNull();
    expect(
      instructionToggle(container, "one").getAttribute("aria-expanded")
    ).toBe("true");

    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toContain(
      '.homeCareInstructionToggle[aria-expanded="true"] .homeCareInstructionChevron'
    );
    expect(css).toContain("transform: rotate(90deg);");
    expect(
      homeCareInstructionDisclosureName({
        open: false,
        summary: "Instruction 1 · Your prescribed exercises",
        title: "Your prescribed exercises",
        index: 0,
      })
    ).toBe("Expand Your prescribed exercises");
  });
});
