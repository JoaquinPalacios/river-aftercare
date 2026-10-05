/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/actions",
  () => ({
    prepareOnboardingStandardOfferAction: vi.fn(),
    discardAssistedClinicAction: vi.fn(),
  })
);

vi.mock(
  "@/app/(staff)/(operator)/operator/clinics/[clinicId]/complimentary-actions",
  () => ({
    saveComplimentaryAccessAction: vi.fn(),
  })
);

import { OnboardingCommercialArrangement } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-commercial-forms";
import { OnboardingExit } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-exit";
import { OnboardingProgressList } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-progress";

describe("operator commercial arrangement", () => {
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

  function render(node: ReactNode) {
    act(() => {
      root.render(node);
    });
  }

  function clickRadio(name: string, value: string) {
    const input = container.querySelector(
      `input[name="${name}"][value="${value}"]`
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Missing radio ${name}=${value}`);
    }
    act(() => {
      input.click();
    });
  }

  it("keeps the checklist labels stable and marks incomplete steps", () => {
    render(
      <OnboardingProgressList
        items={[
          { id: "clinic", label: "Clinic created", complete: true },
          {
            id: "categories",
            label: "Practice categories selected",
            complete: true,
          },
          {
            id: "commercial",
            label: "Commercial arrangement",
            complete: false,
          },
          { id: "administrator", label: "Administrator", complete: false },
          {
            id: "ready",
            label: "Ready for clinic setup",
            complete: false,
          },
        ]}
      />
    );
    expect(container.textContent).toContain("✓");
    expect(container.textContent).toContain("○");
    expect(
      container
        .querySelector("[data-progress-item='commercial']")
        ?.getAttribute("data-complete")
    ).toBe("false");
    expect(
      container
        .querySelector("[data-progress-item='categories']")
        ?.getAttribute("data-complete")
    ).toBe("true");
  });

  it("shows one commercial form after the operator chooses an arrangement", () => {
    render(<OnboardingCommercialArrangement clinicId="clinic_1" />);
    expect(container.textContent).toContain(
      "How will this clinic use River Aftercare?"
    );
    expect(container.textContent).toContain("Complimentary collaboration");
    expect(container.textContent).toContain("Standard subscription");
    expect(container.textContent).not.toContain("Grant complimentary access");
    expect(container.textContent).not.toContain("Set up paid plan");

    clickRadio("onboardingCommercialArrangement", "complimentary");
    expect(container.textContent).toContain("Grant complimentary access");
    expect(container.textContent).toContain("6 months");
    expect(container.textContent).toContain("12 months");
    expect(container.textContent).toContain("Indefinite");
    expect(container.querySelector("#onboarding-custom-end")).toBeNull();
    expect(container.textContent).not.toContain("Set up paid plan");
    expect(container.textContent).not.toContain("Commercial review date");

    clickRadio("duration", "CUSTOM");
    expect(container.querySelector("#onboarding-custom-end")).not.toBeNull();

    clickRadio("onboardingCommercialArrangement", "standard");
    expect(container.textContent).not.toContain("Grant complimentary access");
    expect(container.textContent).toContain("Set up paid plan");
    expect(
      (container.querySelector("#onboarding-plan") as HTMLSelectElement).value
    ).toBe("");
    expect(
      container.querySelector("#onboarding-plan option[value='PRACTICE']")
        ?.textContent
    ).toBe("Practice");
    expect(
      container.querySelector("#onboarding-interval option[value='MONTHLY']")
        ?.textContent
    ).toBe("Monthly");
  });

  it("offers exit, and discard only while the clinic is still pristine", () => {
    render(
      <OnboardingExit
        clinicId="clinic_1"
        clinicName="Test Clinic Prod"
        canDiscard
      />
    );
    const exit = container.querySelector("a");
    expect(exit?.textContent).toBe("Exit setup");
    expect(exit?.getAttribute("href")).toBe("/operator/clinics/clinic_1");
    expect(container.textContent).toContain("Your progress is saved.");
    const discard = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Discard this clinic"
    );
    expect(discard?.disabled).toBe(false);
    expect(container.textContent).toContain("Discard Test Clinic Prod");
    expect(container.textContent).toContain(
      "This permanently removes Test Clinic Prod and frees the tenant address. It cannot be undone."
    );

    act(() => {
      root.render(
        <OnboardingExit
          clinicId="clinic_1"
          clinicName="Test Clinic Prod"
          canDiscard={false}
        />
      );
    });
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent === "Discard this clinic"
      )
    ).toBe(false);
    expect(container.textContent).toContain("Exit setup");
    expect(container.textContent).toContain("Your progress is saved.");
  });
});
