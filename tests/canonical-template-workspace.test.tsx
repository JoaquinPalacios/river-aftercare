/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock("@/app/(staff)/(operator)/operator/templates/actions", () => ({
  saveCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  publishCanonicalTemplateRevisionAction: vi.fn(async () => ({})),
  abandonCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  createCanonicalTemplateDraftAction: vi.fn(async () => ({})),
  deactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  reactivateCanonicalTemplateAction: vi.fn(async () => ({})),
  updateLiveDemoAction: vi.fn(async () => ({})),
}));

import { CanonicalDraftEditor } from "@/app/(staff)/(operator)/operator/templates/canonical-draft-editor";
import { TemplateDemoAdoption } from "@/app/(staff)/(operator)/operator/templates/template-demo-adoption";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { canonicalEditorContentSignature } from "@/lib/aftercare/canonical-editor-content";
import { designatedDemoForCategory } from "@/lib/demo-adoption/designated-demos";
import {
  liveDemoCurrency,
  liveDemoUpdateOffered,
} from "@/lib/demo-adoption/live-demo-currency";
import type { DesignatedDemoAdoptionView } from "@/lib/demo-adoption/load-designated-demo-adoption";

let container: HTMLDivElement;
let root: Root;

const sections: EditorSection[] = [
  {
    key: "intro",
    kind: "INTRODUCTION",
    title: "After a tooth extraction",
    body: "Rest for the first day.",
    periodLabel: "",
    startDay: "",
    endDay: "",
    homeCareInstructions: [],
  },
];

function adoption(
  overrides: Partial<DesignatedDemoAdoptionView> = {}
): DesignatedDemoAdoptionView {
  return {
    clinicName: "Riverside Dental Demo",
    clinicSlug: "demodental",
    publicSlug: "extraction",
    pinnedRevisionId: "canonical-v1",
    pinnedRevisionVersion: 1,
    publishedPracticeGuideRevisionId: "practice-v1",
    publishedPracticeGuideRevisionVersion: 1,
    latestPublishedRevisionId: "canonical-v2",
    latestPublishedRevisionVersion: 2,
    alreadyCurrent: false,
    overrides: [
      {
        sectionKey: "first-24-hours",
        title: "The first day at Riverside Dental Demo",
      },
    ],
    additions: [
      {
        key: "weekend-contact",
        title: "Weekend contact",
        insertAfterSectionKey: "contact-practice",
      },
    ],
    blocker: null,
    proposedSections: [],
    canUpdate: true,
    ...overrides,
  };
}

