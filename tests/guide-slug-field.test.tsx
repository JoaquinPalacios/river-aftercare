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
