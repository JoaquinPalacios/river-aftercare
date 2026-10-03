/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushMock, replace: vi.fn() }),
}));

vi.mock("@/app/(staff)/(clinic-portal)/guides/actions", () => ({
  deleteGuideAction: async () => ({}),
  discardGuideDraftChangesAction: async () => ({}),
  publishGuideAction: async () => ({}),
  saveGuideDraftAction: async () => ({}),
  unpublishGuideAction: async () => ({}),
}));

import { GuideEditor } from "@/app/(staff)/(clinic-portal)/guides/guide-editor";
import type { PracticeGuideEditorRecord } from "@/lib/clinic-portal/load-practice-guide-editor";
import { PracticeGuideStatus } from "@prisma/client";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

function guide(
  overrides: Partial<PracticeGuideEditorRecord> = {}
): PracticeGuideEditorRecord {
  return {
    id: "guide_1",
    clinicId: "clinic_1",
    title: "Socket care",
    publicSlug: "socket-care",
    introduction: "Keep the area clean.",
    status: PracticeGuideStatus.DRAFT,
    isEnabled: false,
    isPublished: false,
    hasDraftChanges: false,
    lifecycle: "draft",
    statusLabel: "Draft",
    template: null,
    adaptedFromTemplate: false,
    downgradeRetainedAt: null,
    downgradeRetentionUntil: null,
    serviceCategory: "DENTAL",
    categoryEditable: false,
    sections: [],
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

const warningFirst: ComposedGuideSection[] = [
  {
    key: "warn",
    kind: "WARNING_SIGNS",
    title: "Call the clinic",
    body: "Bleeding that does not slow.",
    periodLabel: null,
    provenance: "practice_custom",
  },
  {
    key: "stage",
    kind: "RECOVERY_TIMELINE",
    title: "First day",
    body: "Rest.",
    periodLabel: "Day 0",
    startDay: 0,
    endDay: 1,
    provenance: "practice_custom",
  },
  {
    key: "urgent",
    kind: "EMERGENCY",
    title: "Seek emergency care",
    body: "Trouble breathing.",
    periodLabel: null,
    provenance: "practice_custom",
  },
];

const homeExercise: ComposedGuideSection[] = [
  {
    key: "plan",
    kind: "HOME_CARE_PLAN",
    title: "Home exercise plan",
    body: "Move within comfort.",
    periodLabel: null,
    provenance: "practice_custom",
    homeCareInstructions: [
      {
        key: "item-blank",
        title: "Rest position",
        body: "Support the arm.",
        frequencyCount: null,
        frequencyPeriod: null,
        timingLabel: null,
        durationValue: null,
        durationUnit: null,
        sortOrder: 0,
      },
      {
        key: "item-set",
        title: "Shoulder raises",
        body: null,
        frequencyCount: 3,
        frequencyPeriod: "WEEK",
        timingLabel: null,
        durationValue: 4,
        durationUnit: "WEEKS",
        sortOrder: 1,
      },
    ],
  },
];

describe("clinic guide editor alignment", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
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

  function button(label: string) {
    return [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes(label)
    );
  }

  it("keeps saved section order and separates emergency from warning signs", async () => {
    await act(async () => {
      root.render(
        <GuideEditor
          guide={guide({ sections: warningFirst, title: "Tooth Extraction" })}
          patientUrlExample="https://harbour.example.test/socket-care"
          canEdit
        />
      );
    });

    const payload = JSON.parse(
      (container.querySelector('input[name="sections"]') as HTMLInputElement)
        .value
    ) as Array<{ key: string; kind: string }>;
    expect(payload.map((section) => section.key)).toEqual([
      "warn",
      "stage",
      "urgent",
    ]);
    expect(
      container.querySelector('[data-section-kind="WARNING_SIGNS"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section-kind="EMERGENCY"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-block-accent="warning"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-block-accent="emergency"]')
    ).toBeTruthy();
    expect(container.textContent).not.toContain(
      "This guide does not include a recovery timeline."
    );
    expect(button("Add timeline stage")).toBeTruthy();
  });

  it("does not offer a recovery timeline on a physiotherapy home exercise plan", async () => {
    await act(async () => {
      root.render(
        <GuideEditor
          guide={guide({
            title: "Physiotherapy Home Exercise Plan",
            publicSlug: "home-exercise-plan",
            serviceCategory: "PHYSIOTHERAPY",
            sections: homeExercise,
          })}
          patientUrlExample="https://harbour.example.test/home-exercise-plan"
          canEdit
        />
      );
    });

    expect(button("Add timeline stage")).toBeUndefined();
    expect(container.textContent).toContain(
      "This guide does not include a recovery timeline."
    );
    expect(button("Add home-care plan")).toBeTruthy();
    const schedules = [
      ...container.querySelectorAll(".homeCareScheduleToggle"),
    ] as HTMLButtonElement[];
    expect(schedules).toHaveLength(2);
    expect(schedules[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(schedules[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("3 times per week");
    expect(container.textContent).toContain("4 weeks");
  });

  it("asks to save before leaving and keeps a linked template distinct from an adapted copy", async () => {
    await act(async () => {
      root.render(
        <GuideEditor
          guide={guide({
            template: {
              id: "tmpl_1",
              slug: "extraction",
              title: "Tooth Extraction",
            },
            adaptedFromTemplate: false,
          })}
          patientUrlExample="https://demodental.example.test/extraction"
          canEdit
        />
      );
    });

    expect(container.textContent).toContain(
      "Linked to the River template “Tooth Extraction”."
    );
    expect(container.textContent).not.toContain("Clinic-owned copy");

    const title = container.querySelector("#title") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    await act(async () => {
      setter?.call(title, "Tooth Extraction edited");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(title.value).toBe("Tooth Extraction edited");
    expect(
      container
        .querySelector("[data-save-state]")
        ?.getAttribute("data-save-state")
    ).toBe("unsaved");
    await act(async () => {
      button("Cancel")?.click();
    });

    const dialog = [...container.querySelectorAll("dialog")].find((item) =>
      item.textContent?.includes("Save changes before leaving?")
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain("Save changes before leaving?");
    expect(dialog?.textContent).toContain("Save and leave");
    expect(dialog?.textContent).toContain("Leave without saving");
    expect(dialog?.textContent).toContain("Stay");
  });
});
