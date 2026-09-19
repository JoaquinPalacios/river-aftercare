/** @vitest-environment jsdom */

import { ClinicMembershipRole } from "@prisma/client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
const changeRoleMock = vi.hoisted(() => vi.fn());
const resendMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock(
  "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions",
  () => ({
    removeClinicAccessAction: removeMock,
    changeClinicMembershipRoleAction: changeRoleMock,
    resendClinicInvitationAction: resendMock,
    cancelClinicInvitationAction: cancelMock,
  })
);

import { ClinicTeamTable } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/team-table";
import {
  TEAM_ADMIN_ROLE_LABEL,
  TEAM_STAFF_ROLE_LABEL,
} from "@/lib/clinic-portal/role-labels";
import type { ClinicTeamRow } from "@/lib/operator/list-clinic-team";

const member: ClinicTeamRow = {
  kind: "member",
  membershipId: "membership_1",
  userId: "user_jane",
  name: "Jane Example",
  email: "jane@example.test",
  role: ClinicMembershipRole.ADMIN,
  status: "active",
};

const invitation: ClinicTeamRow = {
  kind: "invitation",
  userId: "user_pending",
  name: "Pat Pending",
  email: "pat@example.test",
  role: ClinicMembershipRole.STAFF,
  status: "pending",
  invitedAt: new Date("2026-09-12T00:00:00.000Z"),
  expiresAt: new Date("2026-09-26T00:00:00.000Z"),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("clinic team table actions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    refreshMock.mockReset();
    removeMock.mockReset();
    changeRoleMock.mockReset();
    resendMock.mockReset();
    cancelMock.mockReset();
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    HTMLElement.prototype.hidePopover = function hidePopover() {
      this.removeAttribute("open");
    };
    HTMLFormElement.prototype.requestSubmit = function requestSubmit() {
      this.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    };
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

  async function renderTable(rows: ClinicTeamRow[]) {
    await act(async () => {
      root.render(
        <ClinicTeamTable
          clinicId="clinic_1"
          clinicName="Riverside Dental Demo"
          rows={rows}
        />
      );
    });
  }

  function buttonByName(name: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === name
    ) as HTMLButtonElement | undefined;
  }

  function dialogButton(name: string) {
    return Array.from(container.querySelectorAll("dialog button")).find(
      (button) => (button.textContent ?? "").includes(name)
    ) as HTMLButtonElement | undefined;
  }

  it("exposes Change role and Remove access for active members only", async () => {
    await renderTable([member, invitation]);

    expect(buttonByName("Change role")).toBeTruthy();
    expect(buttonByName("Remove access")).toBeTruthy();
    expect(buttonByName("Resend invitation")).toBeTruthy();
    expect(buttonByName("Cancel invitation")).toBeTruthy();

    const pendingRow = Array.from(container.querySelectorAll("tr")).find(
      (row) => row.textContent?.includes("pat@example.test")
    );
    expect(pendingRow?.textContent).toContain("Resend invitation");
    expect(pendingRow?.textContent).not.toContain("Change role");
    expect(container.textContent).toContain(TEAM_ADMIN_ROLE_LABEL);
    expect(container.textContent).toContain(TEAM_STAFF_ROLE_LABEL);
  });

  it("enters Removing… pending state and prevents duplicate remove submissions", async () => {
    const pending = deferred<{ error?: string }>();
    removeMock.mockReturnValue(pending.promise);
    await renderTable([member]);

    await act(async () => {
      buttonByName("Remove access")?.click();
    });

    const confirm = dialogButton("Remove access");
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm?.click();
      confirm?.click();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(removeMock).toHaveBeenCalledTimes(1);
    const busyConfirm = dialogButton("Removing") as HTMLButtonElement;
    expect(busyConfirm.textContent).toContain("Removing…");
    expect(busyConfirm.querySelector(".staffLoginSpinner")).not.toBeNull();
    expect(busyConfirm.className).toContain("staffLoginSubmit");
    expect(busyConfirm.disabled).toBe(true);
    expect(busyConfirm.getAttribute("aria-busy")).toBe("true");
    expect(buttonByName("Cancel")?.disabled).toBe(true);
    expect(
      container.querySelector('[aria-label="Actions for Jane Example"]')
    )?.toHaveProperty("disabled", true);

    pending.resolve({});
  });

  it("selects the current role and disables Save until it changes", async () => {
    const pending = deferred<{ error?: string }>();
    changeRoleMock.mockReturnValue(pending.promise);
    await renderTable([member]);

    await act(async () => {
      buttonByName("Change role")?.click();
    });

    const select = container.querySelector("select") as HTMLSelectElement;
    const save = dialogButton("Save role") as HTMLButtonElement;
    expect(select.value).toBe("ADMIN");
    expect(
      Array.from(select.options).map((option) => option.textContent)
    ).toEqual([TEAM_ADMIN_ROLE_LABEL, TEAM_STAFF_ROLE_LABEL]);
    expect(save.disabled).toBe(true);

    await act(async () => {
      save.click();
    });
    expect(changeRoleMock).not.toHaveBeenCalled();

    await act(async () => {
      select.value = "STAFF";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const enabledSave = dialogButton("Save role") as HTMLButtonElement;
    expect(enabledSave.disabled).toBe(false);

    await act(async () => {
      enabledSave.click();
      enabledSave.click();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(changeRoleMock).toHaveBeenCalledTimes(1);
    const busySave = dialogButton("Saving") as HTMLButtonElement;
    expect(busySave.textContent).toContain("Saving…");
    expect(busySave.querySelector(".staffLoginSpinner")).not.toBeNull();
    expect(busySave.disabled).toBe(true);
    expect(select.disabled).toBe(true);

    pending.resolve({});
  });
});
