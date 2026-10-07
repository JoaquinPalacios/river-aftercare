/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/account/help/actions", () => ({
  submitHelpFeedbackAction: actionMock,
}));

import { HelpFeedbackForm } from "@/app/(staff)/account/help/help-feedback-form";
import {
  HELP_FEEDBACK_DELIVERY_FAILED,
  HELP_FEEDBACK_FEATURE_ACKNOWLEDGEMENT,
  HELP_FEEDBACK_SENT_MESSAGE,
} from "@/lib/support/help-feedback-fields";

const REMOVED_PATIENT_WARNING =
  "Please do not include patient names, medical information, photos, or other patient-identifiable information in this message.";

describe("Help & feedback form", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    actionMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderForm() {
    await act(async () => {
      root.render(<HelpFeedbackForm originPath="/guides" />);
    });
  }

  function buttonNamed(name: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(name)
    );
    expect(button).toBeTruthy();
    return button as HTMLButtonElement;
  }

  async function setControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    await act(async () => {
      setter?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("keeps category cards as pressed buttons with hover and keyboard focus", async () => {
    await renderForm();
    const names = ["Report a problem", "Ask a question", "Suggest a feature"];
    const cards = names.map(buttonNamed);
    const group = container.querySelector('[aria-label="What do you need?"]');
    expect(group?.className).toContain("sm:grid-cols-3");
    expect(group?.className).not.toMatch(/(?:^|\s)grid-cols-3(?:\s|$)/);

    for (const card of cards) {
      expect(card.type).toBe("button");
      expect(card.getAttribute("aria-pressed")).toBe("false");
      expect(card.classList.contains("helpCategoryCard")).toBe(true);
    }

    await act(async () => {
      cards[1].click();
    });
    expect(cards[0].getAttribute("aria-pressed")).toBe("false");
    expect(cards[1].getAttribute("aria-pressed")).toBe("true");
    expect(cards[2].getAttribute("aria-pressed")).toBe("false");

    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toContain('.helpCategoryCard:not([aria-pressed="true"]):hover');
    expect(css).toContain('.helpCategoryCard[aria-pressed="true"]');
    expect(css).toContain(".helpCategoryCard:focus-visible");
    expect(css).toContain(
      "outline: var(--interaction-focus-width) solid var(--staff-brand);"
    );
    expect(css).toContain(
      "border-color: color-mix(in srgb, var(--staff-brand) 55%, var(--staff-line));"
    );
    expect(css).toContain(
      "background: color-mix(in srgb, var(--staff-brand) 10%, var(--staff-panel));"
    );
    const form = container.querySelector("form");
    expect(form?.className).toContain("helpFeedbackForm");
    expect(form?.className).not.toContain("max-w-xl");
    expect(form?.className).toContain("w-full");
  });

  it("opens a problem or question without a patient-information warning", async () => {
    await renderForm();
    expect(container.textContent).toContain("Report a problem");
    expect(container.textContent).toContain("Ask a question");
    expect(container.textContent).toContain("Suggest a feature");
    expect(container.textContent).not.toContain(REMOVED_PATIENT_WARNING);

    await act(async () => {
      buttonNamed("Report a problem").click();
    });
    expect(container.textContent).not.toContain(REMOVED_PATIENT_WARNING);
    expect(container.querySelector("[role='note']")).toBeNull();
    expect(container.querySelector('input[name="summary"]')).not.toBeNull();
    expect(
      (container.querySelector('input[name="originPath"]') as HTMLInputElement)
        .value
    ).toBe("/guides");
    expect(container.querySelector("textarea[name='message']")).not.toBeNull();

    await act(async () => {
      buttonNamed("Ask a question").click();
    });
    expect(container.textContent).not.toContain(REMOVED_PATIENT_WARNING);
    expect(container.textContent).toContain(
      "A short summary of your question."
    );
  });

  it("opens a feature request without a patient-information warning and leaves importance optional", async () => {
    await renderForm();
    await act(async () => {
      buttonNamed("Suggest a feature").click();
    });

    expect(container.textContent).toContain(
      "What would you like River Aftercare to help you do?"
    );
    expect(container.textContent).toContain(
      "What problem would this solve for your clinic?"
    );
    expect(container.textContent).not.toContain(REMOVED_PATIENT_WARNING);
    expect(container.querySelector("[role='note']")).toBeNull();
    expect(container.textContent).toContain("Nice to have");
    expect(container.textContent).toContain("Important");
    expect(container.textContent).toContain("Very important");
    const importance = [
      ...container.querySelectorAll('input[name="importance"]'),
    ];
    expect(importance).toHaveLength(3);
    expect(
      importance.every((input) => !(input as HTMLInputElement).required)
    ).toBe(true);
    expect(
      importance.every((input) => !(input as HTMLInputElement).checked)
    ).toBe(true);
    expect(
      importance.every((input) => (input as HTMLInputElement).type === "radio")
    ).toBe(true);
    const options = container.querySelector(".helpImportanceOptions");
    expect(options).not.toBeNull();
    expect(options?.classList.contains("staffChoiceOptions")).toBe(true);
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toContain(
      ".helpImportanceOptions {\n  grid-template-columns: minmax(0, 1fr);"
    );
    expect(css).toContain(
      "@container help-feedback (min-width: 32rem) {\n  .helpImportanceOptions {\n    grid-template-columns: repeat(3, minmax(0, 1fr));"
    );
    expect(container.querySelector("form")?.className).toContain(
      "helpFeedbackForm"
    );
  });

  it("confirms a sent message and a feature request differently", async () => {
    actionMock.mockResolvedValue({ status: "success", category: "problem" });
    await renderForm();
    await act(async () => {
      buttonNamed("Report a problem").click();
    });
    await setControl(
      container.querySelector("#help-summary") as HTMLInputElement,
      "Guides will not save"
    );
    await setControl(
      container.querySelector("#help-message") as HTMLTextAreaElement,
      "The save button does nothing."
    );

    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(container.textContent).toContain(HELP_FEEDBACK_SENT_MESSAGE);
    expect(container.textContent).not.toContain(
      HELP_FEEDBACK_FEATURE_ACKNOWLEDGEMENT
    );

    actionMock.mockResolvedValue({ status: "success", category: "feature" });
    await act(async () => {
      buttonNamed("Suggest a feature").click();
    });
    await setControl(
      container.querySelector("#help-goal") as HTMLInputElement,
      "Share a guide"
    );
    await setControl(
      container.querySelector("#help-problem") as HTMLTextAreaElement,
      "Copying instructions is slow."
    );
    await act(async () => {
      (container.querySelector("form") as HTMLFormElement).requestSubmit();
    });
    expect(container.textContent).toContain(
      HELP_FEEDBACK_FEATURE_ACKNOWLEDGEMENT
    );
    expect(container.textContent).not.toMatch(/will be built|ETA|roadmap/i);
  });

  it("keeps entered text and shows a retryable error when sending fails", async () => {
    actionMock.mockResolvedValue({
      status: "error",
      error: HELP_FEEDBACK_DELIVERY_FAILED,
      category: "problem",
    });
    await renderForm();
    await act(async () => {
      buttonNamed("Report a problem").click();
    });
    await setControl(
      container.querySelector("#help-summary") as HTMLInputElement,
      "Guides will not save"
    );
    await setControl(
      container.querySelector("#help-message") as HTMLTextAreaElement,
      "The save button does nothing."
    );
    await act(async () => {
      (container.querySelector("form") as HTMLFormElement).requestSubmit();
    });

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      HELP_FEEDBACK_DELIVERY_FAILED
    );
    expect(container.textContent).not.toMatch(/resend|smtp|stack|api key/i);
    expect(
      (container.querySelector("#help-summary") as HTMLInputElement).value
    ).toBe("Guides will not save");
    expect(
      (container.querySelector("#help-message") as HTMLTextAreaElement).value
    ).toBe("The save button does nothing.");
  });
});
