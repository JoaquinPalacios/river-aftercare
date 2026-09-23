/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());
const upgradeMock = vi.hoisted(() => vi.fn());
const scheduleMock = vi.hoisted(() => vi.fn());
const keepMock = vi.hoisted(() => vi.fn());
const prepareMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("@/app/(staff)/(operator)/operator/billing-actions", () => ({
  upgradeClinicPlanAction: (previous: unknown, formData: FormData) =>
    upgradeMock(previous, formData),
  scheduleClinicPlanDowngradeAction: (previous: unknown, formData: FormData) =>
    scheduleMock(previous, formData),
  keepPracticePlanAction: (previous: unknown, formData: FormData) =>
    keepMock(previous, formData),
  prepareClinicDowngradeAction: (previous: unknown, formData: FormData) =>
    prepareMock(previous, formData),
}));

import {
  DOWNGRADE_KEPT_MESSAGE,
  DOWNGRADE_SCHEDULED_MESSAGE,
  UPGRADE_POLL_ATTEMPTS,
  UPGRADE_POLL_INTERVAL_MS,
  UPGRADE_PROCESSING_MESSAGE,
  UPGRADE_STILL_PROCESSING_MESSAGE,
  UpgradePlanForm,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/upgrade-plan-form";

describe("operator upgrade refresh", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted = false;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    refreshMock.mockReset();
    upgradeMock.mockReset();
    scheduleMock.mockReset();
    keepMock.mockReset();
    prepareMock.mockReset();
    scheduleMock.mockResolvedValue({});
    keepMock.mockResolvedValue({});
    prepareMock.mockResolvedValue({});
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mounted = true;
  });

  afterEach(() => {
    if (mounted) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
    vi.useRealTimers();
  });

  async function renderForm(props: {
    canUpgradeToPractice: boolean;
    showDowngrade: boolean;
    canScheduleDowngrade?: boolean;
    canKeepPractice?: boolean;
    downgradeEffectiveLabel?: string | null;
    downgradeReadiness?: {
      ready: boolean;
      teamCurrent: number;
      teamLimit: number;
      guideCurrent: number;
      guideLimit: number;
      adaptedCurrent: number;
      adaptedLimit: number;
      combinedCurrent: number;
      combinedLimit: number;
    } | null;
    scheduledPlanChange?: {
      targetLabel: string;
      effectiveLabel: string;
      operatorLines: {
        plan: string;
        scheduledChange: string;
        currentAccess: string;
      };
      customerMessage: string;
    } | null;
  }) {
    await act(async () => {
      root.render(
        <UpgradePlanForm
          clinicId="clinic_a"
          canUpgradeToPractice={props.canUpgradeToPractice}
          showDowngrade={props.showDowngrade}
          canScheduleDowngrade={props.canScheduleDowngrade}
          canKeepPractice={props.canKeepPractice}
          downgradeEffectiveLabel={props.downgradeEffectiveLabel}
          downgradeReadiness={props.downgradeReadiness}
          scheduledPlanChange={props.scheduledPlanChange}
        />
      );
    });
  }

  function submitButton() {
    return container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
  }

  async function submitUpgrade() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
  }

  it("shows Upgrade to Practice for an eligible Essential clinic", async () => {
    await renderForm({
      canUpgradeToPractice: true,
      showDowngrade: false,
    });
    expect(submitButton().textContent).toBe("Upgrade to Practice");
    expect(container.textContent).not.toContain("Upgrading…");
    expect(container.textContent).not.toContain("later workflow");
  });

  it("labels the pending action Upgrading and then waits on River’s projection", async () => {
    let resolveUpgrade: (value: {
      accepted: boolean;
      startedAt: number;
    }) => void = () => {};
    upgradeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpgrade = resolve;
        })
    );
    await renderForm({
      canUpgradeToPractice: true,
      showDowngrade: false,
    });

    await submitUpgrade();
    expect(submitButton().textContent).toBe("Upgrading…");
    expect(submitButton().disabled).toBe(true);
    expect(refreshMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpgrade({ accepted: true, startedAt: 1 });
    });
    expect(container.textContent).toContain(UPGRADE_PROCESSING_MESSAGE);
    expect(container.textContent).not.toContain("You’re now on Practice");
    expect(refreshMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPGRADE_POLL_INTERVAL_MS);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
    });
    expect(container.textContent).toContain("Practice → Essential");
    expect(container.textContent).toContain(
      "Guide and team limits have to be checked before a downgrade can be scheduled."
    );
    expect(container.textContent).not.toContain("Schedule downgrade");
    expect(container.textContent).not.toContain(UPGRADE_PROCESSING_MESSAGE);
    expect(container.textContent).not.toContain("Upgrade to Practice");
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPGRADE_POLL_INTERVAL_MS * 3);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("stops after the refresh window with a neutral processing note", async () => {
    upgradeMock.mockResolvedValue({ accepted: true, startedAt: 2 });
    await renderForm({
      canUpgradeToPractice: true,
      showDowngrade: false,
    });
    await submitUpgrade();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        UPGRADE_POLL_INTERVAL_MS * UPGRADE_POLL_ATTEMPTS
      );
    });
    expect(refreshMock).toHaveBeenCalledTimes(UPGRADE_POLL_ATTEMPTS);
    expect(container.textContent).toContain(UPGRADE_STILL_PROCESSING_MESSAGE);
    expect(container.textContent).not.toContain(UPGRADE_PROCESSING_MESSAGE);
    expect(container.textContent).not.toMatch(/failed/i);
    expect(submitButton().textContent).toBe("Upgrade to Practice");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPGRADE_POLL_INTERVAL_MS * 2);
    });
    expect(refreshMock).toHaveBeenCalledTimes(UPGRADE_POLL_ATTEMPTS);
  });

  it("clears the refresh timer when the operator leaves the page", async () => {
    upgradeMock.mockResolvedValue({ accepted: true, startedAt: 3 });
    await renderForm({
      canUpgradeToPractice: true,
      showDowngrade: false,
    });
    await submitUpgrade();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPGRADE_POLL_INTERVAL_MS);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    mounted = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPGRADE_POLL_INTERVAL_MS * 4);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("offers a renewal downgrade when usage fits Essential", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
      canScheduleDowngrade: true,
      downgradeEffectiveLabel: "22 October 2026",
      downgradeReadiness: {
        ready: true,
        teamCurrent: 2,
        teamLimit: 2,
        guideCurrent: 1,
        guideLimit: 2,
        adaptedCurrent: 1,
        adaptedLimit: 2,
        combinedCurrent: 2,
        combinedLimit: 4,
      },
    });
    expect(container.textContent).toContain("Practice → Essential");
    expect(container.textContent).toContain(
      "Usage is within Essential limits."
    );
    expect(container.textContent).toContain(
      "Downgrade will take effect at the end of the current paid period: 22 October 2026"
    );
    expect(container.textContent).toContain(
      "Practice remains active until that date. There is no refund and no immediate billing change. Essential begins at the next renewal."
    );
    expect(container.textContent).toContain("Schedule downgrade");
    expect(container.textContent).not.toContain("already Essential");
    const clinicField = container.querySelector(
      'input[name="clinicId"]'
    ) as HTMLInputElement;
    expect(clinicField.value).toBe("clinic_a");
    expect(container.querySelector('input[name="targetPlan"]')).toBeNull();
    expect(container.querySelector('input[name="priceId"]')).toBeNull();
  });

  it("shows the scheduled change and Keep Practice without calling the clinic Essential", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
      canKeepPractice: true,
      scheduledPlanChange: {
        targetLabel: "Essential",
        effectiveLabel: "22 October 2026",
        operatorLines: {
          plan: "Practice",
          scheduledChange: "Essential on 22 October 2026",
          currentAccess: "Practice until 22 October 2026",
        },
        customerMessage:
          "Essential begins on 22 October 2026. Practice stays active until then.",
      },
    });
    expect(container.textContent).toContain("Plan: Practice");
    expect(container.textContent).toContain(
      "Scheduled change: Essential on 22 October 2026"
    );
    expect(container.textContent).toContain(
      "Current access: Practice until 22 October 2026"
    );
    expect(container.textContent).toContain(
      "Practice remains active until that date. Essential has not started."
    );
    expect(container.textContent).toContain("Keep Practice");
    expect(container.textContent).not.toContain("Schedule downgrade");
  });

  it("names the exact conflict and does not offer scheduling", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
      canScheduleDowngrade: false,
      downgradeReadiness: {
        ready: false,
        teamCurrent: 3,
        teamLimit: 2,
        guideCurrent: 4,
        guideLimit: 2,
        adaptedCurrent: 3,
        adaptedLimit: 2,
        combinedCurrent: 5,
        combinedLimit: 4,
      },
    });
    expect(container.textContent).toContain("Team members: 3 used / 2 allowed");
    expect(container.textContent).toContain(
      "Team usage must be resolved before downgrade."
    );
    expect(container.textContent).toContain("Clinic guide selection required.");
    expect(container.textContent).toContain(
      "Custom guides: 4 used / 2 allowed"
    );
    expect(container.textContent).toContain(
      "Editable River templates: 3 used / 2 allowed"
    );
    expect(container.textContent).toContain(
      "Total clinic-owned guides: 5 used / 4 allowed"
    );
    expect(container.textContent).not.toContain(
      "Reduce usage or grant a persistent extra before scheduling. Nothing is removed automatically."
    );
    expect(container.textContent).not.toContain("Schedule downgrade");
  });
});