describe("canonical template workspace classification and live demo", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLElement.prototype.scrollIntoView = () => undefined;
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    push.mockReset();
    refresh.mockReset();
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

  it("shows Sample and Draft while editing, and keeps Publish separate from the demo", () => {
    renderDraft({ isSample: true });
    expect(statusPills()).toEqual(["Sample", "Draft"]);
    expect(container.querySelector("[data-update-live-demo]")).toBeNull();
    expect(container.textContent).not.toContain("Live demo is up to date");
    expect(container.textContent).not.toContain(
      "Live demo has an older published revision"
    );
    expect(updateDialog()).toBeUndefined();
    const publish = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish"
    );
    expect(publish).toBeTruthy();
    expect(container.querySelector("#publish-revision-form")).toBeTruthy();
    expect(
      container.querySelector('input[name="canonicalRevisionId"]')
    ).toBeNull();
  });

  it("shows Production and Draft for an editable production template", () => {
    renderDraft({ isSample: false });
    expect(statusPills()).toEqual(["Production", "Draft"]);
    expect(container.querySelector("[data-update-live-demo]")).toBeNull();
  });

  it("shows Sample and Published for a read-only sample with no designated demo", () => {
    renderPublished({ isSample: true, demoAdoption: null });
    expect(statusPills()).toEqual(["Sample", "Published"]);
    expect(container.textContent).toContain("Tooth Extraction");
    expect(container.querySelector("[data-update-live-demo]")).toBeNull();
    expect(container.querySelector("[data-live-demo-currency]")).toBeNull();
    expect(updateDialog()).toBeUndefined();
    expect(container.querySelector("#canonical-draft-form")).toBeNull();
    expect(
      container.querySelector("#create-published-revision-form")
    ).toBeTruthy();
  });

  it("shows Production and Published and does not offer a live demo update", () => {
    renderPublished({
      isSample: false,
      templateTitle: "Physiotherapy Home Exercise Plan",
      demoAdoption: adoption(),
    });
    expect(statusPills()).toEqual(["Production", "Published"]);
    expect(container.querySelector("[data-update-live-demo]")).toBeNull();
    expect(container.querySelector("[data-live-demo-currency]")).toBeNull();
    expect(updateDialog()).toBeUndefined();
  });

  it("opens the existing confirmation when the designated demo is on an older revision", () => {
    renderPublished({
      isSample: true,
      demoAdoption: adoption(),
      demoPublicUrl: "http://demodental.localhost:3000/extraction",
    });
    expect(statusPills()).toEqual(["Sample", "Published"]);
    expect(
      container.querySelector("[data-live-demo-currency]")?.textContent
    ).toBe("Live demo has an older published revision");
    expect(
      container
        .querySelector("[data-live-demo-currency]")
        ?.getAttribute("data-live-demo-currency")
    ).toBe("older");

    const button = container.querySelector(
      "[data-update-live-demo]"
    ) as HTMLButtonElement;
    expect(button.textContent).toBe("Update live demo");
    expect(button.type).toBe("button");
    expect(button.getAttribute("form")).toBeNull();
    expect(updateDialog()?.hasAttribute("open")).toBe(false);

    act(() => {
      button.click();
    });

    const dialog = updateDialog();
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain("Update live demo?");
    expect(dialog?.textContent).toContain(
      "publishes a new practice-guide revision for the designated demo"
    );
    expect(dialog?.textContent).toContain("Riverside Dental Demo");
    expect(dialog?.textContent).toContain(
      "http://demodental.localhost:3000/extraction"
    );
    expect(dialog?.textContent).toContain("Pinned canonical revision");
    expect(dialog?.textContent).toContain("Revision 1");
    expect(dialog?.textContent).toContain("Revision 2");
    expect(dialog?.textContent).toContain("Already up to date");
    expect(dialog?.textContent).toContain(
      "first-24-hours: The first day at Riverside Dental Demo"
    );
    expect(dialog?.textContent).toContain(
      "Weekend contact after contact-practice"
    );
    expect(
      (
        container.querySelector(
          "input[name='canonicalRevisionId']"
        ) as HTMLInputElement
      ).value
    ).toBe("canonical-v2");
    expect(
      (
        container.querySelector(
          "input[name='expectedPinnedRevisionId']"
        ) as HTMLInputElement
      ).value
    ).toBe("canonical-v1");
    expect(
      (
        container.querySelector(
          "input[name='expectedPublishedPracticeGuideRevisionId']"
        ) as HTMLInputElement
      ).value
    ).toBe("practice-v1");
    expect(push).not.toHaveBeenCalled();

    const cancel = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (control) => control.textContent === "Cancel"
    ) as HTMLButtonElement;
    act(() => {
      cancel.click();
    });
    expect(updateDialog()?.hasAttribute("open")).toBe(false);
    expect(container.querySelector("#publish-revision-form")).toBeNull();
  });

  it("says the designated demo is up to date and reuses that confirmation copy", () => {
    renderPublished({
      isSample: true,
      demoAdoption: adoption({
        alreadyCurrent: true,
        pinnedRevisionId: "canonical-v2",
        pinnedRevisionVersion: 2,
        latestPublishedRevisionId: "canonical-v2",
        latestPublishedRevisionVersion: 2,
      }),
    });
    expect(
      container.querySelector("[data-live-demo-currency]")?.textContent
    ).toBe("Live demo is up to date");
    const button = container.querySelector(
      "[data-update-live-demo]"
    ) as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(updateDialog()?.textContent).toContain(
      "The live demo already uses this published sample revision. Confirming will not create another revision."
    );
  });

  it("keeps an ineligible designated demo visible without an update button", () => {
    renderPublished({
      isSample: true,
      demoAdoption: adoption({
        canUpdate: false,
        blocker:
          "This demo guide was adapted from the sample. Update live demo does not overwrite an adapted guide.",
      }),
    });
    expect(statusPills()).toEqual(["Sample", "Published"]);
    expect(
      container.querySelector("[data-live-demo-currency]")?.textContent
    ).toBe("Live demo has an older published revision");
    expect(container.textContent).toContain(
      "Update live demo does not overwrite an adapted guide."
    );
    expect(container.querySelector("[data-update-live-demo]")).toBeNull();
    expect(updateDialog()).toBeUndefined();
  });
});

