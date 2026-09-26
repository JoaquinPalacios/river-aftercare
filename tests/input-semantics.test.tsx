/** @vitest-environment jsdom */

import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/practice",
}));

vi.mock("@/app/(staff)/(clinic-portal)/practice/actions", () => ({
  savePracticeSettingsAction: async () => ({}),
}));

vi.mock("@/app/(staff)/(clinic-portal)/practice/sites/actions", () => ({
  createSiteAction: async () => ({}),
  createLocationAction: async () => ({}),
}));

vi.mock("@/app/(staff)/(clinic-portal)/practice/logo-actions", () => ({
  removeClinicDarkLogoAction: async () => ({}),
  removeClinicFaviconAction: async () => ({}),
  removeClinicLogoAction: async () => ({}),
  uploadClinicDarkLogoAction: async () => ({}),
  uploadClinicFaviconAction: async () => ({}),
  uploadClinicLogoAction: async () => ({}),
}));

import { LocationFields } from "@/app/(staff)/(clinic-portal)/practice/sites/create-site-form";
import {
  TimelineAccordion,
  type EditorSection,
} from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { PracticeSettingsForm } from "@/app/(staff)/(clinic-portal)/practice/practice-settings-form";
import type { PracticeSettingsInput } from "@/lib/clinic-portal/practice-settings-schema";

const stage: EditorSection = {
  key: "stage-1",
  kind: "RECOVERY_TIMELINE",
  title: "Gentle care",
  body: "Rest today.",
  periodLabel: "Today",
  startDay: "",
  endDay: "",
};

function DayHarness({ initial }: { initial: EditorSection }) {
  const [stages, setStages] = useState([initial]);
  return (
    <TimelineAccordion
      stages={stages}
      disabled={false}
      expandedKey={initial.key}
      onExpandedKeyChange={() => undefined}
      onChange={setStages}
    />
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("input semantics", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    class IntersectionObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    Object.assign(globalThis, {
      IntersectionObserver: IntersectionObserverStub,
    });
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

  it("uses numeric day inputs without turning a blank into zero", async () => {
    await act(async () => {
      root.render(<DayHarness initial={stage} />);
    });

    const start = container.querySelector("#stage-1-start") as HTMLInputElement;
    const end = container.querySelector("#stage-1-end") as HTMLInputElement;

    for (const input of [start, end]) {
      expect(input.type).toBe("number");
      expect(input.min).toBe("0");
      expect(input.step).toBe("1");
      expect(input.max).toBe("");
      expect(input.required).toBe(false);
      expect(input.value).toBe("");
      expect(input.inputMode).toBe("numeric");
    }

    await act(async () => {
      setInputValue(start, "0");
    });
    expect(start.value).toBe("0");

    await act(async () => {
      setInputValue(start, "");
    });
    expect(start.value).toBe("");
    expect(container.textContent).not.toContain("Needs attention");

    await act(async () => {
      setInputValue(start, "1");
    });
    await act(async () => {
      setInputValue(end, "-1");
    });
    expect(start.value).toBe("1");
    expect(end.value).toBe("-1");
    expect(container.textContent).toContain("Needs attention");
  });

  it("types location phone, email, and absolute URL fields", async () => {
    await act(async () => {
      root.render(<LocationFields idPrefix="location" />);
    });

    expect(
      (container.querySelector("#location-phone") as HTMLInputElement).type
    ).toBe("tel");
    expect(
      (container.querySelector("#location-contactEmail") as HTMLInputElement)
        .type
    ).toBe("email");
    expect(
      (container.querySelector("#location-contactUrl") as HTMLInputElement).type
    ).toBe("url");
    expect(
      (container.querySelector("#location-bookingUrl") as HTMLInputElement).type
    ).toBe("url");
    expect(
      (container.querySelector("#location-postalCode") as HTMLInputElement).type
    ).toBe("text");
  });

  it("types the practice phone and contact page as tel and url", async () => {
    const values = {
      displayName: "Harbor Family Dental",
      logoUrl: null,
      darkLogoUrl: null,
      faviconUrl: null,
      primaryColor: "#155e75",
      accentColor: "#b45309",
      darkPrimaryColor: null,
      darkAccentColor: null,
      useCustomDarkBranding: false,
      neutralColor: "#f7f7f5",
      radiusPreset: "SOFT",
      typeface: null,
      instructionTerminology: "POST_TREATMENT",
      themeMode: "SYSTEM",
      allowPatientThemeToggle: true,
      phone: "02 5550 0100",
      contactUrl: "https://www.example.com/contact",
      addressLine1: null,
      addressLine2: null,
      city: null,
      region: null,
      postalCode: "2000",
      emergencyInstructions: null,
    } as PracticeSettingsInput;

    await act(async () => {
      root.render(
        <PracticeSettingsForm
          values={values}
          logoSrc={null}
          darkLogoSrc={null}
          faviconSrc={null}
          canEdit
          patientSiteHref={null}
          storageAvailable={false}
        />
      );
    });

    const phone = container.querySelector("#phone") as HTMLInputElement;
    const contactUrl = container.querySelector(
      "#contactUrl"
    ) as HTMLInputElement;
    const postalCode = container.querySelector(
      "#postalCode"
    ) as HTMLInputElement;

    expect(phone.type).toBe("tel");
    expect(phone.autocomplete).toBe("tel");
    expect(phone.value).toBe("02 5550 0100");
    expect(contactUrl.type).toBe("url");
    expect(contactUrl.autocomplete).toBe("url");
    expect(contactUrl.value).toBe("https://www.example.com/contact");
    expect(postalCode.type).toBe("text");
    expect(postalCode.value).toBe("2000");
  });
});
