/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const beginMock = vi.hoisted(() => vi.fn());
const scheduleMock = vi.hoisted(() => vi.fn());
const keepMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/account/billing/actions", () => ({
  beginClinicPlanDowngradeAction: (previous: unknown, formData: FormData) =>
    beginMock(previous, formData),
  scheduleClinicPlanDowngradeAction: (previous: unknown, formData: FormData) =>
    scheduleMock(previous, formData),
  keepPracticeAction: (previous: unknown, formData: FormData) =>
    keepMock(previous, formData),
  cancelClinicPlanChangeAction: (previous: unknown, formData: FormData) =>
    cancelMock(previous, formData),
}));

import {
  CANCEL_PLAN_CHANGE_NOTICE,
  ChangePlanPanel,
  KEEP_PRACTICE_NOTICE,
  scheduledDowngradeNotice,
} from "@/app/(staff)/account/billing/change-plan-panel";

const readyProps = {
  canAct: true,
  intervalLabel: "Monthly",
  essentialPriceLabel: "A$79 / month",
  effectiveLabel: "22 October 2026",
  teamCurrent: 2,
  teamLimit: 2,
  guidesFit: true,
  combinedCurrent: 2,
  combinedLimit: 4,
  preparationStatus: "none" as const,
  selectedCombined: 0,
  scheduleReady: true,
  blockedMessage: null,
  canCancelPreparation: false,
};

