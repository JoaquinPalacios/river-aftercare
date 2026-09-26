/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/(staff)/(clinic-portal)/guides/actions", () => ({
  createCustomGuideAction: async () => ({}),
  createGuideFromTemplateAction: async () => ({}),
  deleteGuideAction: async () => ({}),
  discardGuideDraftChangesAction: async () => ({}),
  publishGuideAction: async () => ({}),
  saveGuideDraftAction: async () => ({}),
  unpublishGuideAction: async () => ({}),
}));

import { CreateGuideForm } from "@/app/(staff)/(clinic-portal)/guides/create-guide-form";
import { GuideEditor } from "@/app/(staff)/(clinic-portal)/guides/guide-editor";
import type { PracticeGuideEditorRecord } from "@/lib/clinic-portal/load-practice-guide-editor";
import type { GuideAllowanceSummary } from "@/lib/entitlements/guide-usage";
import { PracticeGuideStatus } from "@prisma/client";

const allowance: GuideAllowanceSummary = {
  governed: false,
  commercialPlan: null,
  customGuides: {
    used: 0,
    baseLimit: null,
    extraAllowance: null,
    planLimit: null,
    remainingPlaces: null,
    atLimit: false,
    usageLabel: null,
    limitMessage: null,
  },
  adaptedTemplates: {
    used: 0,
    baseLimit: null,
    extraAllowance: null,
    planLimit: null,
    remainingPlaces: null,
    atLimit: false,
    usageLabel: null,
    limitMessage: null,
  },
  combinedGuides: {
    used: 0,
    baseLimit: null,
    extraAllowance: null,
    planLimit: null,
    remainingPlaces: null,
    atLimit: false,
    usageLabel: null,
    limitMessage: null,
  },
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("guide slug fields", () => {
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

  async function renderCreateForm() {
    await act(async () => {
      root.render(
        <CreateGuideForm
          templates={[]}
          isDemoTenant={false}
          allowance={allowance}
          contactHref="/contact"
        />
      );
    });
  }

  it("suggests a slug from the name until the slug is edited", async () => {
    await renderCreateForm();
    const title = container.querySelector("#title") as HTMLInputElement;
    const slug = container.querySelector("#publicSlug") as HTMLInputElement;

    expect(slug.value).toBe("");
    expect(container.querySelector("#publicSlug-hint")?.textContent).toContain(
      "patient guide URL"
    );

    await act(async () => {
      setInputValue(title, "Wisdom Teeth");
    });
    expect(slug.value).toBe("wisdom-teeth");

    await act(async () => {
      setInputValue(title, "Wisdom Teeth Removal");
    });
    expect(slug.value).toBe("wisdom-teeth-removal");

    await act(async () => {
      setInputValue(slug, "wisdom-teeth-care");
    });
    await act(async () => {
      setInputValue(title, "Wisdom Teeth Removal Aftercare");
    });
    expect(slug.value).toBe("wisdom-teeth-care");
  });

  it("cancels creation back to Guides without submitting", async () => {
    await renderCreateForm();
    const form = container.querySelector("#title")!.closest("form")!;
    let submitted = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted += 1;
    });

    const cancel = form.querySelector("a");
    const submit = form.querySelector('button[type="submit"]');
    const row = cancel?.parentElement;

    expect(cancel?.textContent).toBe("Cancel");
    expect(cancel?.getAttribute("href")).toBe("/guides");
    expect(cancel?.tagName).toBe("A");
    expect(cancel?.getAttribute("type")).toBeNull();
    expect(cancel?.className).toContain("staffBtnSecondary");
    expect(cancel?.className).not.toContain("staffBtnPrimary");
    expect(cancel?.className).toContain("w-full");
    expect(cancel?.className).toContain("sm:w-auto");

    expect(submit?.textContent).toBe("Create custom guide");
    expect(submit?.className).toContain("staffBtnPrimary");
    expect(submit?.className).not.toContain("staffBtnSecondary");
    expect(submit?.className).toContain("w-full");
    expect(submit?.className).toContain("sm:w-auto");

    expect(row?.className).toContain("flex-col-reverse");
    expect(row?.className).toContain("sm:flex-row");
    expect(row?.className).not.toContain("sm:flex-row-reverse");
    expect(row?.children[0]).toBe(cancel);
    expect(row?.children[1]).toBe(submit);

    cancel?.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await act(async () => {
      cancel?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });
    expect(submitted).toBe(0);
  });

  it("keeps a cleared slug blank instead of filling it from the name again", async () => {
    await renderCreateForm();
    const title = container.querySelector("#title") as HTMLInputElement;
    const slug = container.querySelector("#publicSlug") as HTMLInputElement;

    await act(async () => {
      setInputValue(title, "Wisdom Teeth Removal");
    });
    await act(async () => {
      setInputValue(slug, "");
    });
    await act(async () => {
      setInputValue(title, "Wisdom Teeth Removal Aftercare");
    });

    expect(slug.value).toBe("");
    expect(slug.required).toBe(true);
  });

  it("does not change an existing guide slug when the title changes", async () => {
    const guide: PracticeGuideEditorRecord = {
      id: "guide_1",
      clinicId: "clinic_1",
      title: "Wisdom Teeth Removal",
      publicSlug: "wisdom-teeth-removal",
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
      reviewAttestation: null,
      sections: [],
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    };

    await act(async () => {
      root.render(
        <GuideEditor
          guide={guide}
          patientUrlExample="https://harbour.example.test/wisdom-teeth-removal"
          canEdit
        />
      );
    });

    const title = container.querySelector("#title") as HTMLInputElement;
    const slug = container.querySelector("#publicSlug") as HTMLInputElement;
    expect(slug.disabled).toBe(false);
    expect(slug.value).toBe("wisdom-teeth-removal");

    await act(async () => {
      setInputValue(title, "Wisdom Teeth Removal Aftercare");
    });

    expect(slug.value).toBe("wisdom-teeth-removal");
    expect(container.textContent).toContain(
      "https://harbour.example.test/wisdom-teeth-removal"
    );
    expect(container.textContent).not.toContain(
      "wisdom-teeth-removal-aftercare"
    );
  });
});