const scheduledChange = {
  targetLabel: "Essential",
  effectiveLabel: "22 October 2026",
  operatorLines: {
    plan: "Practice",
    scheduledChange: "Essential on 22 October 2026",
    currentAccess: "Practice until 22 October 2026",
  },
  customerMessage:
    "Essential begins on 22 October 2026. Practice stays active until then.",
};

describe("plan change action feedback", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted = false;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    refreshMock.mockReset();
    upgradeMock.mockReset();
    scheduleMock.mockReset();
    keepMock.mockReset();
    prepareMock.mockReset();
    scheduleMock.mockResolvedValue({ accepted: true });
    keepMock.mockResolvedValue({ accepted: true });
    prepareMock.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mounted = true;
  });

  afterEach(() => {
    if (mounted) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  async function renderForm(props: {
    canScheduleDowngrade?: boolean;
    canKeepPractice?: boolean;
    scheduledPlanChange?: typeof scheduledChange | null;
  }) {
    await act(async () => {
      root.render(
        <UpgradePlanForm
          clinicId="clinic_a"
          canUpgradeToPractice={false}
          showDowngrade
          canScheduleDowngrade={props.canScheduleDowngrade}
          canKeepPractice={props.canKeepPractice}
          scheduledPlanChange={props.scheduledPlanChange}
        />
      );
    });
  }

  async function submitLabel(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label
    ) as HTMLButtonElement;
    const form = button.closest("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
  }

  function dismiss() {
    return container.querySelector(
      'button[aria-label="Dismiss notification"]'
    ) as HTMLButtonElement;
  }

  it("keeps only the latest schedule or reversal confirmation", async () => {
    await renderForm({ canScheduleDowngrade: true });
    await submitLabel("Schedule downgrade");
    expect(container.textContent).toContain(DOWNGRADE_SCHEDULED_MESSAGE);
    expect(container.textContent).not.toContain(DOWNGRADE_KEPT_MESSAGE);

    await renderForm({
      canKeepPractice: true,
      scheduledPlanChange: scheduledChange,
    });
    await submitLabel("Keep Practice");
    expect(container.textContent).toContain(DOWNGRADE_KEPT_MESSAGE);
    expect(container.textContent).not.toContain(DOWNGRADE_SCHEDULED_MESSAGE);

    await renderForm({ canScheduleDowngrade: true });
    await submitLabel("Schedule downgrade");
    expect(container.textContent).toContain(DOWNGRADE_SCHEDULED_MESSAGE);
    expect(container.textContent).not.toContain(DOWNGRADE_KEPT_MESSAGE);
  });

  it("replaces a success confirmation with a later error", async () => {
    await renderForm({ canScheduleDowngrade: true });
    await submitLabel("Schedule downgrade");
    expect(container.textContent).toContain(DOWNGRADE_SCHEDULED_MESSAGE);

    scheduleMock.mockResolvedValue({
      error:
        "The downgrade could not be scheduled. The subscription was left unchanged.",
    });
    await submitLabel("Schedule downgrade");
    expect(container.textContent).not.toContain(DOWNGRADE_SCHEDULED_MESSAGE);
    expect(container.textContent).toContain(
      "The downgrade could not be scheduled. The subscription was left unchanged."
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("dismisses the confirmation without clearing the scheduled plan", async () => {
    await renderForm({
      canScheduleDowngrade: true,
      canKeepPractice: true,
      scheduledPlanChange: scheduledChange,
    });
    await submitLabel("Schedule downgrade");
    expect(dismiss().getAttribute("type")).toBe("button");
    expect(dismiss().getAttribute("aria-label")).toBe("Dismiss notification");
    const calls = scheduleMock.mock.calls.length;

    await act(async () => {
      dismiss().click();
    });
    expect(container.textContent).not.toContain(DOWNGRADE_SCHEDULED_MESSAGE);
    expect(container.textContent).toContain("Plan: Practice");
    expect(container.textContent).toContain(
      "Scheduled change: Essential on 22 October 2026"
    );
    expect(container.textContent).toContain(
      "Current access: Practice until 22 October 2026"
    );
    expect(container.textContent).toContain("Keep Practice");
    expect(scheduleMock).toHaveBeenCalledTimes(calls);
    expect(keepMock).not.toHaveBeenCalled();

    await renderForm({
      canKeepPractice: true,
      scheduledPlanChange: scheduledChange,
    });
    expect(container.textContent).not.toContain(DOWNGRADE_SCHEDULED_MESSAGE);
    expect(container.textContent).toContain(
      "Scheduled change: Essential on 22 October 2026"
    );
  });
});
