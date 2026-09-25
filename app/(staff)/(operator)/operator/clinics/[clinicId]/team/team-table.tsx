"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelClinicInvitationAction,
  changeClinicMembershipRoleAction,
  removeClinicAccessAction,
  resendClinicInvitationAction,
  updateClinicStaffMembershipStatusAction,
  type ClinicTeamActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { OverflowMenu } from "@/app/(staff)/components/overflow-menu";
import {
  TEAM_ADMIN_ROLE_LABEL,
  TEAM_STAFF_ROLE_LABEL,
  teamMembershipRoleLabel,
} from "@/lib/clinic-portal/role-labels";
import type { InvitedClinicRole } from "@/lib/operator/clinic-invitation-fields";
import type {
  ClinicTeamMember,
  ClinicTeamRow,
} from "@/lib/operator/list-clinic-team";
import { CLINIC_MEMBERSHIP_ROLE } from "@/lib/clinic-portal/membership-role";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

const empty: ClinicTeamActionState = {};
const REMOVE_PENDING_STATUS = "Removing clinic access. Please wait.";
const ROLE_PENDING_STATUS = "Saving role. Please wait.";
const STATUS_PENDING_STATUS = "Updating membership status. Please wait.";

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function statusLabel(row: ClinicTeamRow): string {
  if (row.kind === "member") {
    return row.status === "active" ? "Active" : "Inactive";
  }
  if (row.status === "expired") {
    return "Invitation expired";
  }
  const expires = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(asDate(row.expiresAt));
  return `Invitation pending · expires ${expires}`;
}

function statusTone(
  status: ClinicTeamRow["status"]
): "success" | "warning" | "inactive" {
  if (status === "active") {
    return "success";
  }
  if (status === "inactive") {
    return "inactive";
  }
  return "warning";
}

function memberDisplayName(row: ClinicTeamMember): string {
  return row.name?.trim() || row.email;
}

function closeOverflowMenu(target: EventTarget | null) {
  const menu = (target as HTMLElement | null)?.closest("[popover]");
  if (menu && "hidePopover" in menu && typeof menu.hidePopover === "function") {
    menu.hidePopover();
  }
}

