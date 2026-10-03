/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GuideActionState } from "@/app/(staff)/(clinic-portal)/guides/actions";
import type { CanonicalGuideTemplateOption } from "@/lib/clinic-portal/list-canonical-templates";
import type { GuideAllowanceSummary } from "@/lib/entitlements/guide-usage";

const createGuideFromTemplateAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/(staff)/(clinic-portal)/guides/actions", () => ({
  createCustomGuideAction: async () => ({}),
  createGuideFromTemplateAction,
}));

import { CreateGuideForm } from "@/app/(staff)/(clinic-portal)/guides/create-guide-form";

const HOME_EXERCISE = "guide_tmpl_demo_physio_home_exercise";
const EXTRACTION = "guide_tmpl_demo_extraction";

const allowance: GuideAllowanceSummary = {
  governed: true,
  commercialPlan: "ESSENTIAL",
  customGuides: {
    used: 0,
    baseLimit: 1,
    extraAllowance: 0,
    planLimit: 1,
    remainingPlaces: 1,
    atLimit: false,
    usageLabel: null,
    limitMessage: null,
  },
  adaptedTemplates: {
    used: 0,
    baseLimit: 1,
    extraAllowance: 0,
    planLimit: 1,
    remainingPlaces: 1,
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

const templates: CanonicalGuideTemplateOption[] = [
  {
    id: HOME_EXERCISE,
    slug: "home-exercise-plan",
    title: "Physiotherapy Home Exercise Plan",
    serviceCategory: "PHYSIOTHERAPY",
    availability: "sample",
    alreadyEnabled: false,
  },
  {
    id: EXTRACTION,
    slug: "extraction",
    title: "Tooth Extraction",
    serviceCategory: "DENTAL",
    availability: "sample",
    alreadyEnabled: false,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function templateForm(container: HTMLElement, templateId: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="templateId"][value="${templateId}"]`
  );
  const form = input?.closest("form");
  if (!form) {
    throw new Error(`Missing form for ${templateId}`);
  }
  return form;
}

function templateButton(container: HTMLElement, templateId: string) {
  const button = templateForm(container, templateId).querySelector("button");
  if (!button) {
    throw new Error(`Missing button for ${templateId}`);
  }
  return button;
}

describe("create guide from template pending state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    createGuideFromTemplateAction.mockReset();
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

  async function renderForm() {
    await act(async () => {
      root.render(
        <CreateGuideForm
          templates={templates}
          isDemoTenant
          templatesNeedServiceCategories={false}
          serviceCategories={["PHYSIOTHERAPY", "DENTAL"]}
          allowance={allowance}
          contactHref="/contact"
        />
      );
    });
  }

  it("shows the spinner and Creating… only on the selected template", async () => {
    const pending = deferred<GuideActionState>();
    createGuideFromTemplateAction.mockImplementation(() => pending.promise);
    await renderForm();

    const selected = templateButton(container, HOME_EXERCISE);
    const other = templateButton(container, EXTRACTION);
    expect(selected.textContent).toBe("Create from template");
    expect(other.textContent).toBe("Create from template");
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();

    await act(async () => {
      selected.click();
    });

    expect(createGuideFromTemplateAction).toHaveBeenCalledTimes(1);
    const formData = createGuideFromTemplateAction.mock
      .calls[0]?.[1] as FormData;
    expect(formData.get("templateId")).toBe(HOME_EXERCISE);
    expect(selected.textContent).toBe("Creating…");
    expect(selected.disabled).toBe(true);
    expect(selected.getAttribute("aria-busy")).toBe("true");
    expect(selected.querySelector(".staffBtnSpinner")).not.toBeNull();
    expect(
      selected.querySelector(".staffBtnSpinner")?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(other.textContent).toBe("Create from template");
    expect(other.disabled).toBe(true);
    expect(other.getAttribute("aria-busy")).toBeNull();
    expect(other.querySelector(".staffBtnSpinner")).toBeNull();
    expect(container.querySelectorAll(".staffBtnSpinner")).toHaveLength(1);

    await act(async () => {
      pending.resolve({});
    });
  });

  it("creates from the selected template and restores both buttons", async () => {
    const pending = deferred<GuideActionState>();
    createGuideFromTemplateAction.mockImplementation(() => pending.promise);
    await renderForm();

    await act(async () => {
      templateButton(container, HOME_EXERCISE).click();
    });
    await act(async () => {
      pending.resolve({});
    });

    expect(createGuideFromTemplateAction).toHaveBeenCalledTimes(1);
    const selected = templateButton(container, HOME_EXERCISE);
    const other = templateButton(container, EXTRACTION);
    expect(selected.textContent).toBe("Create from template");
    expect(other.textContent).toBe("Create from template");
    expect(selected.disabled).toBe(false);
    expect(other.disabled).toBe(false);
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("restores the idle labels and shows the error when creation fails", async () => {
    const pending = deferred<GuideActionState>();
    createGuideFromTemplateAction.mockImplementation(() => pending.promise);
    await renderForm();

    await act(async () => {
      templateButton(container, EXTRACTION).click();
    });
    expect(templateButton(container, EXTRACTION).textContent).toBe("Creating…");
    expect(templateButton(container, HOME_EXERCISE).textContent).toBe(
      "Create from template"
    );

    await act(async () => {
      pending.resolve({ error: "That template is not available." });
    });

    const selected = templateButton(container, EXTRACTION);
    const other = templateButton(container, HOME_EXERCISE);
    expect(selected.textContent).toBe("Create from template");
    expect(other.textContent).toBe("Create from template");
    expect(selected.disabled).toBe(false);
    expect(other.disabled).toBe(false);
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
    const alerts = container.querySelectorAll("[role='alert']");
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.textContent).toBe("That template is not available.");
    }
  });

  it("ignores a second submit while a template is being created", async () => {
    const pending = deferred<GuideActionState>();
    createGuideFromTemplateAction.mockImplementation(() => pending.promise);
    await renderForm();

    const selectedForm = templateForm(container, HOME_EXERCISE);
    const otherForm = templateForm(container, EXTRACTION);
    await act(async () => {
      selectedForm.requestSubmit();
      selectedForm.requestSubmit();
      otherForm.requestSubmit();
    });

    expect(createGuideFromTemplateAction).toHaveBeenCalledTimes(1);
    const formData = createGuideFromTemplateAction.mock
      .calls[0]?.[1] as FormData;
    expect(formData.get("templateId")).toBe(HOME_EXERCISE);
    expect(templateButton(container, HOME_EXERCISE).textContent).toBe(
      "Creating…"
    );
    expect(templateButton(container, EXTRACTION).textContent).toBe(
      "Create from template"
    );
    expect(templateButton(container, EXTRACTION).disabled).toBe(true);

    await act(async () => {
      pending.resolve({});
    });
    expect(templateButton(container, HOME_EXERCISE).disabled).toBe(false);
    expect(templateButton(container, EXTRACTION).disabled).toBe(false);
  });
});
