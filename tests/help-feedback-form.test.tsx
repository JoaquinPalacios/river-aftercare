/** @vitest-environment jsdom */

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
  HELP_FEEDBACK_PATIENT_WARNING,
  HELP_FEEDBACK_SENT_MESSAGE,
} from "@/lib/support/help-feedback-fields";

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

  it("shows the patient-information warning beside a problem or question", async () => {
    await renderForm();
    expect(container.textContent).toContain("Report a problem");
    expect(container.textContent).toContain("Ask a question");
    expect(container.textContent).toContain("Suggest a feature");
    expect(container.textContent).not.toContain(HELP_FEEDBACK_PATIENT_WARNING);

    await act(async () => {
      buttonNamed("Report a problem").click();
    });
    expect(container.textContent).toContain(HELP_FEEDBACK_PATIENT_WARNING);
    expect(container.querySelector('input[name="summary"]')).not.toBeNull();
    expect(
      (container.querySelector('input[name="originPath"]') as HTMLInputElement)
        .value
    ).toBe("/guides");
    expect(container.querySelector("textarea[name='message']")).not.toBeNull();
    const notice = container.querySelector("[role='note']");
    const message = container.querySelector("#help-message");
    expect(notice?.compareDocumentPosition(message as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    await act(async () => {
      buttonNamed("Ask a question").click();
    });
    expect(container.textContent).toContain(HELP_FEEDBACK_PATIENT_WARNING);
    expect(container.textContent).toContain(
      "A short summary of your question."
    );
  });

  it("shows the same warning on a feature request and leaves importance optional", async () => {
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
    expect(container.textContent).toContain(HELP_FEEDBACK_PATIENT_WARNING);
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