export function ClinicTeamTable({
  clinicId,
  clinicName,
  rows,
}: {
  clinicId: string;
  clinicName: string;
  rows: ClinicTeamRow[];
}) {
  const router = useRouter();
  const reactId = useId().replace(/:/g, "");
  const removeFormId = `remove-clinic-access-${reactId}`;
  const changeRoleFormId = `change-clinic-role-${reactId}`;
  const statusFormId = `clinic-staff-status-${reactId}`;
  const changeRoleFieldId = `change-clinic-role-select-${reactId}`;
  const [removeTarget, setRemoveTarget] = useState<ClinicTeamMember | null>(
    null
  );
  const [roleTarget, setRoleTarget] = useState<ClinicTeamMember | null>(null);
  const [statusTarget, setStatusTarget] = useState<ClinicTeamMember | null>(
    null
  );
  const [statusActive, setStatusActive] = useState(false);
  const [selectedRole, setSelectedRole] = useState<InvitedClinicRole>("STAFF");
  const [resendState, resendAction, resending] = useActionState(
    resendClinicInvitationAction,
    empty
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelClinicInvitationAction,
    empty
  );
  const [removeState, removeAction, removing] = useActionState(
    removeClinicAccessAction,
    empty
  );
  const [changeRoleState, changeRoleAction, changingRole] = useActionState(
    changeClinicMembershipRoleAction,
    empty
  );
  const [statusState, statusAction, changingStatus] = useActionState(
    updateClinicStaffMembershipStatusAction,
    empty
  );

  useEffect(() => {
    if (resendState.success || cancelState.success) {
      router.refresh();
    }
  }, [resendState, cancelState, router]);

  useEffect(() => {
    if (removeState.error) {
      setRemoveTarget(null);
    }
  }, [removeState]);

  useEffect(() => {
    if (changeRoleState.error) {
      setRoleTarget(null);
    }
  }, [changeRoleState]);

  useEffect(() => {
    if (statusState.error) {
      setStatusTarget(null);
    }
  }, [statusState]);

  const error =
    resendState.error ??
    cancelState.error ??
    removeState.error ??
    changeRoleState.error ??
    statusState.error;
  const success = resendState.success ?? cancelState.success;
  const pending =
    resending || cancelling || removing || changingRole || changingStatus;
  const roleUnchanged = roleTarget !== null && selectedRole === roleTarget.role;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-staff-line bg-staff-panel px-5 py-8 text-sm text-staff-muted">
        No team members yet. Invite an administrator or staff member to this
        clinic.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {success ? (
        <p className="text-sm text-staff-ink" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <form id={removeFormId} action={removeAction} className="hidden">
        <input type="hidden" name="clinicId" value={clinicId} />
        <input
          type="hidden"
          name="membershipId"
          value={removeTarget?.membershipId ?? ""}
        />
      </form>
      <form id={changeRoleFormId} action={changeRoleAction} className="hidden">
        <input type="hidden" name="clinicId" value={clinicId} />
        <input
          type="hidden"
          name="membershipId"
          value={roleTarget?.membershipId ?? ""}
        />
        <input type="hidden" name="role" value={selectedRole} />
      </form>
      <form id={statusFormId} action={statusAction} className="hidden">
        <input type="hidden" name="clinicId" value={clinicId} />
        <input
          type="hidden"
          name="membershipId"
          value={statusTarget?.membershipId ?? ""}
        />
        <input
          type="hidden"
          name="active"
          value={statusActive ? "true" : "false"}
        />
      </form>
      <div className="staffOperatorTableWrap">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Clinic team</caption>
          <thead className="border-b border-staff-line text-staff-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.kind}-${row.userId}`}
                className="border-b border-staff-line last:border-0"
                data-active={
                  row.kind === "member" && row.status === "inactive"
                    ? "false"
                    : "true"
                }
              >
                <td className="max-w-[12rem] truncate px-4 py-3">
                  {row.name || "—"}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-3 text-staff-muted">
                  {row.email}
                </td>
                <td className="px-4 py-3">
                  {teamMembershipRoleLabel(row.role)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="staffStatusPill"
                    data-tone={statusTone(row.status)}
                  >
                    {row.status === "active"
                      ? "Active"
                      : row.status === "inactive"
                        ? "Inactive"
                        : row.status === "expired"
                          ? "Invitation expired"
                          : "Pending"}
                  </span>
                  {row.kind === "invitation" ? (
                    <p className="mt-1 text-xs text-staff-muted">
                      {statusLabel(row)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {row.kind === "member" ? (
                    <OverflowMenu
                      label={`Actions for ${memberDisplayName(row)}`}
                      disabled={pending}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="staffOverflowItem"
                        disabled={pending}
                        onClick={(event) => {
                          closeOverflowMenu(event.currentTarget);
                          setRemoveTarget(null);
                          setRoleTarget(row);
                          setSelectedRole(row.role);
                        }}
                      >
                        Change role
                      </button>
                      {row.role === CLINIC_MEMBERSHIP_ROLE.STAFF ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="staffOverflowItem"
                          disabled={pending}
                          onClick={(event) => {
                            closeOverflowMenu(event.currentTarget);
                            setRemoveTarget(null);
                            setRoleTarget(null);
                            setStatusActive(row.status !== "active");
                            setStatusTarget(row);
                          }}
                        >
                          {row.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="staffOverflowItem staffOverflowItemDanger"
                        disabled={pending}
                        onClick={(event) => {
                          closeOverflowMenu(event.currentTarget);
                          setRoleTarget(null);
                          setRemoveTarget(row);
                        }}
                      >
                        Remove access
                      </button>
                    </OverflowMenu>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <form action={resendAction}>
                        <input type="hidden" name="clinicId" value={clinicId} />
                        <input type="hidden" name="userId" value={row.userId} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="staffBtn staffBtnSecondary"
                        >
                          {resending ? "Sending…" : "Resend invitation"}
                        </button>
                      </form>
                      <form action={cancelAction}>
                        <input type="hidden" name="clinicId" value={clinicId} />
                        <input type="hidden" name="userId" value={row.userId} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="staffBtn staffBtnQuiet"
                        >
                          {cancelling ? "Cancelling…" : "Cancel invitation"}
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove access?"
        description={
          removeTarget
            ? `${memberDisplayName(removeTarget)} will immediately lose access to ${clinicName}. Their ${PRODUCT_NAME} account and password will be kept, so access can be restored later.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Remove access"
        pending={removing}
        pendingLabel="Removing…"
        pendingStatus={REMOVE_PENDING_STATUS}
        confirmTone="danger"
        onCancel={() => {
          if (removing) {
            return;
          }
          setRemoveTarget(null);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            removeFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={roleTarget !== null}
        title="Change role"
        description={
          roleTarget
            ? `Choose the access level for ${memberDisplayName(roleTarget)}.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Save role"
        pending={changingRole}
        pendingLabel="Saving…"
        pendingStatus={ROLE_PENDING_STATUS}
        confirmTone="primary"
        confirmDisabled={roleUnchanged}
        onCancel={() => {
          if (changingRole) {
            return;
          }
          setRoleTarget(null);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            changeRoleFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      >
        {roleTarget ? (
          <div className="staffDialogFields">
            <label className="text-sm font-medium" htmlFor={changeRoleFieldId}>
              Role
            </label>
            <select
              id={changeRoleFieldId}
              disabled={changingRole}
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(event.target.value as InvitedClinicRole)
              }
              className="staffSelect h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
            >
              <option value="ADMIN">{TEAM_ADMIN_ROLE_LABEL}</option>
              <option value="STAFF">{TEAM_STAFF_ROLE_LABEL}</option>
            </select>
          </div>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={statusTarget !== null && !statusActive}
        title={
          statusTarget ? `Deactivate ${memberDisplayName(statusTarget)}?` : ""
        }
        description={
          statusTarget
            ? `They will lose access to ${clinicName} until reactivated. Their ${PRODUCT_NAME} account is not deleted.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Deactivate"
        pending={changingStatus}
        pendingLabel="Deactivating…"
        pendingStatus={STATUS_PENDING_STATUS}
        confirmTone="danger"
        onCancel={() => {
          if (changingStatus) {
            return;
          }
          setStatusTarget(null);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            statusFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
      <ConfirmDialog
        open={statusTarget !== null && statusActive}
        title={
          statusTarget ? `Activate ${memberDisplayName(statusTarget)}?` : ""
        }
        description={
          statusTarget
            ? `They will regain access to ${clinicName} with their existing membership.`
            : ""
        }
        cancelLabel="Cancel"
        confirmLabel="Activate"
        pending={changingStatus}
        pendingLabel="Activating…"
        pendingStatus={STATUS_PENDING_STATUS}
        confirmTone="primary"
        onCancel={() => {
          if (changingStatus) {
            return;
          }
          setStatusTarget(null);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            statusFormId
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
    </div>
  );
}
