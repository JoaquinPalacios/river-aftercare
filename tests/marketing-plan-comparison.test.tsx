/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarketingPlanComparison } from "@/app/(marketing)/components/marketing-plan-comparison";
import {
  PLAN_COMPARISON_CONTROL_LABEL,
  PLAN_COMPARISON_PANEL_ID,
  PLAN_COMPARISON_SUPPORT_FEATURE,
  PRICING_PRIORITY_SUPPORT_LABEL,
  PRICING_STANDARD_SUPPORT_LABEL,
} from "@/lib/marketing/plans";

describe("marketing plan comparison disclosure", () => {
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

  function trigger() {
    return container.querySelector(
      "#plan-comparison-trigger"
    ) as HTMLButtonElement;
  }

  function panel() {
    return container.querySelector(
      `#${PLAN_COMPARISON_PANEL_ID}`
    ) as HTMLDivElement;
  }

  it("stays collapsed until the comparison control is activated", async () => {
    await act(async () => {
      root.render(<MarketingPlanComparison />);
    });

    const button = trigger();
    const comparison = panel();
    expect(button).toBeTruthy();
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toContain(PLAN_COMPARISON_CONTROL_LABEL);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(PLAN_COMPARISON_PANEL_ID);
    expect(comparison.hidden).toBe(true);
    expect(
      comparison.querySelector('[data-comparison-row="custom-guides"]')
    ).toBeTruthy();
    expect(comparison.textContent).toContain("Up to 2");
    expect(comparison.textContent).toContain("Up to 30");
    expect(comparison.textContent).toContain("Not included");
    const supportRow = comparison.querySelector(
      '[data-comparison-row="support"]'
    ) as HTMLTableRowElement;
    expect(supportRow).toBeTruthy();
    expect(supportRow.querySelector("th")?.textContent).toBe(
      PLAN_COMPARISON_SUPPORT_FEATURE
    );
    expect(
      supportRow.querySelector('[data-plan="essential"]')?.textContent
    ).toContain(PRICING_STANDARD_SUPPORT_LABEL);
    expect(
      supportRow.querySelector('[data-plan="practice"]')?.textContent
    ).toContain(PRICING_PRIORITY_SUPPORT_LABEL);
    expect(
      supportRow.querySelector('[data-plan="group"]')?.textContent
    ).toContain(PRICING_PRIORITY_SUPPORT_LABEL);
    expect(supportRow.querySelector("svg")).toBeNull();
    expect(
      comparison.querySelector('[data-comparison-row="priority-support"]')
    ).toBeNull();

    await act(async () => {
      button.click();
    });

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(comparison.hidden).toBe(false);

    await act(async () => {
      button.click();
    });

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(comparison.hidden).toBe(true);
  });
});
