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
    downgradeDeferred: boolean;
  }) {
    await act(async () => {
      root.render(
        <UpgradePlanForm
          clinicId="clinic_a"
          canUpgradeToPractice={props.canUpgradeToPractice}
          downgradeDeferred={props.downgradeDeferred}
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
      downgradeDeferred: false,
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
      downgradeDeferred: false,
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
      downgradeDeferred: true,
    });
    expect(container.textContent).toContain(
      "Practice to Essential is not available here yet."
    );
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
      downgradeDeferred: false,
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
      downgradeDeferred: false,
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
});
