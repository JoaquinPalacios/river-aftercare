/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock(
  "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-lifecycle-actions",
  () => ({
    archiveOperatorClinicAction: vi.fn(async () => {
      calls.push("archive");
      return {};
    }),
    unarchiveOperatorClinicAction: vi.fn(async () => {
      calls.push("unarchive");
      return {};
    }),
    setOperatorClinicActiveAction: vi.fn(async () => ({})),
  })
);

import { ClinicStatusSection } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/clinic-status-section";

describe("clinic status action binding", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    calls.length = 0;
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

  function formFor(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label
    );
    const form = button?.closest("form");
    if (!form) {
      throw new Error(`No form for ${label}`);
    }
    return form;
  }

  async function render(lifecycle: "active" | "inactive" | "archived") {
    await act(async () => {
      root.render(
        <ClinicStatusSection
          clinicId="clinic_1"
          lifecycle={lifecycle}
          clinicName="Archive Replay Clinic"
          deactivatedLabel={
            lifecycle === "inactive" ? "7 Oct 2026, 07:25" : null
          }
          archivedLabel={lifecycle === "archived" ? "7 Oct 2026, 07:28" : null}
        />
      );
    });
  }

  it("submits archive again after unarchive on the same page", async () => {
    await render("inactive");
    await act(async () => {
      formFor("Archive clinic").requestSubmit();
    });

    await render("archived");
    await act(async () => {
      formFor("Unarchive clinic").requestSubmit();
    });

    await render("inactive");
    await act(async () => {
      formFor("Archive clinic").requestSubmit();
    });

    expect(calls).toEqual(["archive", "unarchive", "archive"]);
  });
});