describe("self-service change plan panel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    beginMock.mockReset();
    scheduleMock.mockReset();
    keepMock.mockReset();
    cancelMock.mockReset();
    beginMock.mockResolvedValue({});
    scheduleMock.mockResolvedValue({
      notice: "scheduled",
      effectiveLabel: "22 October 2026",
    });
    keepMock.mockResolvedValue({ notice: "kept" });
    cancelMock.mockResolvedValue({ notice: "cancelled" });
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

  async function render(
    props: Partial<ComponentProps<typeof ChangePlanPanel>> & {
      phase: ComponentProps<typeof ChangePlanPanel>["phase"];
    }
  ) {
    await act(async () => {
      root.render(<ChangePlanPanel {...readyProps} {...props} />);
    });
  }

  function button(label: string) {
    return [...container.querySelectorAll("button")].find((candidate) => {
      const active = candidate.querySelector("[data-active='true']");
      return (active?.textContent ?? candidate.textContent) === label;
    }) as HTMLButtonElement | undefined;
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  async function submit(label: string) {
    const control = button(label);
    const form = control?.closest("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
  }

  it("offers Review downgrade for a Practice clinic with no preparation", async () => {
    await render({ phase: "entry" });
    expect(container.textContent).toContain("Current: Practice");
    expect(container.textContent).toContain(
      "Essential · A$79 / month · Monthly"
    );
    expect(button("Review downgrade")).toBeTruthy();
    expect(container.textContent).not.toContain("Schedule downgrade");
    expect(container.querySelector('input[name="clinicId"]')).toBeNull();
  });

  it("shows a ready review when guides and team already fit", async () => {
    await render({ phase: "review" });
    expect(container.textContent).toContain("Practice → Essential");
    expect(container.textContent).toContain(
      "Essential will begin on 22 October 2026."
    );
    expect(container.textContent).toContain(
      "Your Practice plan remains active until then."
    );
    expect(container.textContent).toContain(
      "There is no immediate refund or billing change."
    );
    expect(container.textContent).toContain("2 of 2 places");
    expect(container.textContent).toContain("Guides ready");
    expect(container.textContent).toContain(
      "All current clinic-owned guides fit within Essential."
    );
    expect(container.textContent).toContain("Price from next renewal");
    expect(container.textContent).toContain("A$79 / month");
    expect(container.textContent).toContain("Immediate charge");
    expect(container.textContent).toContain("None");
    expect(button("Schedule downgrade")?.disabled).toBe(false);
    expect(container.textContent).not.toContain("Manage team");
  });

  it("blocks scheduling while team usage is over Essential and links to team management", async () => {
    await render({
      phase: "review",
      teamCurrent: 3,
      teamLimit: 2,
      scheduleReady: false,
    });
    expect(container.textContent).toContain("Team changes required");
    expect(container.textContent).toContain(
      "Essential includes 2 team places. Your clinic currently uses 3."
    );
    expect(container.textContent).toContain(
      "Deactivate team members or cancel pending invitations before scheduling the downgrade."
    );
    const link = container.querySelector('a[href="/practice"]');
    expect(link?.textContent).toBe("Manage team");
    expect(button("Schedule downgrade")?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Essential will begin on 22 October 2026."
    );
  });

  it("shows a confirmed keep-set and lets the administrator schedule", async () => {
    await render({
      phase: "review",
      guidesFit: false,
      combinedCurrent: 5,
      preparationStatus: "confirmed",
      selectedCombined: 3,
      scheduleReady: true,
      canCancelPreparation: true,
    });
    expect(container.textContent).toContain("Guide selection confirmed");
    expect(container.textContent).toContain(
      "3 of 4 clinic-owned guides will stay active"
    );
    expect(container.textContent).toContain("2 will be retained for 60 days");
    expect(button("Schedule downgrade")?.disabled).toBe(false);
    expect(button("Cancel plan change")).toBeTruthy();
  });

  it("places Schedule and Cancel in one responsive row", async () => {
    await render({
      phase: "review",
      canCancelPreparation: true,
    });
    const row = container.querySelector("[data-action-row='downgrade']");
    expect(row?.className).toContain("flex-col");
    expect(row?.className).toContain("sm:flex-row");
    expect(row?.className).not.toContain("overflow-x");
    const schedule = button("Schedule downgrade");
    const cancel = button("Cancel plan change");
    expect(schedule?.className).toContain("staffBtnPrimary");
    expect(schedule?.className).toContain("w-full");
    expect(schedule?.className).toContain("sm:w-auto");
    expect(cancel?.className).toContain("staffBtnSecondary");
    expect(cancel?.className).toContain("w-full");
    expect(cancel?.className).toContain("sm:w-auto");
    expect(schedule?.className).not.toContain("w-full sm:w-full");
  });

  it("shows Scheduling and locks Cancel until the action finishes", async () => {
    const pending = deferred<{ error: string }>();
    scheduleMock.mockReturnValue(pending.promise);
    await render({
      phase: "review",
      canCancelPreparation: true,
      scheduleReady: true,
    });
    const form = button("Schedule downgrade")?.closest(
      "form"
    ) as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(button("Scheduling…")?.disabled).toBe(true);
    expect(button("Cancel plan change")?.disabled).toBe(true);
    expect(button("Schedule downgrade")).toBeUndefined();
    expect(
      container
        .querySelector("[data-action-row='downgrade']")
        ?.getAttribute("aria-busy")
    ).toBe("true");
    expect(
      container.querySelector(".staffBtnSpinner[data-visible='true']")
    ).not.toBeNull();
    expect(scheduleMock).toHaveBeenCalledTimes(1);

    button("Cancel plan change")?.click();
    expect(cancelMock).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({
        error:
          "We couldn’t schedule the plan change. Your Practice plan is unchanged. Please try again.",
      });
    });
    expect(button("Schedule downgrade")?.disabled).toBe(false);
    expect(button("Cancel plan change")?.disabled).toBe(false);
    expect(button("Scheduling…")).toBeUndefined();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("Practice → Essential");
  });

  it("shows Cancelling and locks Schedule until the action finishes", async () => {
    const pending = deferred<{ notice: "cancelled" }>();
    cancelMock.mockReturnValue(pending.promise);
    await render({
      phase: "review",
      canCancelPreparation: true,
      scheduleReady: true,
    });
    const form = button("Cancel plan change")?.closest(
      "form"
    ) as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(button("Cancelling…")?.disabled).toBe(true);
    expect(button("Schedule downgrade")?.disabled).toBe(true);
    expect(button("Scheduling…")).toBeUndefined();
    expect(cancelMock).toHaveBeenCalledTimes(1);
    button("Schedule downgrade")?.click();
    expect(scheduleMock).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ notice: "cancelled" });
    });
    expect(container.textContent).toContain(CANCEL_PLAN_CHANGE_NOTICE);
    expect(button("Cancel plan change")?.disabled).toBe(false);
    expect(button("Schedule downgrade")?.disabled).toBe(false);
    expect(container.textContent).toContain("Practice → Essential");
  });

  it("shows Keeping Practice and disables the control while that action runs", async () => {
    const pending = deferred<{ notice: "kept" }>();
    keepMock.mockReturnValue(pending.promise);
    await render({
      phase: "scheduled",
      scheduledEffectiveLabel: "22 October 2026",
    });
    const form = button("Keep Practice")?.closest("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(button("Keeping Practice…")?.disabled).toBe(true);
    expect(container.textContent).toContain("Essential scheduled");
    expect(container.textContent).toContain(
      "Your Practice plan remains active until 22 October 2026."
    );
    expect(keepMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ notice: "kept" });
    });
    expect(container.textContent).toContain(KEEP_PRACTICE_NOTICE);
    expect(button("Keep Practice")?.disabled).toBe(false);
    expect(container.textContent).toContain("Essential scheduled");
  });

  it("shows Preparing while Review downgrade is submitted", async () => {
    const pending = deferred<Record<string, never>>();
    beginMock.mockReturnValue(pending.promise);
    await render({ phase: "entry" });
    const form = button("Review downgrade")?.closest("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(button("Preparing…")?.disabled).toBe(true);
    expect(button("Review downgrade")).toBeUndefined();
    expect(beginMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({});
    });
    expect(button("Review downgrade")?.disabled).toBe(false);
  });

  it("keeps Cancel plan change available when scheduling is not ready", async () => {
    await render({
      phase: "review",
      guidesFit: false,
      preparationStatus: "confirmed",
      scheduleReady: false,
      canCancelPreparation: true,
    });
    expect(button("Cancel plan change")).toBeTruthy();
    expect(button("Schedule downgrade")?.disabled).toBe(true);
    expect(button("Keep Practice")).toBeUndefined();
  });

  it("hides plan-changing controls from staff", async () => {
    await render({
      phase: "review",
      canAct: false,
      guidesFit: false,
      preparationStatus: "awaiting",
      scheduleReady: false,
      canCancelPreparation: true,
    });
    expect(button("Schedule downgrade")).toBeUndefined();
    expect(button("Cancel plan change")).toBeUndefined();
    expect(button("Review downgrade")).toBeUndefined();
    expect(button("Keep Practice")).toBeUndefined();
    expect(container.textContent).toContain(
      "Choose which guides will stay active on Essential."
    );
  });

  it("keeps the scheduled status after the confirmation is dismissed", async () => {
    await render({
      phase: "scheduled",
      scheduledEffectiveLabel: "22 October 2026",
    });
    await submit("Keep Practice");
    expect(container.textContent).toContain(KEEP_PRACTICE_NOTICE);
    expect(keepMock).toHaveBeenCalledTimes(1);
    const dismiss = container.querySelector(
      'button[aria-label="Dismiss notification"]'
    ) as HTMLButtonElement;
    await act(async () => {
      dismiss.click();
    });
    expect(container.textContent).not.toContain(KEEP_PRACTICE_NOTICE);
    expect(container.textContent).toContain("Essential scheduled");
    expect(container.textContent).toContain(
      "Your Practice plan remains active until 22 October 2026."
    );
    expect(container.textContent).toContain("Scheduled plan");
    expect(button("Keep Practice")).toBeTruthy();
  });

  it("shows a safe scheduling error and leaves the review in place", async () => {
    scheduleMock.mockResolvedValue({
      error:
        "We couldn’t schedule the plan change. Your Practice plan is unchanged. Please try again.",
    });
    await render({ phase: "review" });
    await submit("Schedule downgrade");
    expect(container.textContent).toContain(
      "We couldn’t schedule the plan change. Your Practice plan is unchanged. Please try again."
    );
    expect(container.textContent).not.toContain(
      scheduledDowngradeNotice("22 October 2026")
    );
    expect(container.textContent).not.toContain("Essential scheduled");
    expect(button("Schedule downgrade")).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    scheduleMock.mockResolvedValue({
      notice: "scheduled",
      effectiveLabel: "22 October 2026",
    });
    await submit("Schedule downgrade");
    expect(container.textContent).toContain(
      scheduledDowngradeNotice("22 October 2026")
    );
    expect(container.textContent).not.toContain(
      "We couldn’t schedule the plan change."
    );
  });

  it("confirms a cancelled preparation without a Stripe id on screen", async () => {
    await render({
      phase: "review",
      canCancelPreparation: true,
      guidesFit: false,
      preparationStatus: "confirmed",
      selectedCombined: 3,
      combinedCurrent: 5,
    });
    await submit("Cancel plan change");
    expect(container.textContent).toContain(CANCEL_PLAN_CHANGE_NOTICE);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("sub_");
  });
});