describe("template overview live demo", () => {
  let overview: HTMLDivElement;
  let overviewRoot: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    overview = document.createElement("div");
    document.body.appendChild(overview);
    overviewRoot = createRoot(overview);
  });

  afterEach(() => {
    act(() => {
      overviewRoot.unmount();
    });
    overview.remove();
  });

  it("keeps the overview confirmation on the same update action", () => {
    act(() => {
      overviewRoot.render(
        <TemplateDemoAdoption
          templateId="guide_tmpl_demo_extraction"
          adoption={adoption()}
          publicUrl="http://demodental.localhost:3000/extraction"
        />
      );
    });
    expect(overview.textContent).toContain(
      "Publishing a sample revision does not change the public demo."
    );
    expect(overview.textContent).toContain("Open live demo");
    expect(overview.textContent).toContain("Preview proposed content");
    const button = overview.querySelector(
      "[data-update-live-demo]"
    ) as HTMLButtonElement;
    act(() => {
      button.click();
    });
    const dialog = [...overview.querySelectorAll("dialog")].find((node) =>
      node.textContent?.includes("Update live demo?")
    );
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain("Pinned canonical revision");
    expect(
      overview.querySelector("#update-live-demo-guide_tmpl_demo_extraction")
    ).toBeTruthy();
    expect(
      (
        overview.querySelector(
          "input[name='canonicalRevisionId']"
        ) as HTMLInputElement
      ).value
    ).toBe("canonical-v2");
  });
});

describe("live demo eligibility", () => {
  it("offers an update only when the adoption read model allows it", () => {
    expect(liveDemoUpdateOffered(null)).toBe(false);
    expect(liveDemoUpdateOffered({ canUpdate: false })).toBe(false);
    expect(liveDemoUpdateOffered({ canUpdate: true })).toBe(true);
    expect(designatedDemoForCategory("DENTAL")?.clinicSlug).toBe("demodental");
    expect(designatedDemoForCategory("PHYSIOTHERAPY")).toBeNull();
    expect(designatedDemoForCategory("CHIROPRACTIC")).toBeNull();
    expect(designatedDemoForCategory("COSMETIC_AESTHETIC")).toBeNull();
  });

  it("distinguishes an up-to-date demo from an older published revision", () => {
    expect(
      liveDemoCurrency({
        alreadyCurrent: true,
        pinnedRevisionVersion: 2,
        latestPublishedRevisionVersion: 2,
      })
    ).toBe("current");
    expect(
      liveDemoCurrency({
        alreadyCurrent: false,
        pinnedRevisionVersion: 1,
        latestPublishedRevisionVersion: 2,
      })
    ).toBe("older");
    expect(
      liveDemoCurrency({
        alreadyCurrent: false,
        pinnedRevisionVersion: 2,
        latestPublishedRevisionVersion: 2,
      })
    ).toBeNull();
    expect(
      liveDemoCurrency({
        alreadyCurrent: false,
        pinnedRevisionVersion: null,
        latestPublishedRevisionVersion: 2,
      })
    ).toBeNull();
  });

  it("loads the designated demo only for the published workspace", () => {
    const page = readFileSync(
      "app/(staff)/(operator)/operator/templates/[templateId]/draft/page.tsx",
      "utf8"
    );
    expect(page).toContain("requirePlatformOperator");
    expect(page).toContain("isSample={template.isSample}");
    expect(page).toContain("loadDesignatedDemoAdoption");
    expect(page).toContain("const demoAdoption = publishedWorkspace");
    expect(page).toContain("demoAdoption={demoAdoption}");
    expect(page).not.toContain("adoptPublishedSampleForDesignatedDemo");
    expect(page).not.toContain("publishCanonicalTemplateRevision");
  });
});

function renderDraft({ isSample }: { isSample: boolean }) {
  act(() => {
    root.render(
      <CanonicalDraftEditor
        templateId="guide_tmpl_demo_extraction"
        templateTitle="Tooth Extraction"
        revisionId="revision"
        version={2}
        savedContentSignature={canonicalEditorContentSignature(sections)}
        initialSections={sections}
        isActive
        isSample={isSample}
        neverPublished={false}
      />
    );
  });
}

function renderPublished({
  isSample,
  templateTitle = "Tooth Extraction",
  demoAdoption = null,
  demoPublicUrl = null,
}: {
  isSample: boolean;
  templateTitle?: string;
  demoAdoption?: DesignatedDemoAdoptionView | null;
  demoPublicUrl?: string | null;
}) {
  act(() => {
    root.render(
      <CanonicalDraftEditor
        mode="published"
        templateId="guide_tmpl_demo_extraction"
        templateTitle={templateTitle}
        initialSections={sections}
        isActive
        isSample={isSample}
        demoAdoption={demoAdoption}
        demoPublicUrl={demoPublicUrl}
      />
    );
  });
}

function statusPills() {
  return [
    ...container.querySelectorAll("[data-canonical-toolbar] .staffStatusPill"),
  ].map((pill) => pill.textContent);
}

function updateDialog() {
  return [...document.querySelectorAll("dialog")].find((dialog) =>
    dialog.textContent?.includes("Update live demo?")
  );
}
