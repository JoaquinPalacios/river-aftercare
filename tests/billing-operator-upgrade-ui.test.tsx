/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());
const upgradeMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("@/app/(staff)/(operator)/operator/billing-actions", () => ({
  upgradeClinicPlanAction: (previous: unknown, formData: FormData) =>
    upgradeMock(previous, formData),
}));

import {
  CUSTOMER_PREPARING_DOWNGRADE_MESSAGE,
  GUIDE_SELECTION_COMPLETE_MESSAGE,
  GUIDE_SELECTION_WAITING_MESSAGE,
  NO_DOWNGRADE_IN_PROGRESS_MESSAGE,
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
    downgradeEffectiveLabel?: string | null;
    openDowngradeAttemptId?: string | null;
    guidePreparation?: {
      status: "none" | "awaiting" | "confirmed";
      selectedCustom: number;
      selectedAdapted: number;
      selectedCombined: number;
    } | null;
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
          downgradeEffectiveLabel={props.downgradeEffectiveLabel}
          openDowngradeAttemptId={props.openDowngradeAttemptId}
          guidePreparation={props.guidePreparation}
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

  it("shows a read-only downgrade when usage fits Essential", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
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
    expect(container.textContent).toContain(NO_DOWNGRADE_IN_PROGRESS_MESSAGE);
    expect(container.textContent).toContain(
      "Paid period ends 22 October 2026."
    );
    expect(container.textContent).not.toContain("Schedule downgrade");
    expect(container.textContent).not.toContain("Prepare downgrade");
    expect(container.textContent).not.toContain("Keep Practice");
    expect(container.textContent).not.toContain("already Essential");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[name="targetPlan"]')).toBeNull();
    expect(container.querySelector('input[name="priceId"]')).toBeNull();
  });

  it("shows the scheduled change without an operator reversal control", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
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
    expect(container.textContent).toContain(
      "Essential scheduled for 22 October 2026."
    );
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
    expect(container.textContent).not.toContain("Keep Practice");
    expect(container.textContent).not.toContain("Schedule downgrade");
    expect(container.textContent).not.toContain("Prepare downgrade");
  });

  it("names preparation and team status without offering an operator action", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
      guidePreparation: {
        status: "awaiting",
        selectedCustom: 0,
        selectedAdapted: 0,
        selectedCombined: 0,
      },
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
    expect(container.textContent).toContain(
      CUSTOMER_PREPARING_DOWNGRADE_MESSAGE
    );
    expect(container.textContent).toContain(GUIDE_SELECTION_WAITING_MESSAGE);
    expect(container.textContent).toContain("Team members: 3 used / 2 allowed");
    expect(container.textContent).toContain(
      "Team usage must be resolved by the clinic before the downgrade can be scheduled."
    );
    expect(container.textContent).toContain(
      "Custom guides: 4 used / 2 allowed"
    );
    expect(container.textContent).toContain(
      "Editable River templates: 3 used / 2 allowed"
    );
    expect(container.textContent).toContain(
      "Total clinic-owned guides: 5 used / 4 allowed"
    );
    expect(container.textContent).not.toContain("Schedule downgrade");
    expect(container.textContent).not.toContain("Prepare downgrade");
    expect(container.textContent).not.toContain("Keep Practice");
  });

  it("shows a completed guide selection and an open attempt as diagnostics", async () => {
    await renderForm({
      canUpgradeToPractice: false,
      showDowngrade: true,
      openDowngradeAttemptId: "c14dbe30-ecfe-4136-8899-a2de4179b408",
      guidePreparation: {
        status: "confirmed",
        selectedCustom: 2,
        selectedAdapted: 1,
        selectedCombined: 3,
      },
      downgradeReadiness: {
        ready: false,
        teamCurrent: 2,
        teamLimit: 2,
        guideCurrent: 4,
        guideLimit: 2,
        adaptedCurrent: 1,
        adaptedLimit: 2,
        combinedCurrent: 5,
        combinedLimit: 4,
      },
    });
    expect(container.textContent).toContain(GUIDE_SELECTION_COMPLETE_MESSAGE);
    expect(container.textContent).toContain("Selected clinic-owned guides: 3");
    expect(container.textContent).toContain(
      "A scheduling attempt is still open (c14dbe30-ecfe-4136-8899-a2de4179b408)."
    );
    expect(container.textContent).not.toContain("Schedule downgrade");
    expect(container.textContent).not.toContain("Keep Practice");
  });
});
